pragma solidity ^0.8.28;

import {NativeMeetupExpenseSettlementV4} from "./NativeMeetupExpenseSettlementV4.sol";

/// @notice Dedicated v4 factory for Arc Mainnet. This source is separate so preparing
/// the Mainnet artifact cannot change the already-deployed Testnet factory bytecode.
contract NativeMeetupExpenseSettlementV4FactoryMainnet5042 {
    uint256 public constant MAX_PRINCIPAL = 0.01 ether;
    uint256 public constant MAX_CAPACITY = 1;
    address public immutable deploymentOperator;
    bool public hasCreatedEvent;
    mapping(address => bool) public isEvent;
    event EventCreated(address indexed eventAddress, address indexed organizer, bytes32 indexed metadataHash);

    constructor() {
        require(block.chainid == 5042, "Mainnet only");
        deploymentOperator = msg.sender;
    }

    function contractVersion() external pure returns (uint256) { return 4; }

    function createEvent(
        bytes32 metadataHash,
        uint256 fee,
        uint256 capacity,
        uint256 collectDuration,
        uint256 expenseDuration,
        uint256 refundGrace,
        NativeMeetupExpenseSettlementV4.Expense[] calldata expenseSpecs
    ) external returns (address eventAddress) {
        require(msg.sender == deploymentOperator, "Only deployment operator");
        require(!hasCreatedEvent, "Event already created");
        require(collectDuration > 0 && expenseDuration > collectDuration, "Bad durations");
        require(capacity > 0 && capacity <= MAX_CAPACITY && fee * capacity <= MAX_PRINCIPAL, "Outside release limits");
        require(expenseSpecs.length > 0 && expenseSpecs.length <= 20, "Bad expenses");
        NativeMeetupExpenseSettlementV4.Expense[] memory expenses =
            new NativeMeetupExpenseSettlementV4.Expense[](expenseSpecs.length);
        for (uint256 i; i < expenseSpecs.length; i++) {
            expenses[i] = NativeMeetupExpenseSettlementV4.Expense(
                expenseSpecs[i].recipient, expenseSpecs[i].cap, 0, 0, bytes32(0));
        }
        eventAddress = address(new NativeMeetupExpenseSettlementV4(
            msg.sender, metadataHash, fee, capacity,
            block.timestamp + collectDuration,
            block.timestamp + expenseDuration,
            refundGrace, expenses));
        hasCreatedEvent = true;
        isEvent[eventAddress] = true;
        emit EventCreated(eventAddress, msg.sender, metadataHash);
    }
}

