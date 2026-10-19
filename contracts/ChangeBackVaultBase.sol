// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title ChangeBackVaultBase
 * @notice Abstract base that implements all vault logic for a time-bounded shared
 *         USDC budget. Participants contribute during a collection window, approve
 *         payments by on-chain quorum during a spend window, and receive their
 *         proportional share of unspent funds once the spend window ends.
 *
 * Trust model
 * ───────────
 * • Finalization, individual claims, and closure each require an externally
 *   submitted transaction. Any participant or third party may submit them, so no
 *   single actor can permanently block refunds, but execution is not automatic.
 * • A quorum of `threshold` or more participants can approve a payment to any
 *   destination they control. This is the intended shared-budget design; the
 *   contract does not protect participants from the quorum itself.
 * • The guardian can pause the vault, blocking new proposals and executions.
 *   After 24 hours anyone may call finalize() to begin refunds regardless.
 * • `spendUntil` is immutable. Early return sets a boolean flag; it does not
 *   reassign or modify any deadline.
 *
 * @dev Concrete subclass must implement `_usdcToken()` returning the ERC-20
 *      token address. The production subclass hard-codes the USDC address; the
 *      test harness injects a mock address.
 */
abstract contract ChangeBackVaultBase is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────────

    enum ProposalType {
        PAYMENT,
        EARLY_RETURN
    }

    enum Phase {
        Collecting,
        Active,
        Returning,
        Closed
    }

    struct Proposal {
        ProposalType proposalType;
        address destination;
        uint256 amount;
        bytes32 memoHash;
        uint256 expiresAt;
        uint256 approvalCount;
        bool executed;
        bool cancelled;
    }

    // ─── Immutable configuration ─────────────────────────────────────────────

    address[] public participants;
    mapping(address => bool) public isParticipant;

    uint256 public immutable threshold;
    uint256 public immutable collectUntil;
    uint256 public immutable spendUntil;
    address public immutable guardian;

    // ─── Lifecycle flags ─────────────────────────────────────────────────────

    bool public paused;
    uint256 public pausedAt;
    bool public closed;
    bool public earlyReturnExecuted;

    // ─── Accounting ──────────────────────────────────────────────────────────

    uint256 public totalContributions;
    uint256 public totalSpent;
    /// @notice Sum of entitlements not yet paid out. Decremented on each claim.
    uint256 public totalRemainingLiability;
    /// @notice Cumulative amount transferred to participants via claimFor.
    uint256 public totalRefunded;

    bool public finalized;
    uint256 public returnPool;

    mapping(address => uint256) public contributions;
    mapping(address => bool) public claimed;
    mapping(address => uint256) public entitlement;

    // ─── Proposals ───────────────────────────────────────────────────────────

    uint256 public proposalCount;
    mapping(uint256 => Proposal) internal proposals;
    mapping(uint256 => mapping(address => bool)) public proposalVotes;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Deposited(address indexed participant, uint256 amount);
    event ProposalCreated(
        uint256 indexed id,
        ProposalType proposalType,
        address destination,
        uint256 amount,
        uint256 expiresAt
    );
    event Approved(uint256 indexed id, address indexed voter);
    event Revoked(uint256 indexed id, address indexed voter);
    event Executed(uint256 indexed id, address indexed destination, uint256 amount);
    event EarlyReturnExecuted(uint256 indexed id);
    event Paused(address indexed by, uint256 at);
    event Finalized(uint256 returnPool, uint256 totalLiability);
    event Claimed(address indexed participant, uint256 amount);
    event Closed();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address[] memory _participants,
        uint256 _threshold,
        uint256 _collectUntil,
        uint256 _spendUntil,
        address _guardian
    ) {
        require(_participants.length >= 2 && _participants.length <= 20, "Bad participants length");
        require(_threshold >= 2 && _threshold <= _participants.length, "Bad threshold");
        require(_collectUntil > block.timestamp, "Collect in past");
        require(_spendUntil > _collectUntil, "Bad spend deadline");
        require(_spendUntil <= block.timestamp + 90 days, "Spend too far");

        bool guardianFound = false;
        address prev = address(0);

        for (uint256 i = 0; i < _participants.length; i++) {
            address addr = _participants[i];
            require(addr != address(0), "Zero participant");
            require(addr > prev, "Participants not strictly sorted");

            participants.push(addr);
            isParticipant[addr] = true;

            if (addr == _guardian) {
                guardianFound = true;
            }

            prev = addr;
        }

        require(guardianFound, "Guardian not participant");

        threshold    = _threshold;
        collectUntil = _collectUntil;
        spendUntil   = _spendUntil;
        guardian     = _guardian;
    }

    // ─── Abstract hook ────────────────────────────────────────────────────────

    /// @notice Returns the ERC-20 token address used by this vault.
    function _usdcToken() internal view virtual returns (address);

    // ─── Phase ────────────────────────────────────────────────────────────────

    function getPhase() public view returns (Phase) {
        if (closed)                                                return Phase.Closed;
        if (earlyReturnExecuted)                                   return Phase.Returning;
        if (paused && block.timestamp >= pausedAt + 1 days)        return Phase.Returning;
        if (block.timestamp >= spendUntil)                         return Phase.Returning;
        if (block.timestamp >= collectUntil)                       return Phase.Active;
        return Phase.Collecting;
    }

    // ─── Deposit ──────────────────────────────────────────────────────────────

    function deposit(uint256 amount) external nonReentrant {
        require(getPhase() == Phase.Collecting, "Not collecting");
        require(!paused, "Paused");
        require(isParticipant[msg.sender], "Not participant");
        require(amount > 0, "Zero amount");

        IERC20 token = IERC20(_usdcToken());
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        require(received == amount, "Fee-on-transfer rejected");

        contributions[msg.sender] += received;
        totalContributions        += received;

        emit Deposited(msg.sender, received);
    }

    // ─── Proposals ────────────────────────────────────────────────────────────

    function proposePayment(
        address destination,
        uint256 amount,
        bytes32 memoHash,
        uint256 expiresAt
    ) external returns (uint256) {
        require(getPhase() == Phase.Active, "Not active");
        require(!paused, "Paused");
        require(isParticipant[msg.sender], "Not participant");
        require(destination != address(0) && destination != address(this), "Bad destination");
        require(amount > 0, "Zero amount");
        require(expiresAt > block.timestamp, "Expiry in past");
        require(expiresAt <= spendUntil, "Expiry after spend deadline");

        uint256 proposalId = proposalCount++;

        Proposal storage proposal = proposals[proposalId];
        proposal.proposalType = ProposalType.PAYMENT;
        proposal.destination  = destination;
        proposal.amount       = amount;
        proposal.memoHash     = memoHash;
        proposal.expiresAt    = expiresAt;

        emit ProposalCreated(proposalId, ProposalType.PAYMENT, destination, amount, expiresAt);
        return proposalId;
    }

    function proposeEarlyReturn(bytes32 memoHash, uint256 expiresAt) external returns (uint256) {
        require(getPhase() == Phase.Active, "Not active");
        require(!paused, "Paused");
        require(isParticipant[msg.sender], "Not participant");
        require(expiresAt > block.timestamp, "Expiry in past");
        require(expiresAt <= spendUntil, "Expiry after spend deadline");

        uint256 proposalId = proposalCount++;

        Proposal storage proposal = proposals[proposalId];
        proposal.proposalType = ProposalType.EARLY_RETURN;
        proposal.destination  = address(0);
        proposal.amount       = 0;
        proposal.memoHash     = memoHash;
        proposal.expiresAt    = expiresAt;

        emit ProposalCreated(proposalId, ProposalType.EARLY_RETURN, address(0), 0, expiresAt);
        return proposalId;
    }

    // ─── Voting ───────────────────────────────────────────────────────────────

    function approve(uint256 proposalId) external {
        require(getPhase() == Phase.Active, "Not active");
        require(!paused, "Paused");
        require(isParticipant[msg.sender], "Not participant");
        require(proposalId < proposalCount, "Invalid proposal");

        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed && !proposal.cancelled, "Not approvable");
        require(block.timestamp < proposal.expiresAt, "Expired");
        require(!proposalVotes[proposalId][msg.sender], "Already voted");

        proposalVotes[proposalId][msg.sender] = true;
        proposal.approvalCount++;

        emit Approved(proposalId, msg.sender);
    }

    /// @notice Revoke a previously cast vote. Allowed while paused so participants
    ///         can withdraw approvals after a guardian pause.
    function revoke(uint256 proposalId) external {
        require(getPhase() == Phase.Active, "Not active");
        require(isParticipant[msg.sender], "Not participant");
        require(proposalId < proposalCount, "Invalid proposal");

        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Already executed");
        require(proposalVotes[proposalId][msg.sender], "No vote to revoke");

        proposalVotes[proposalId][msg.sender] = false;
        proposal.approvalCount--;

        emit Revoked(proposalId, msg.sender);
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    function execute(uint256 proposalId) external nonReentrant {
        require(getPhase() == Phase.Active, "Not active");
        require(!paused, "Paused");
        require(proposalId < proposalCount, "Invalid proposal");

        Proposal storage proposal = proposals[proposalId];
        require(proposal.proposalType == ProposalType.PAYMENT, "Wrong proposal type");
        require(!proposal.executed && !proposal.cancelled, "Not executable");
        require(block.timestamp < proposal.expiresAt, "Expired");
        require(proposal.approvalCount >= threshold, "Below threshold");
        require(totalContributions - totalSpent >= proposal.amount, "Insufficient accounting balance");

        proposal.executed  = true;
        totalSpent        += proposal.amount;

        IERC20(_usdcToken()).safeTransfer(proposal.destination, proposal.amount);

        emit Executed(proposalId, proposal.destination, proposal.amount);
    }

    /// @notice Execute an early-return proposal. Sets `earlyReturnExecuted = true`,
    ///         which causes `getPhase()` to return Returning. Pending payment proposals
    ///         are globally invalidated by the phase change — `execute()` will revert
    ///         with "Not active" for any of them. The UI should derive proposal
    ///         invalidity from `getPhase()` rather than per-proposal cancelled flags.
    ///         `spendUntil` is unchanged.
    function executeEarlyReturn(uint256 proposalId) external nonReentrant {
        require(getPhase() == Phase.Active, "Not active");
        require(!paused, "Paused");
        require(proposalId < proposalCount, "Invalid proposal");

        Proposal storage proposal = proposals[proposalId];
        require(proposal.proposalType == ProposalType.EARLY_RETURN, "Wrong proposal type");
        require(!proposal.executed && !proposal.cancelled, "Not executable");
        require(block.timestamp < proposal.expiresAt, "Expired");
        require(proposal.approvalCount >= threshold, "Below threshold");

        proposal.executed     = true;
        earlyReturnExecuted   = true;

        emit EarlyReturnExecuted(proposalId);
    }

    // ─── Guardian pause ───────────────────────────────────────────────────────

    function pause() external {
        Phase phase = getPhase();
        require(phase == Phase.Collecting || phase == Phase.Active, "Cannot pause now");
        require(msg.sender == guardian, "Not guardian");
        require(!paused, "Already paused");

        paused   = true;
        pausedAt = block.timestamp;

        emit Paused(guardian, pausedAt);
    }

    // ─── Finalization ─────────────────────────────────────────────────────────

    function finalize() external {
        require(!finalized, "Already finalized");
        require(getPhase() == Phase.Returning, "Cannot finalize yet");
        _finalize();
    }

    /// @notice Transfer a participant's refund entitlement to their address.
    ///         Zero-entitlement participants receive 0 USDC but their claimed
    ///         flag is set, so they do not prevent close().
    function claimFor(address participant) external nonReentrant {
        require(!closed, "Vault closed");
        _ensureFinalized();
        require(isParticipant[participant], "Not participant");
        require(!claimed[participant], "Already claimed");

        uint256 amount = entitlement[participant];
        claimed[participant] = true;

        if (amount > 0) {
            totalRemainingLiability -= amount;
            totalRefunded           += amount;
            IERC20(_usdcToken()).safeTransfer(participant, amount);
        }

        emit Claimed(participant, amount);
    }

    /// @notice Close the vault after all refund liabilities are settled.
    ///         Requires Returning phase and zero remaining liability.
    ///         Zero-entitlement participants do not block close even if unclaimed.
    function close() external {
        require(getPhase() == Phase.Returning, "Not in returning phase");
        require(!closed, "Already closed");
        _ensureFinalized();
        require(totalRemainingLiability == 0, "Liabilities outstanding");

        closed = true;
        emit Closed();
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getProposal(uint256 id)
        external
        view
        returns (
            ProposalType proposalType,
            address destination,
            uint256 amount,
            bytes32 memoHash,
            uint256 expiresAt,
            uint256 approvalCount,
            bool executed,
            bool cancelled
        )
    {
        require(id < proposalCount, "Invalid proposal");
        Proposal storage proposal = proposals[id];
        return (
            proposal.proposalType,
            proposal.destination,
            proposal.amount,
            proposal.memoHash,
            proposal.expiresAt,
            proposal.approvalCount,
            proposal.executed,
            proposal.cancelled
        );
    }

    function participantCount() external view returns (uint256) {
        return participants.length;
    }

    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return proposalVotes[proposalId][voter];
    }

    function getEntitlement(address participant) external view returns (uint256) {
        return entitlement[participant];
    }

    /// @notice USDC held by this vault that exceeds its outstanding obligations.
    ///         Tokens sent directly via ERC-20 transfer (bypassing deposit) are
    ///         "stranded surplus" — they are not counted in entitlements and have
    ///         no recovery path in v1.
    ///         Post-finalize: outstanding obligations = totalRemainingLiability.
    ///         Pre-finalize:  outstanding obligations = totalContributions - totalSpent.
    function strandedSurplus() external view returns (uint256) {
        uint256 balance = IERC20(_usdcToken()).balanceOf(address(this));
        uint256 obligations = finalized
            ? totalRemainingLiability
            : (totalContributions - totalSpent);
        return balance > obligations ? balance - obligations : 0;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _ensureFinalized() internal {
        if (!finalized) {
            require(getPhase() == Phase.Returning, "Not claimable yet");
            _finalize();
        }
    }

    /// @dev Snapshot the return pool and compute per-participant entitlements
    ///      using the telescoping floor-division formula, which guarantees
    ///      sum(entitlements) == returnPool exactly with no dust residual.
    ///      Solvency check: the vault must hold at least returnPool tokens before
    ///      entitlements are committed.
    function _finalize() internal {
        uint256 pool = totalContributions - totalSpent;
        require(
            IERC20(_usdcToken()).balanceOf(address(this)) >= pool,
            "Vault underfunded"
        );

        finalized    = true;
        returnPool   = pool;
        totalRemainingLiability = 0;

        uint256 totalWeight   = totalContributions;
        uint256 cumulativeWeight = 0;
        uint256 previousFloor = 0;

        for (uint256 i = 0; i < participants.length; i++) {
            address participant = participants[i];
            cumulativeWeight += contributions[participant];

            uint256 currentFloor = totalWeight == 0
                ? 0
                : Math.mulDiv(pool, cumulativeWeight, totalWeight);
            uint256 share = currentFloor - previousFloor;

            entitlement[participant] = share;
            totalRemainingLiability += share;

            previousFloor = currentFloor;
        }

        // Accounting invariant: spent + refunded-so-far + remaining = total.
        // At first finalization totalRefunded is always zero.
        assert(totalSpent + totalRefunded + totalRemainingLiability == totalContributions);

        emit Finalized(returnPool, totalRemainingLiability);
    }
}
