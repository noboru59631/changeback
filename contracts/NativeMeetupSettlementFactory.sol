pragma solidity ^0.8.28;

import {
    NativeMeetupSettlementEscrowBase,
    NativeMeetupSettlementEscrowTestnet5042002,
    NativeMeetupSettlementEscrowMainnet5042
} from "./NativeMeetupSettlementEscrow.sol";

abstract contract NativeMeetupSettlementFactoryBase {
    mapping(address => bool) public isEvent;
    event EventCreated(address indexed escrow, address indexed organizer, bytes32 indexed metadataHash);

    function contractVersion() external pure returns (uint256) { return 3; }

    function createEvent(NativeMeetupSettlementEscrowBase.Terms calldata terms,
        NativeMeetupSettlementEscrowBase.Budget[] calldata budgets) external returns (address escrow) {
        escrow = _deploy(msg.sender, terms, budgets);
        isEvent[escrow] = true;
        emit EventCreated(escrow, msg.sender, terms.metadataHash);
    }

    function createEventWithDurations(bytes32 metadataHash, uint256 fee, uint256 capacity,
        uint256 collectDuration, uint256 spendDuration, bool showStaffAmounts,
        NativeMeetupSettlementEscrowBase.Budget[] calldata relativeBudgets) external returns (address escrow) {
        require(collectDuration > 0 && spendDuration > collectDuration && spendDuration <= 90 days,
            "Bad durations");
        NativeMeetupSettlementEscrowBase.Terms memory terms = NativeMeetupSettlementEscrowBase.Terms(
            metadataHash, fee, capacity, block.timestamp + collectDuration,
            block.timestamp + spendDuration, showStaffAmounts);
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = relativeBudgets;
        for (uint256 budgetId; budgetId < budgets.length; budgetId++) {
            if (budgets[budgetId].automatic) {
                require(budgets[budgetId].payAfter >= collectDuration
                    && budgets[budgetId].payAfter < spendDuration, "Bad payment offset");
                budgets[budgetId].payAfter += block.timestamp;
            }
        }
        escrow = _deploy(msg.sender, terms, budgets);
        isEvent[escrow] = true;
        emit EventCreated(escrow, msg.sender, metadataHash);
    }

    function _deploy(address organizer, NativeMeetupSettlementEscrowBase.Terms memory terms,
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets) internal virtual returns (address);
}

contract NativeMeetupSettlementFactoryTestnet5042002 is NativeMeetupSettlementFactoryBase {
    constructor() { require(block.chainid == 5042002, "Testnet only"); }

    function _deploy(address organizer, NativeMeetupSettlementEscrowBase.Terms memory terms,
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets) internal override returns (address) {
        return address(new NativeMeetupSettlementEscrowTestnet5042002(organizer, terms, budgets));
    }
}

contract NativeMeetupSettlementFactoryMainnet5042 is NativeMeetupSettlementFactoryBase {
    address public immutable deploymentOperator;
    uint256 public constant MAX_PRINCIPAL = 3e16;
    uint256 public constant MAX_CAPACITY = 3;
    bool public hasCreatedEvent;

    constructor() {
        require(block.chainid == 5042, "Mainnet only");
        deploymentOperator = msg.sender;
    }

    function _deploy(address organizer, NativeMeetupSettlementEscrowBase.Terms memory terms,
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets) internal override returns (address) {
        require(organizer == deploymentOperator, "Only deployment operator");
        require(!hasCreatedEvent, "Mainnet event already created");
        require(terms.capacity > 0 && terms.capacity <= MAX_CAPACITY, "Mainnet capacity");
        require(terms.fee <= MAX_PRINCIPAL / terms.capacity, "Mainnet principal cap");
        hasCreatedEvent = true;
        return address(new NativeMeetupSettlementEscrowMainnet5042(organizer, terms, budgets));
    }
}

