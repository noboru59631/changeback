pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {NativeMeetupEscrowBase, NativeMeetupEscrowTestnet} from "../NativeMeetupEscrow.sol";
import {NativeMeetupFactoryTestnet} from "../NativeMeetupFactory.sol";
import {MockERC20} from "./MockERC20.sol";

contract NativeEscrowHarness is NativeMeetupEscrowBase {
    constructor(address organizer_, Terms memory terms_, Budget[] memory budgets_)
        NativeMeetupEscrowBase(organizer_, terms_, budgets_) {}
}

contract NativeRefundReceiver {
    bool public blocked = true;
    function pay(address escrow) external payable {
        (bool success,) = escrow.call{value: msg.value}("");
        require(success, "Pay failed");
    }
    function unblock() external { blocked = false; }
    receive() external payable { require(!blocked, "Blocked"); }
}

contract NativeReentrantReceiver {
    NativeMeetupEscrowBase public escrow;
    bool public reentered;
    function pay(NativeMeetupEscrowBase escrow_) external payable {
        escrow = escrow_;
        (bool success,) = address(escrow_).call{value: msg.value}("");
        require(success);
    }
    receive() external payable {
        try escrow.refundFor(address(this)) { reentered = true; } catch {}
    }
}

contract NativeMeetupEscrowTest is Test {
    NativeEscrowHarness escrow;
    address organizer = address(0x100);
    address alice = address(0x101);
    address bob = address(0x102);
    address carol = address(0x103);
    address venue = address(0x201);
    address staff = address(0x202);
    uint256 collectUntil;
    uint256 spendUntil;

    function setUp() public {
        collectUntil = block.timestamp + 1 hours;
        spendUntil = block.timestamp + 2 hours;
        escrow = new NativeEscrowHarness(organizer, _terms(), _budgets());
        _approve(alice);
        _approve(bob);
        _approve(carol);
        vm.deal(address(this), 1000 ether);
    }

    function _terms() internal view returns (NativeMeetupEscrowBase.Terms memory) {
        return NativeMeetupEscrowBase.Terms(keccak256("terms"), 10 ether, 100,
            collectUntil, spendUntil, false);
    }

    function _budgets() internal view returns (NativeMeetupEscrowBase.Budget[] memory budgets) {
        budgets = new NativeMeetupEscrowBase.Budget[](2);
        budgets[0] = NativeMeetupEscrowBase.Budget(payable(venue), 12 ether, 0, collectUntil, true);
        budgets[1] = NativeMeetupEscrowBase.Budget(payable(staff), 2 ether, 2, 0, false);
    }

    function _approve(address payer) internal {
        vm.prank(organizer);
        escrow.approveApplicant(payer, keccak256(abi.encode(payer)), collectUntil);
    }

    function _pay(address payer, uint256 amount) internal {
        vm.deal(payer, amount);
        vm.prank(payer);
        (bool success, bytes memory reason) = address(escrow).call{value: amount}("");
        if (!success) assembly { revert(add(reason, 32), mload(reason)) }
    }

    function _finish() internal {
        vm.warp(spendUntil);
        escrow.finalize();
    }

    function test_OneOrdinaryNativeTransferCreatesAccountingAndFixedRefund() public {
        _pay(alice, 10 ether);
        _pay(bob, 10 ether);
        _pay(carol, 10 ether);
        vm.warp(collectUntil);
        escrow.executeScheduled(0);
        vm.prank(organizer);
        escrow.spend(1, 2 ether, keccak256("completed"));
        vm.prank(organizer);
        escrow.finalize();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        escrow.refundFor(carol);
        assertEq(escrow.totalCollected(), 30 ether);
        assertEq(escrow.totalSpent(), 14 ether);
        assertEq(escrow.totalRefunded(), 16 ether);
        assertEq(escrow.remainingLiability(), 0);
        assertEq(address(escrow).balance, 0);
        assertEq(venue.balance, 12 ether);
        assertEq(staff.balance, 2 ether);
        assertEq(alice.balance + bob.balance + carol.balance, 16 ether);
        vm.expectRevert("Not refundable");
        escrow.refundFor(alice);
    }

    function test_UnknownSenderAndLateTransferRevertAtomically() public {
        vm.expectRevert("Not approved");
        _pay(address(0x999), 1 ether);
        vm.warp(collectUntil);
        vm.expectRevert("Collection closed");
        _pay(alice, 1 ether);
        assertEq(address(escrow).balance, 0);
        assertEq(escrow.totalCollected(), 0);
    }

    function test_OverpaymentAndPartialPaymentAreFullyReserved() public {
        _pay(alice, 13 ether);
        _pay(bob, 4 ether);
        vm.warp(collectUntil);
        vm.expectRevert("Reserved payments");
        escrow.executeScheduled(0);
        _finish();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        assertEq(alice.balance, 13 ether);
        assertEq(bob.balance, 4 ether);
    }

    function test_TopupsCrossFeeOnceAndPreserveEveryNativeUnit() public {
        _pay(alice, 4 ether);
        _pay(alice, 6 ether + 1);
        _pay(alice, 2 ether + 1);
        assertEq(escrow.paidCount(), 1);
        (,uint256 paid,,uint256 transfers,,) = escrow.members(alice);
        assertEq(paid, 12 ether + 2);
        assertEq(transfers, 3);
        _finish();
        uint256 before = alice.balance;
        escrow.refundFor(alice);
        assertEq(alice.balance - before, 12 ether + 2);
    }

    function test_RegistrationCannotRedirectRefundOrReplacePaidPayer() public {
        vm.prank(bob);
        vm.expectRevert("Only organizer");
        escrow.approveApplicant(alice, keccak256("fake"), collectUntil);
        _pay(alice, 1 ether);
        vm.prank(organizer);
        vm.expectRevert("Not unpaid applicant");
        escrow.revokeUnpaid(alice);
        vm.prank(organizer);
        vm.expectRevert("Already approved");
        escrow.approveApplicant(alice, keccak256("replacement"), collectUntil);
        _finish();
        uint256 before = bob.balance;
        vm.prank(bob);
        escrow.refundFor(alice);
        assertEq(bob.balance, before);
        assertEq(alice.balance, 1 ether);
    }

    function test_ExpiredUnpaidApprovalCanBeReclaimedWithoutOrganizer() public {
        address applicant = address(0x555);
        vm.prank(organizer);
        escrow.approveApplicant(applicant, keccak256("applicant"), block.timestamp + 10);
        vm.warp(block.timestamp + 10);
        vm.expectRevert("Approval expired");
        _pay(applicant, 1 ether);
        escrow.revokeUnpaid(applicant);
        assertEq(escrow.participantCount(), 3);
        _approve(applicant);
        _pay(applicant, 1 ether);
    }

    function test_FailedRefundIsolatedThenRetrySameSender() public {
        NativeRefundReceiver receiver = new NativeRefundReceiver();
        _approve(address(receiver));
        receiver.pay{value: 10 ether}(address(escrow));
        _pay(alice, 10 ether);
        _finish();
        address[] memory payers = new address[](2);
        payers[0] = address(receiver);
        payers[1] = alice;
        escrow.refundBatch(payers);
        assertEq(alice.balance, 10 ether);
        assertEq(escrow.remainingLiability(), 10 ether);
        receiver.unblock();
        escrow.refundFor(address(receiver));
        assertEq(address(receiver).balance, 10 ether);
        assertEq(escrow.remainingLiability(), 0);
    }

    function test_ReentrancyCannotClaimTwice() public {
        NativeReentrantReceiver receiver = new NativeReentrantReceiver();
        _approve(address(receiver));
        receiver.pay{value: 10 ether}(escrow);
        _finish();
        escrow.refundFor(address(receiver));
        assertFalse(receiver.reentered());
        assertEq(address(receiver).balance, 10 ether);
        assertEq(escrow.totalRefunded(), 10 ether);
    }

    function test_RouterPaymentCreditsActualSenderNotTransactionOrigin() public {
        NativeRefundReceiver router = new NativeRefundReceiver();
        vm.expectRevert("Pay failed");
        router.pay{value: 10 ether}(address(escrow));
        assertEq(escrow.totalCollected(), 0);
        _approve(address(router));
        router.pay{value: 10 ether}(address(escrow));
        (,uint256 routerPaid,,,,) = escrow.members(address(router));
        (,uint256 alicePaid,,,,) = escrow.members(alice);
        assertEq(routerPaid, 10 ether);
        assertEq(alicePaid, 0);
        _finish();
        router.unblock();
        uint256 callerBefore = address(this).balance;
        escrow.refundFor(address(router));
        assertEq(address(router).balance, 10 ether);
        assertEq(address(this).balance, callerBefore);
    }

    function test_FailedRefundPreservesClaimAndAllAccountingUntilRetry() public {
        NativeRefundReceiver receiver = new NativeRefundReceiver();
        _approve(address(receiver));
        receiver.pay{value: 10 ether}(address(escrow));
        _finish();
        vm.expectRevert("Native send failed");
        escrow.refundFor(address(receiver));
        (,,uint256 entitlement,,,bool claimed) = escrow.members(address(receiver));
        assertEq(entitlement, 10 ether);
        assertFalse(claimed);
        assertEq(escrow.remainingLiability(), 10 ether);
        assertEq(escrow.totalRefunded(), 0);
        assertEq(address(escrow).balance, 10 ether);
        receiver.unblock();
        escrow.refundFor(address(receiver));
        assertEq(escrow.remainingLiability(), 0);
        assertEq(escrow.totalRefunded(), 10 ether);
        assertEq(address(escrow).balance, 0);
    }

    function test_ReservedExcessAndShortCannotFundOverspendDespiteUnaccountedBalance() public {
        _pay(alice, 13 ether);
        _pay(bob, 4 ether);
        vm.deal(address(escrow), 100 ether);
        vm.warp(collectUntil);
        vm.prank(organizer);
        escrow.spend(1, 2 ether, keccak256("staff"));
        vm.expectRevert("Reserved payments");
        escrow.executeScheduled(0);
        _finish();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        assertEq(alice.balance, 11 ether);
        assertEq(bob.balance, 4 ether);
        assertEq(escrow.totalSpent(), 2 ether);
        assertEq(escrow.totalRefunded(), 15 ether);
        assertEq(escrow.remainingLiability(), 0);
        assertEq(escrow.unaccountedBalance(), 83 ether);
    }

    function test_UnaccountedBalanceCannotBeSpentOrSwept() public {
        _pay(alice, 10 ether);
        vm.deal(address(escrow), 100 ether);
        vm.warp(collectUntil);
        vm.expectRevert("Reserved payments");
        escrow.executeScheduled(0);
        _finish();
        escrow.refundFor(alice);
        assertEq(escrow.unaccountedBalance(), 90 ether);
        assertEq(escrow.totalRefunded(), 10 ether);
    }

    function test_OrdinaryERC20TransferDoesNotCreateAccounting() public {
        MockERC20 token = new MockERC20("USDC", "USDC", 6);
        token.mint(alice, 10e6);
        vm.prank(alice);
        token.transfer(address(escrow), 10e6);
        assertEq(escrow.totalCollected(), 0);
        assertEq(token.balanceOf(address(escrow)), 10e6);
    }

    function test_StaffRequiresOrganizerAndFullFixedAmount() public {
        _pay(alice, 10 ether);
        vm.warp(collectUntil);
        vm.expectRevert("Only organizer");
        escrow.spend(1, 2 ether, bytes32(0));
        vm.prank(organizer);
        vm.expectRevert("Fixed staff payment");
        escrow.spend(1, 1 ether, bytes32(0));
        vm.prank(organizer);
        escrow.spend(1, 2 ether, bytes32(0));
        vm.prank(organizer);
        vm.expectRevert("Budget cap");
        escrow.spend(1, 1, bytes32(0));
    }

    function test_KeeperDownDeadlineAllowsAnyoneToFinalizeAndRefund() public {
        _pay(alice, 10 ether);
        vm.warp(collectUntil);
        vm.expectRevert("Wait for deadline");
        escrow.finalize();
        _finish();
        escrow.refundFor(alice);
        assertEq(alice.balance, 10 ether);
    }

    function test_ZeroPaymentAndCalldataRejected() public {
        vm.expectRevert("Zero payment");
        _pay(alice, 0);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool success,) = address(escrow).call{value: 1 ether}(hex"01");
        assertFalse(success);
        assertEq(escrow.totalCollected(), 0);
    }

    function test_TestnetContractsRejectMainnet() public {
        vm.chainId(5042);
        vm.expectRevert("Testnet only");
        new NativeMeetupEscrowTestnet(organizer, _terms(), _budgets());
        vm.expectRevert("Testnet only");
        new NativeMeetupFactoryTestnet();
    }

    function test_ManualVenueResidualPaymentRespectsCap() public {
        NativeMeetupEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].automatic = false;
        escrow = new NativeEscrowHarness(organizer, _terms(), budgets);
        _approve(alice);
        _approve(bob);
        _pay(alice, 10 ether);
        _pay(bob, 10 ether);
        vm.warp(collectUntil);
        vm.startPrank(organizer);
        escrow.spend(0, 7 ether, keccak256("partial invoice"));
        escrow.spend(0, 5 ether, keccak256("residual invoice"));
        vm.expectRevert("Budget cap");
        escrow.spend(0, 1, bytes32(0));
        vm.stopPrank();
        assertEq(venue.balance, 12 ether);
    }

    function test_MaxCapacityFinalizationIsBoundedAndSlotsCannotBeExhaustedByOutsider() public {
        for (uint256 index = 3; index < 100; index++) {
            address payer = address(uint160(0x1000 + index));
            _approve(payer);
            _pay(payer, 10 ether);
        }
        vm.prank(organizer);
        vm.expectRevert(bytes("Full"));
        escrow.approveApplicant(address(0x9999), keccak256("overflow"), collectUntil);
        vm.warp(spendUntil);
        uint256 before = gasleft();
        escrow.finalize();
        assertLt(before - gasleft(), 5_000_000);
        assertEq(escrow.remainingLiability(), 970 ether);
    }

    function testFuzz_ConservationIncludingExcessShortAndDust(uint128 aliceAmount,
        uint128 bobAmount, uint128 spendSeed) public {
        uint256 first = bound(aliceAmount, 1, 30 ether);
        uint256 second = bound(bobAmount, 1, 30 ether);
        _pay(alice, first);
        _pay(bob, second);
        vm.warp(collectUntil);
        if (escrow.paidCount() * 10 ether >= 12 ether && spendSeed % 2 == 0) escrow.executeScheduled(0);
        _finish();
        uint256 spending = escrow.totalSpent();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        assertEq(spending + escrow.totalRefunded(), first + second);
        assertEq(escrow.remainingLiability(), 0);
        assertEq(address(escrow).balance, 0);
    }
}
