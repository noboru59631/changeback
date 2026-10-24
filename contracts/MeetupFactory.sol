pragma solidity ^0.8.28;

import {MeetupEscrowBase, MeetupEscrowTestnet} from "./MeetupEscrow.sol";

contract MeetupFactoryTestnet {
    mapping(address => bool) public isEvent;

    event EventCreated(address indexed escrow, address indexed organizer, bytes32 indexed metadataHash);

    constructor() {
        require(block.chainid == 5042002, "Testnet only");
    }

    function createEvent(MeetupEscrowBase.Terms calldata terms, MeetupEscrowBase.Budget[] calldata budgets)
        external returns (address escrow)
    {
        escrow = address(new MeetupEscrowTestnet(msg.sender, terms, budgets));
        isEvent[escrow] = true;
        emit EventCreated(escrow, msg.sender, terms.metadataHash);
    }
}
