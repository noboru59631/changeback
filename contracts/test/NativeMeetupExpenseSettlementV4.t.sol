pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {NativeMeetupExpenseSettlementV4} from "../NativeMeetupExpenseSettlementV4.sol";

contract NativeMeetupExpenseSettlementV4Test is Test {
    NativeMeetupExpenseSettlementV4 eventV4;
    address organizer = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xB0C);
    address venue = address(0xC0FFEE);

    function setUp() public {
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        NativeMeetupExpenseSettlementV4.Expense[] memory expenses = new NativeMeetupExpenseSettlementV4.Expense[](2);
        expenses[0] = NativeMeetupExpenseSettlementV4.Expense(payable(venue), 12 ether, 0, 0, bytes32(0));
        expenses[1] = NativeMeetupExpenseSettlementV4.Expense(payable(address(0xD00D)), 8 ether, 0, 0, bytes32(0));
        eventV4 = new NativeMeetupExpenseSettlementV4(
            organizer, keccak256("event"), 10 ether, 2, block.timestamp + 1 days,
            block.timestamp + 2 days, 30 days, expenses);
        vm.prank(organizer); eventV4.approveParticipant(alice, keccak256("alice"));
        vm.prank(organizer); eventV4.approveParticipant(bob, keccak256("bob"));
    }

    function testCollectApproveActualPayAndRefundRemainder() public {
        vm.prank(alice); (bool paidA,) = address(eventV4).call{value: 10 ether}(""); assertTrue(paidA);
        vm.prank(bob); (bool paidB,) = address(eventV4).call{value: 10 ether}(""); assertTrue(paidB);
        vm.prank(organizer); eventV4.approveExpense(0, 7 ether, keccak256("receipt"));
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice); eventV4.payApprovedExpense(0);
        assertEq(venue.balance, 7 ether);
        vm.warp(block.timestamp + 1 days);
        eventV4.finalize();
        assertEq(eventV4.remainingLiability(), 13 ether);
        eventV4.claimRefund(alice);
        eventV4.claimRefund(bob);
        assertEq(alice.balance, 96.5 ether);
        assertEq(bob.balance, 96.5 ether);
        assertEq(eventV4.remainingLiability(), 0);
        assertEq(address(eventV4).balance, 0);
    }

    function testCannotOverpayOrExceedCollectedPrincipal() public {
        vm.prank(alice); (bool paid,) = address(eventV4).call{value: 10 ether}(""); assertTrue(paid);
        vm.prank(organizer); eventV4.approveExpense(0, 8 ether, bytes32(0));
        vm.prank(organizer); vm.expectRevert("Exceeds collected principal"); eventV4.approveExpense(1, 8 ether, bytes32(0));
        vm.prank(alice); (bool ok,) = address(eventV4).call{value: 1 ether}("");
        assertFalse(ok);
    }

    function testPendingApprovedExpenseBlocksFinalizationUntilPaidOrReset() public {
        vm.prank(alice); (bool paid,) = address(eventV4).call{value: 10 ether}(""); assertTrue(paid);
        vm.prank(organizer); eventV4.approveExpense(0, 5 ether, bytes32(0));
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert("Approved expense pending"); eventV4.finalize();
        vm.prank(organizer); eventV4.cancelExpenseApproval(0);
        eventV4.finalize();
        assertEq(eventV4.remainingLiability(), 10 ether);
    }

    function testRefundFailureDoesNotConsumeClaim() public {
        vm.prank(alice); (bool paid,) = address(eventV4).call{value: 10 ether}(""); assertTrue(paid);
        vm.warp(block.timestamp + 2 days); eventV4.finalize();
        vm.expectRevert("Not refundable"); eventV4.claimRefund(venue);
        (,,, bool claimed) = eventV4.members(alice);
        assertFalse(claimed);
    }

    function testSharedLinkJoinRegistersAndPaysInOneAction() public {
        NativeMeetupExpenseSettlementV4.Expense[] memory expenses = new NativeMeetupExpenseSettlementV4.Expense[](1);
        expenses[0] = NativeMeetupExpenseSettlementV4.Expense(payable(venue), 6 ether, 0, 0, bytes32(0));
        NativeMeetupExpenseSettlementV4 shared = new NativeMeetupExpenseSettlementV4(
            organizer, keccak256("shared"), 10 ether, 2, block.timestamp + 1 days,
            block.timestamp + 2 days, 30 days, expenses);
        vm.prank(alice); shared.join{value: 10 ether}(keccak256("alice"));
        assertEq(shared.participantCount(), 1);
        assertEq(shared.participants(0), alice);
        (, uint256 paid,,) = shared.members(alice);
        assertEq(paid, 10 ether);
        assertEq(shared.totalCollected(), 10 ether);
        vm.prank(alice); vm.expectRevert("Already joined or bad name");
        shared.join{value: 10 ether}(keccak256("alice-again"));
    }
}


