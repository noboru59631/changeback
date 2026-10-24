pragma solidity ^0.8.28;

import {NativeMeetupEscrowBase, NativeMeetupEscrowTestnet} from "./NativeMeetupEscrow.sol";

contract NativeMeetupFactoryTestnet {
    mapping(address => bool) public isEvent;
    event EventCreated(address indexed escrow, address indexed organizer, bytes32 indexed metadataHash);

    constructor() { require(block.chainid == 5042002, "Testnet only"); }

    function createEvent(NativeMeetupEscrowBase.Terms calldata terms,
        NativeMeetupEscrowBase.Budget[] calldata budgets) external returns (address escrow) {
        escrow = address(new NativeMeetupEscrowTestnet(msg.sender, terms, budgets));
        isEvent[escrow] = true;
        emit EventCreated(escrow, msg.sender, terms.metadataHash);
    }
}
