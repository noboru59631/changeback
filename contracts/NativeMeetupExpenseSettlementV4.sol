pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Bounded native-USDC settlement: collect first, approve actual expenses later,
/// pay only approved fixed recipients, then return the exact remainder to original payers.
contract NativeMeetupExpenseSettlementV4 is ReentrancyGuard {
    struct Expense {
        address payable recipient;
        uint256 cap;
        uint256 approvedAmount;
        uint256 paidAmount;
        bytes32 receiptHash;
    }

    struct Member {
        bytes32 nameHash;
        uint256 paid;
        uint256 refund;
        bool claimed;
    }

    address public immutable organizer;
    bytes32 public immutable metadataHash;
    uint256 public immutable fee;
    uint256 public immutable capacity;
    uint256 public immutable collectUntil;
    uint256 public immutable expenseUntil;
    uint256 public immutable refundClaimDeadline;

    Expense[] public expenses;
    address[] public participants;
    mapping(address => uint256) private participantIndex;
    mapping(address => Member) public members;

    uint256 public totalCollected;
    uint256 public totalApprovedExpenses;
    uint256 public totalSpent;
    uint256 public totalRefunded;
    uint256 public remainingLiability;
    bool public finalized;

    event ParticipantApproved(address indexed participant, bytes32 nameHash);
    event NativePaid(address indexed participant, uint256 amount);
    event ExpenseApproved(uint256 indexed expenseId, uint256 amount, bytes32 receiptHash);
    event ExpenseApprovalCancelled(uint256 indexed expenseId, uint256 amount);
    event ExpensePaid(uint256 indexed expenseId, address indexed recipient, uint256 amount, bytes32 receiptHash);
    event Finalized(uint256 refundPool, uint256 liability);
    event Refunded(address indexed participant, uint256 amount);

    constructor(
        address organizer_,
        bytes32 metadataHash_,
        uint256 fee_,
        uint256 capacity_,
        uint256 collectUntil_,
        uint256 expenseUntil_,
        uint256 refundGrace,
        Expense[] memory expenses_
    ) {
        require(organizer_ != address(0), "Zero organizer");
        require(metadataHash_ != bytes32(0), "Missing metadata");
        require(fee_ > 0 && capacity_ > 0 && capacity_ <= 100, "Bad terms");
        require(collectUntil_ > block.timestamp && expenseUntil_ > collectUntil_, "Bad deadlines");
        require(expenseUntil_ <= block.timestamp + 90 days, "Deadline too far");
        require(refundGrace > 0 && refundGrace <= 90 days, "Bad refund grace");
        require(expenses_.length > 0 && expenses_.length <= 20, "Bad expenses");

        uint256 aggregateCap;
        for (uint256 i; i < expenses_.length; i++) {
            Expense memory expense = expenses_[i];
            require(expense.recipient != address(0) && expense.recipient != address(this), "Bad recipient");
            require(expense.cap > 0, "Bad expense cap");
            aggregateCap += expense.cap;
            expenses.push(Expense(expense.recipient, expense.cap, 0, 0, bytes32(0)));
        }
        require(aggregateCap <= fee_ * capacity_, "Caps exceed principal");

        organizer = organizer_;
        metadataHash = metadataHash_;
        fee = fee_;
        capacity = capacity_;
        collectUntil = collectUntil_;
        expenseUntil = expenseUntil_;
        refundClaimDeadline = expenseUntil_ + refundGrace;
    }

    function contractVersion() external pure returns (uint256) { return 4; }
    function participantCount() external view returns (uint256) { return participants.length; }
    function expenseCount() external view returns (uint256) { return expenses.length; }

    function approveParticipant(address participant, bytes32 nameHash) external {
        require(msg.sender == organizer, "Only organizer");
        require(block.timestamp < collectUntil && !finalized, "Collection closed");
        require(participant != address(0) && participantIndex[participant] == 0 && nameHash != bytes32(0), "Bad participant");
        require(participants.length < capacity, "Capacity reached");
        participants.push(participant);
        participantIndex[participant] = participants.length;
        members[participant] = Member(nameHash, 0, 0, false);
        emit ParticipantApproved(participant, nameHash);
    }

    /// @notice Shared-link path: a participant occupies one seat and pays in one wallet action.
    /// Expense approval and all outgoing value remain organizer/contract controlled.
    function join(bytes32 nameHash) external payable nonReentrant {
        require(!finalized && block.timestamp < collectUntil, "Collection closed");
        require(participantIndex[msg.sender] == 0 && nameHash != bytes32(0), "Already joined or bad name");
        require(participants.length < capacity, "Capacity reached");
        require(msg.value == fee, "Exact fee required");
        participants.push(msg.sender);
        participantIndex[msg.sender] = participants.length;
        members[msg.sender] = Member(nameHash, msg.value, 0, false);
        totalCollected += msg.value;
        emit ParticipantApproved(msg.sender, nameHash);
        emit NativePaid(msg.sender, msg.value);
    }

    receive() external payable nonReentrant {
        require(!finalized && block.timestamp < collectUntil, "Collection closed");
        require(participantIndex[msg.sender] != 0, "Not approved");
        Member storage member = members[msg.sender];
        require(member.paid == 0 && msg.value == fee, "Exact one-time fee required");
        member.paid = msg.value;
        totalCollected += msg.value;
        emit NativePaid(msg.sender, msg.value);
    }

    /// @notice Organizer records the actual approved amount; the fixed recipient and cap are immutable.
    function approveExpense(uint256 expenseId, uint256 amount, bytes32 receiptHash) external {
        require(msg.sender == organizer, "Only organizer");
        require(!finalized && block.timestamp < expenseUntil, "Expense approval closed");
        Expense storage expense = expenses[expenseId];
        require(expense.paidAmount == 0 && amount <= expense.cap, "Over cap or already paid");
        uint256 nextTotal = totalApprovedExpenses - expense.approvedAmount + amount;
        require(nextTotal <= totalCollected, "Exceeds collected principal");
        totalApprovedExpenses = nextTotal;
        expense.approvedAmount = amount;
        expense.receiptHash = receiptHash;
        emit ExpenseApproved(expenseId, amount, receiptHash);
    }

    /// @notice Anyone may submit a previously approved payment, including the keeper.
    function payApprovedExpense(uint256 expenseId) external nonReentrant {
        require(!finalized && block.timestamp >= collectUntil && block.timestamp < expenseUntil, "Not payable");
        Expense storage expense = expenses[expenseId];
        require(expense.approvedAmount > 0 && expense.paidAmount == 0, "Not approved or already paid");
        uint256 amount = expense.approvedAmount;
        require(totalSpent + amount <= totalCollected, "Insufficient collected principal");
        expense.paidAmount = amount;
        totalSpent += amount;
        totalApprovedExpenses -= amount;
        (bool success,) = expense.recipient.call{value: amount}("");
        require(success, "Expense transfer failed");
        emit ExpensePaid(expenseId, expense.recipient, amount, expense.receiptHash);
    }

    /// @notice A failed or abandoned approval can be cancelled after the deadline without changing
    /// the immutable recipient or cap. This prevents an unpaid approval from blocking refunds.
    function cancelExpenseApproval(uint256 expenseId) external {
        require(msg.sender == organizer, "Only organizer");
        Expense storage expense = expenses[expenseId];
        require(expense.paidAmount == 0 && expense.approvedAmount > 0, "No pending approval");
        uint256 amount = expense.approvedAmount;
        expense.approvedAmount = 0;
        expense.receiptHash = bytes32(0);
        totalApprovedExpenses -= amount;
        emit ExpenseApprovalCancelled(expenseId, amount);
    }

    /// @notice No expense can be added after the deadline; the remainder is then fixed for refunds.
    function finalize() external nonReentrant {
        require(!finalized && block.timestamp >= expenseUntil, "Expense deadline not reached");
        require(totalApprovedExpenses == 0, "Approved expense pending");
        require(address(this).balance >= totalCollected - totalSpent, "Insolvent");
        finalized = true;
        uint256 refundPool = totalCollected - totalSpent;
        uint256 allocated;
        for (uint256 i; i < participants.length; i++) {
            Member storage member = members[participants[i]];
            uint256 refund = totalCollected == 0 || member.paid == 0
                ? 0
                : i + 1 == participants.length
                    ? refundPool - allocated
                    : (refundPool * member.paid) / totalCollected;
            member.refund = refund;
            allocated += refund;
            remainingLiability += refund;
        }
        emit Finalized(refundPool, remainingLiability);
    }

    /// @notice Permissionless claim preserves the original participant as the only recipient.
    function claimRefund(address participant) external nonReentrant {
        require(finalized, "Not finalized");
        Member storage member = members[participant];
        require(participantIndex[participant] != 0 && !member.claimed, "Not refundable");
        member.claimed = true;
        remainingLiability -= member.refund;
        totalRefunded += member.refund;
        if (member.refund > 0) {
            (bool success,) = payable(participant).call{value: member.refund}("");
            require(success, "Refund transfer failed");
        }
        emit Refunded(participant, member.refund);
    }

    function unaccountedBalance() external view returns (uint256) {
        uint256 liability = totalCollected - totalSpent - totalRefunded;
        return address(this).balance > liability ? address(this).balance - liability : 0;
    }
}

