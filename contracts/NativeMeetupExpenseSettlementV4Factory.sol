pragma solidity ^0.8.28;

import {NativeMeetupExpenseSettlementV4} from "./NativeMeetupExpenseSettlementV4.sol";

/// @notice Separate v4 factory. It is intentionally not connected to the v3 factory or UI allowlist.
contract NativeMeetupExpenseSettlementV4FactoryTestnet5042002 {
    mapping(address => bool) public isEvent;
    event EventCreated(address indexed eventAddress, address indexed organizer, bytes32 indexed metadataHash);

    constructor() { require(block.chainid == 5042002, "Testnet only"); }

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
        require(collectDuration > 0 && expenseDuration > collectDuration, "Bad durations");
        require(expenseSpecs.length > 0 && expenseSpecs.length <= 20, "Bad expenses");
        NativeMeetupExpenseSettlementV4.Expense[] memory expenses = new NativeMeetupExpenseSettlementV4.Expense[](expenseSpecs.length);
        for (uint256 i; i < expenseSpecs.length; i++) {
            expenses[i] = NativeMeetupExpenseSettlementV4.Expense(expenseSpecs[i].recipient, expenseSpecs[i].cap, 0, 0, bytes32(0));
        }
        eventAddress = address(new NativeMeetupExpenseSettlementV4(
            msg.sender, metadataHash, fee, capacity,
            block.timestamp + collectDuration,
            block.timestamp + expenseDuration,
            refundGrace, expenses));
        isEvent[eventAddress] = true;
        emit EventCreated(eventAddress, msg.sender, metadataHash);
    }
}

