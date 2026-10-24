pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MeetupFactoryTestnet} from "../MeetupFactory.sol";
import {MeetupEscrowBase, MeetupEscrowTestnet} from "../MeetupEscrow.sol";

contract MeetupFactoryTest is Test {
    function test_FactoryBindsOrganizerAndRejectsUnknownEvent() public {
        vm.chainId(5042002);
        MeetupFactoryTestnet factory = new MeetupFactoryTestnet();
        MeetupEscrowBase.Budget[] memory budgets = new MeetupEscrowBase.Budget[](1);
        budgets[0] = MeetupEscrowBase.Budget(address(0x9000), 10e6, 0, 0, false);
        address organizer = address(0x1000);
        vm.prank(organizer);
        address escrow = factory.createEvent(MeetupEscrowBase.Terms(keccak256("terms"), 10e6,
            3, block.timestamp + 1 hours, block.timestamp + 1 days, false), budgets);
        assertTrue(factory.isEvent(escrow));
        assertFalse(factory.isEvent(address(0xdead)));
        assertEq(MeetupEscrowTestnet(escrow).organizer(), organizer);
    }

    function test_FactoryCannotDeployOnMainnet() public {
        vm.chainId(5042);
        vm.expectRevert("Testnet only");
        new MeetupFactoryTestnet();
    }
}
