pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract NativeMeetupSettlementEscrowBase is ReentrancyGuard {
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
    uint256 public immutable settlementUntil;
    uint256 public reservedStaff;
    mapping(uint256 => bool) public staffAuthorized;
    mapping(uint256 => bytes32) public staffReceiptHash;

    event StaffAuthorized(uint256 indexed budgetId, address indexed recipient, uint256 amount, bytes32 receiptHash);
    event StaffAuthorizationCancelled(uint256 indexed budgetId, uint256 amount);
    event StaffAuthorizationExpired(uint256 indexed budgetId, address indexed recipient, uint256 amount);

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
        settlementUntil = terms_.spendUntil + 24 hours;
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
        _validatePayment(member);
        bool wasFull = member.paid >= terms.fee;
        member.paid += msg.value;
        member.transfers++;
        totalCollected += msg.value;
        if (!wasFull && member.paid >= terms.fee) paidCount++;
        emit NativePaid(msg.sender, msg.value, member.paid);
    }

    function _validatePayment(Member storage) internal view virtual {}

    function spend(uint256 budgetId, uint256 amount, bytes32 receiptHash) external nonReentrant {
        require(msg.sender == organizer, "Only organizer");
        require(budgets[budgetId].category != 2, "Staff authorization required");
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
        require(budget.category != 2, "Staff authorization required");
        require(totalSpent + reservedStaff + amount <= paidCount * terms.fee, "Reserved payments");
        budgetSpent[budgetId] += amount;
        totalSpent += amount;
        _send(budget.recipient, amount);
        emit Expense(budgetId, budget.recipient, amount, receiptHash);
    }

    function contractVersion() external pure returns (uint256) { return 3; }

    function authorizeStaff(uint256 budgetId, bytes32 receiptHash) external nonReentrant {
        require(msg.sender == organizer, "Only organizer");
        require(!finalized && block.timestamp < terms.spendUntil, "Authorization closed");
        Budget memory budget = budgets[budgetId];
        require(budget.category == 2, "Not staff");
        require(!staffAuthorized[budgetId] && budgetSpent[budgetId] == 0, "Already authorized or paid");
        require(totalSpent + reservedStaff + budget.cap <= paidCount * terms.fee, "Reserved payments");
        staffAuthorized[budgetId] = true;
        staffReceiptHash[budgetId] = receiptHash;
        reservedStaff += budget.cap;
        emit StaffAuthorized(budgetId, budget.recipient, budget.cap, receiptHash);
    }

    function cancelStaffAuthorization(uint256 budgetId) external nonReentrant {
        require(msg.sender == organizer, "Only organizer");
        require(!finalized && block.timestamp < terms.collectUntil, "Cancellation closed");
        require(staffAuthorized[budgetId], "Not authorized");
        staffAuthorized[budgetId] = false;
        reservedStaff -= budgets[budgetId].cap;
        delete staffReceiptHash[budgetId];
        emit StaffAuthorizationCancelled(budgetId, budgets[budgetId].cap);
    }

    function executeAuthorizedStaff(uint256 budgetId) external nonReentrant {
        require(!finalized && block.timestamp >= terms.collectUntil && block.timestamp < settlementUntil,
            "Not settling");
        require(staffAuthorized[budgetId], "Not authorized");
        Budget memory budget = budgets[budgetId];
        staffAuthorized[budgetId] = false;
        reservedStaff -= budget.cap;
        budgetSpent[budgetId] = budget.cap;
        totalSpent += budget.cap;
        _send(budget.recipient, budget.cap);
        emit Expense(budgetId, budget.recipient, budget.cap, staffReceiptHash[budgetId]);
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
        if (block.timestamp < settlementUntil) {
            require(reservedStaff == 0, "Staff payments pending");
        } else if (reservedStaff > 0) {
            for (uint256 budgetId; budgetId < budgets.length; budgetId++) {
                if (staffAuthorized[budgetId]) {
                    staffAuthorized[budgetId] = false;
                    reservedStaff -= budgets[budgetId].cap;
                    emit StaffAuthorizationExpired(budgetId, budgets[budgetId].recipient, budgets[budgetId].cap);
                }
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

contract NativeMeetupSettlementEscrowTestnet5042002 is NativeMeetupSettlementEscrowBase {
    constructor(address organizer_, Terms memory terms_, Budget[] memory budgets_)
        NativeMeetupSettlementEscrowBase(organizer_, terms_, budgets_) {
        require(block.chainid == 5042002, "Testnet only");
    }
}

contract NativeMeetupSettlementEscrowMainnet5042 is NativeMeetupSettlementEscrowBase {
    uint256 public constant MAX_PRINCIPAL = 3e16;
    uint256 public constant MAX_CAPACITY = 3;

    constructor(address organizer_, Terms memory terms_, Budget[] memory budgets_)
        NativeMeetupSettlementEscrowBase(organizer_, terms_, budgets_) {
        require(block.chainid == 5042, "Mainnet only");
        require(terms_.capacity <= MAX_CAPACITY, "Mainnet capacity");
        require(terms_.fee <= MAX_PRINCIPAL / terms_.capacity, "Mainnet principal cap");
    }

    function _validatePayment(Member storage member) internal view override {
        require(member.paid == 0, "Mainnet already paid");
        require(msg.value == terms.fee, "Mainnet exact payment");
        require(totalCollected + msg.value <= MAX_PRINCIPAL, "Mainnet deposit cap");
    }
}


