pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract NativeMeetupEscrowBase is ReentrancyGuard {
    struct Terms {
        bytes32 metadataHash;
        uint256 fee;
        uint256 capacity;
        uint256 collectUntil;
        uint256 spendUntil;
        bool showStaffAmounts;
    }

    struct Budget {
        address payable recipient;
        uint256 cap;
        uint8 category;
        uint256 payAfter;
        bool automatic;
    }

    struct Member {
        bytes32 nameHash;
        uint256 paid;
        uint256 entitlement;
        uint256 transfers;
        uint256 approvalUntil;
        bool claimed;
    }

    address public immutable organizer;
    uint256 public immutable createdAtBlock;
    Terms public terms;
    Budget[] public budgets;
    address[] public participants;
    mapping(address => Member) public members;
    mapping(address => uint256) private participantIndex;
    mapping(uint256 => uint256) public budgetSpent;
    uint256 public totalCollected;
    uint256 public totalSpent;
    uint256 public totalRefunded;
    uint256 public remainingLiability;
    uint256 public paidCount;
    bool public finalized;

    event Approved(address indexed payer, bytes32 nameHash, uint256 approvalUntil);
    event ApprovalRevoked(address indexed payer);
    event NativePaid(address indexed payer, uint256 amount, uint256 cumulative);
    event Expense(uint256 indexed budgetId, address indexed recipient, uint256 amount, bytes32 receiptHash);
    event Finalized(uint256 refundPool);
    event Refunded(address indexed payer, uint256 amount);
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

    function approveApplicant(address payer, bytes32 nameHash, uint256 approvalUntil) external {
        require(msg.sender == organizer, "Only organizer");
        require(block.timestamp < terms.collectUntil && !finalized, "Registration closed");
        require(payer != address(0) && payer != address(this) && nameHash != bytes32(0), "Bad applicant");
        require(approvalUntil > block.timestamp && approvalUntil <= terms.collectUntil, "Bad expiry");
        require(participantIndex[payer] == 0, "Already approved");
        require(participants.length < terms.capacity, "Full");
        participants.push(payer);
        participantIndex[payer] = participants.length;
        members[payer] = Member(nameHash, 0, 0, 0, approvalUntil, false);
        emit Approved(payer, nameHash, approvalUntil);
    }

    function revokeUnpaid(address payer) external {
        require(!finalized && block.timestamp < terms.collectUntil, "Registration closed");
        Member memory member = members[payer];
        require(participantIndex[payer] != 0 && member.paid == 0, "Not unpaid applicant");
        require(msg.sender == organizer || block.timestamp >= member.approvalUntil, "Approval active");
        uint256 index = participantIndex[payer] - 1;
        address last = participants[participants.length - 1];
        participants[index] = last;
        participantIndex[last] = index + 1;
        participants.pop();
        delete participantIndex[payer];
        delete members[payer];
        emit ApprovalRevoked(payer);
    }

    receive() external payable nonReentrant {
        require(!finalized && block.timestamp < terms.collectUntil, "Collection closed");
        Member storage member = members[msg.sender];
        require(participantIndex[msg.sender] != 0, "Not approved");
        require(block.timestamp < member.approvalUntil || member.paid > 0, "Approval expired");
        require(msg.value > 0, "Zero payment");
        bool wasFull = member.paid >= terms.fee;
        member.paid += msg.value;
        member.transfers++;
        totalCollected += msg.value;
        if (!wasFull && member.paid >= terms.fee) paidCount++;
        emit NativePaid(msg.sender, msg.value, member.paid);
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
        require(totalSpent + amount <= paidCount * terms.fee, "Reserved payments");
        budgetSpent[budgetId] += amount;
        totalSpent += amount;
        _send(budget.recipient, amount);
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
        require(address(this).balance >= totalCollected - totalSpent, "Insolvent");
        finalized = true;
        uint256 fullPool = paidCount * terms.fee - totalSpent;
        uint256 fullIndex;
        uint256 previousFloor;
        for (uint256 memberId; memberId < participants.length; memberId++) {
            Member storage member = members[participants[memberId]];
            if (member.paid >= terms.fee) {
                fullIndex++;
                uint256 currentFloor = Math.mulDiv(fullPool, fullIndex, paidCount);
                member.entitlement = member.paid - terms.fee + currentFloor - previousFloor;
                previousFloor = currentFloor;
            } else {
                member.entitlement = member.paid;
            }
            remainingLiability += member.entitlement;
        }
        assert(totalSpent + remainingLiability == totalCollected);
        emit Finalized(remainingLiability);
    }

    function refundFor(address payer) external nonReentrant {
        require(finalized, "Not finalized");
        Member storage member = members[payer];
        require(participantIndex[payer] != 0 && !member.claimed, "Not refundable");
        member.claimed = true;
        remainingLiability -= member.entitlement;
        totalRefunded += member.entitlement;
        if (member.entitlement > 0) _send(payable(payer), member.entitlement);
        emit Refunded(payer, member.entitlement);
    }

    function refundBatch(address[] calldata payers) external {
        require(finalized && payers.length > 0 && payers.length <= 20, "Bad batch");
        for (uint256 payerId; payerId < payers.length; payerId++) {
            require(gasleft() > 240_000, "Insufficient batch gas");
            try this.refundFor{gas: 200_000}(payers[payerId]) {} catch (bytes memory reason) {
                emit RefundFailed(payers[payerId], keccak256(reason));
            }
        }
    }

    function _send(address payable recipient, uint256 amount) internal {
        (bool success,) = recipient.call{value: amount, gas: 100_000}("");
        require(success, "Native send failed");
    }

    function unaccountedBalance() external view returns (uint256) {
        uint256 liability = totalCollected - totalSpent - totalRefunded;
        return address(this).balance > liability ? address(this).balance - liability : 0;
    }

    function participantCount() external view returns (uint256) { return participants.length; }
    function budgetCount() external view returns (uint256) { return budgets.length; }
}

contract NativeMeetupEscrowTestnet is NativeMeetupEscrowBase {
    constructor(address organizer_, Terms memory terms_, Budget[] memory budgets_)
        NativeMeetupEscrowBase(organizer_, terms_, budgets_) {
        require(block.chainid == 5042002, "Testnet only");
    }
}
