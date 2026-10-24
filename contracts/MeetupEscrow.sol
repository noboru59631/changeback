pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IReceiveAuthorization {
    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter,
        uint256 validBefore, bytes32 nonce, uint8 signatureV, bytes32 signatureR, bytes32 signatureS) external;
}

abstract contract MeetupEscrowBase is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Terms {
        bytes32 metadataHash;
        uint256 fee;
        uint256 capacity;
        uint256 collectUntil;
        uint256 spendUntil;
        bool showStaffAmounts;
    }

    struct Budget {
        address recipient;
        uint256 cap;
        uint8 category;
        uint256 payAfter;
        bool automatic;
    }

    struct Member {
        address refundTo;
        bytes32 nameHash;
        uint256 paid;
        uint256 entitlement;
        bool claimed;
    }

    address public immutable organizer;
    uint256 public immutable createdAtBlock;
    Terms public terms;
    Budget[] public budgets;
    address[] public participants;
    mapping(address => Member) public members;
    mapping(uint256 => uint256) public budgetSpent;
    uint256 public totalCollected;
    uint256 public totalSpent;
    uint256 public totalRefunded;
    uint256 public remainingLiability;
    uint256 public paidCount;
    bool public finalized;

    event Registered(address indexed payer, address indexed refundTo, bytes32 nameHash);
    event Paid(address indexed payer, uint256 amount, uint256 cumulative);
    event Expense(uint256 indexed budgetId, address indexed recipient, uint256 amount, bytes32 receiptHash);
    event Finalized(uint256 refundPool);
    event Refunded(address indexed payer, address indexed refundTo, uint256 amount);
    event RefundDestination(address indexed payer, address indexed refundTo);
    event RefundFailed(address indexed payer, bytes32 reasonHash);

    constructor(address organizer_, Terms memory terms_, Budget[] memory budgets_) {
        require(organizer_ != address(0), "Zero organizer");
        require(terms_.metadataHash != bytes32(0), "Missing terms");
        require(terms_.fee > 0 && terms_.fee <= type(uint128).max, "Bad fee");
        require(terms_.capacity > 0 && terms_.capacity <= 100, "Bad capacity");
        require(terms_.collectUntil > block.timestamp && terms_.spendUntil > terms_.collectUntil,
            "Bad deadlines");
        require(terms_.spendUntil <= block.timestamp + 90 days, "Too far");
        require(budgets_.length > 0 && budgets_.length <= 20, "Bad budgets");
        uint256 aggregate;
        for (uint256 budgetId; budgetId < budgets_.length; budgetId++) {
            Budget memory budget = budgets_[budgetId];
            require(budget.recipient != address(0) && budget.recipient != address(this), "Bad recipient");
            require(budget.cap > 0 && budget.category <= 2, "Bad budget");
            require(!budget.automatic || (budget.category != 2 && budget.payAfter >= terms_.collectUntil
                && budget.payAfter < terms_.spendUntil), "Bad automatic payment");
            aggregate += budget.cap;
            budgets.push(budget);
        }
        require(aggregate <= terms_.fee * terms_.capacity, "Budget exceeds capacity");
        organizer = organizer_;
        createdAtBlock = block.number;
        terms = terms_;
    }

    function _token() internal view virtual returns (address);

    function register(bytes32 nameHash, address refundTo) external {
        require(block.timestamp < terms.collectUntil && !finalized, "Registration closed");
        require(refundTo != address(0) && refundTo != address(this), "Bad refund address");
        require(nameHash != bytes32(0), "Missing name");
        require(members[msg.sender].refundTo == address(0), "Already registered");
        require(participants.length < terms.capacity, "Full");
        participants.push(msg.sender);
        members[msg.sender] = Member(refundTo, nameHash, 0, 0, false);
        emit Registered(msg.sender, refundTo, nameHash);
    }

    function pay(uint256 amount) external nonReentrant {
        _checkPayment(msg.sender, amount);
        IERC20 token = IERC20(_token());
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        require(token.balanceOf(address(this)) - beforeBalance == amount, "Unsupported token");
        _record(msg.sender, amount);
    }

    function payWithAuthorization(address payer, uint256 amount, uint256 validAfter, uint256 validBefore,
        bytes32 nonce, uint8 signatureV, bytes32 signatureR, bytes32 signatureS) external nonReentrant {
        _checkPayment(payer, amount);
        uint256 beforeBalance = IERC20(_token()).balanceOf(address(this));
        IReceiveAuthorization(_token()).receiveWithAuthorization(payer, address(this), amount,
            validAfter, validBefore, nonce, signatureV, signatureR, signatureS);
        require(IERC20(_token()).balanceOf(address(this)) - beforeBalance == amount, "Unsupported token");
        _record(payer, amount);
    }

    function _checkPayment(address payer, uint256 amount) internal view {
        require(block.timestamp < terms.collectUntil && !finalized, "Collection closed");
        Member storage member = members[payer];
        require(member.refundTo != address(0), "Register first");
        require(amount > 0 && amount <= terms.fee - member.paid, "Overpayment or duplicate");
    }

    function _record(address payer, uint256 amount) internal {
        Member storage member = members[payer];
        member.paid += amount;
        totalCollected += amount;
        if (member.paid == terms.fee) paidCount++;
        emit Paid(payer, amount, member.paid);
    }

    function spend(uint256 budgetId, uint256 amount, bytes32 receiptHash) external nonReentrant {
        require(msg.sender == organizer, "Only organizer");
        require(!budgets[budgetId].automatic, "Scheduled budget");
        _spend(budgetId, amount, receiptHash);
    }

    function executeScheduled(uint256 budgetId) external nonReentrant {
        Budget memory budget = budgets[budgetId];
        require(budget.automatic && block.timestamp >= budget.payAfter, "Not scheduled");
        require(budgetSpent[budgetId] == 0, "Already paid");
        _spend(budgetId, budget.cap, bytes32(0));
    }

    function _spend(uint256 budgetId, uint256 amount, bytes32 receiptHash) internal {
        require(!finalized && block.timestamp >= terms.collectUntil && block.timestamp < terms.spendUntil,
            "Not spending");
        Budget memory budget = budgets[budgetId];
        require(amount > 0 && amount <= budget.cap - budgetSpent[budgetId], "Budget cap");
        require(budget.category != 2 || (budgetSpent[budgetId] == 0 && amount == budget.cap),
            "Fixed staff payment");
        require(totalSpent + amount <= paidCount * terms.fee, "Partial payments reserved");
        budgetSpent[budgetId] += amount;
        totalSpent += amount;
        IERC20(_token()).safeTransfer(budget.recipient, amount);
        emit Expense(budgetId, budget.recipient, amount, receiptHash);
    }

    function finalize() external nonReentrant {
        require(!finalized && block.timestamp >= terms.collectUntil, "Cannot finalize");
        require(msg.sender == organizer || block.timestamp >= terms.spendUntil, "Wait for deadline");
        if (block.timestamp < terms.spendUntil) {
            for (uint256 budgetId; budgetId < budgets.length; budgetId++) {
                require(!budgets[budgetId].automatic || budgetSpent[budgetId] == budgets[budgetId].cap,
                    "Scheduled payments pending");
            }
        }
        require(IERC20(_token()).balanceOf(address(this)) >= totalCollected - totalSpent, "Insolvent");
        finalized = true;
        uint256 fullPool = paidCount * terms.fee - totalSpent;
        uint256 fullIndex;
        uint256 previousFloor;
        for (uint256 memberId; memberId < participants.length; memberId++) {
            Member storage member = members[participants[memberId]];
            if (member.paid == terms.fee) {
                fullIndex++;
                uint256 currentFloor = Math.mulDiv(fullPool, fullIndex, paidCount);
                member.entitlement = currentFloor - previousFloor;
                previousFloor = currentFloor;
            } else {
                member.entitlement = member.paid;
            }
            remainingLiability += member.entitlement;
        }
        assert(totalSpent + remainingLiability == totalCollected);
        emit Finalized(remainingLiability);
    }

    function setRefundDestination(address refundTo) external {
        Member storage member = members[msg.sender];
        require(member.refundTo != address(0) && !member.claimed, "Not changeable");
        require(refundTo != address(0) && refundTo != address(this), "Bad refund address");
        member.refundTo = refundTo;
        emit RefundDestination(msg.sender, refundTo);
    }

    function refundFor(address payer) external nonReentrant {
        require(finalized, "Not finalized");
        Member storage member = members[payer];
        require(member.refundTo != address(0) && !member.claimed, "Not refundable");
        member.claimed = true;
        remainingLiability -= member.entitlement;
        totalRefunded += member.entitlement;
        if (member.entitlement > 0) IERC20(_token()).safeTransfer(member.refundTo, member.entitlement);
        emit Refunded(payer, member.refundTo, member.entitlement);
    }

    function refundBatch(address[] calldata payers) external {
        require(finalized, "Not finalized");
        require(payers.length > 0 && payers.length <= 20, "Bad batch size");
        for (uint256 payerId; payerId < payers.length; payerId++) {
            require(gasleft() > 240_000, "Insufficient batch gas");
            try this.refundFor{gas: 200_000}(payers[payerId]) {} catch (bytes memory reason) {
                emit RefundFailed(payers[payerId], keccak256(reason));
            }
        }
    }

    function unaccountedBalance() external view returns (uint256) {
        uint256 liability = totalCollected - totalSpent - totalRefunded;
        uint256 balance = IERC20(_token()).balanceOf(address(this));
        return balance > liability ? balance - liability : 0;
    }

    function participantCount() external view returns (uint256) { return participants.length; }
    function budgetCount() external view returns (uint256) { return budgets.length; }
}

contract MeetupEscrowTestnet is MeetupEscrowBase {
    constructor(address organizer_, Terms memory terms_, Budget[] memory budgets_)
        MeetupEscrowBase(organizer_, terms_, budgets_) {
        require(block.chainid == 5042002, "Testnet only");
    }

    function _token() internal pure override returns (address) {
        return 0x3600000000000000000000000000000000000000;
    }
}
