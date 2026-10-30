pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {NativeMeetupSettlementEscrowBase, NativeMeetupSettlementEscrowTestnet5042002} from "../NativeMeetupSettlementEscrow.sol";
import {NativeMeetupSettlementFactoryTestnet5042002} from "../NativeMeetupSettlementFactory.sol";
import {MockERC20} from "./MockERC20.sol";

contract SettlementEscrowHarness is NativeMeetupSettlementEscrowBase {
    constructor(address organizer_, Terms memory terms_, Budget[] memory budgets_)
        NativeMeetupSettlementEscrowBase(organizer_, terms_, budgets_) {}
}

contract SettlementRefundReceiver {
    bool public blocked = true;
    function pay(address escrow) external payable {
        (bool success,) = escrow.call{value: msg.value}("");
        require(success, "Pay failed");
    }
    function unblock() external { blocked = false; }
    receive() external payable { require(!blocked, "Blocked"); }
}

contract SettlementReentrantReceiver {
    NativeMeetupSettlementEscrowBase public escrow;
    bool public reentered;
    function pay(NativeMeetupSettlementEscrowBase escrow_) external payable {
        escrow = escrow_;
        (bool success,) = address(escrow_).call{value: msg.value}("");
        require(success);
    }
    receive() external payable {
        try escrow.refundFor(address(this)) { reentered = true; } catch {}
    }
}

contract NativeMeetupSettlementEscrowTest is Test {
    SettlementEscrowHarness escrow;
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
        escrow = new SettlementEscrowHarness(organizer, _terms(), _budgets());
        _approve(alice);
        _approve(bob);
        _approve(carol);
        vm.deal(address(this), 1000 ether);
    }

    function _terms() internal view returns (NativeMeetupSettlementEscrowBase.Terms memory) {
        return NativeMeetupSettlementEscrowBase.Terms(keccak256("terms"), 10 ether, 100,
            collectUntil, spendUntil, false);
    }

    function _budgets() internal view returns (NativeMeetupSettlementEscrowBase.Budget[] memory budgets) {
        budgets = new NativeMeetupSettlementEscrowBase.Budget[](2);
        budgets[0] = NativeMeetupSettlementEscrowBase.Budget(payable(venue), 12 ether, 0, collectUntil, true);
        budgets[1] = NativeMeetupSettlementEscrowBase.Budget(payable(staff), 2 ether, 2, 0, false);
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
        escrow.authorizeStaff(1, keccak256("completed"));
        escrow.executeAuthorizedStaff(1);
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
        SettlementRefundReceiver receiver = new SettlementRefundReceiver();
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
        SettlementReentrantReceiver receiver = new SettlementReentrantReceiver();
        _approve(address(receiver));
        receiver.pay{value: 10 ether}(escrow);
        _finish();
        escrow.refundFor(address(receiver));
        assertFalse(receiver.reentered());
        assertEq(address(receiver).balance, 10 ether);
        assertEq(escrow.totalRefunded(), 10 ether);
    }

    function test_RouterPaymentCreditsActualSenderNotTransactionOrigin() public {
        SettlementRefundReceiver router = new SettlementRefundReceiver();
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
        SettlementRefundReceiver receiver = new SettlementRefundReceiver();
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
        escrow.authorizeStaff(1, keccak256("staff"));
        escrow.executeAuthorizedStaff(1);
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

    function test_StaffRequiresAuthorizationAndCannotBypassOrDoublePay() public {
        _pay(alice, 10 ether);
        vm.expectRevert("Only organizer");
        escrow.authorizeStaff(1, bytes32(0));
        vm.prank(organizer);
        escrow.authorizeStaff(1, keccak256("work"));
        vm.prank(organizer);
        vm.expectRevert("Already authorized or paid");
        escrow.authorizeStaff(1, bytes32(0));
        vm.warp(collectUntil);
        vm.prank(organizer);
        vm.expectRevert("Staff authorization required");
        escrow.spend(1, 2 ether, bytes32(0));
        vm.prank(organizer);
        vm.expectRevert("Staff authorization required");
        escrow.spend(1, 1 ether, bytes32(0));
        escrow.executeAuthorizedStaff(1);
        assertFalse(escrow.staffAuthorized(1));
        assertEq(escrow.reservedStaff(), 0);
        assertEq(escrow.budgetSpent(1), 2 ether);
        vm.expectRevert("Not authorized");
        escrow.executeAuthorizedStaff(1);
        vm.prank(organizer);
        vm.expectRevert("Already authorized or paid");
        escrow.authorizeStaff(1, bytes32(0));
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
        new NativeMeetupSettlementEscrowTestnet5042002(organizer, _terms(), _budgets());
        vm.expectRevert("Testnet only");
        new NativeMeetupSettlementFactoryTestnet5042002();
    }

    function test_ManualVenueResidualPaymentRespectsCap() public {
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].automatic = false;
        escrow = new SettlementEscrowHarness(organizer, _terms(), budgets);
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

    function _fundThirty() internal {
        _pay(alice, 10 ether);
        _pay(bob, 10 ether);
        _pay(carol, 10 ether);
    }

    function _authorize() internal {
        vm.prank(organizer);
        escrow.authorizeStaff(1, keccak256("completed staff"));
    }

    function _refundThree() internal {
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        escrow.refundFor(carol);
        assertEq(escrow.remainingLiability(), 0);
        assertEq(escrow.totalSpent() + escrow.totalRefunded(), escrow.totalCollected());
    }

    function test_LateKeeper72Minutes46SecondsStillPaysAndConserves30Equals12Plus2Plus16() public {
        _fundThirty();
        _authorize();
        vm.warp(collectUntil);
        escrow.executeScheduled(0);
        vm.warp(spendUntil + 72 minutes + 46 seconds);
        vm.expectRevert("Staff payments pending");
        escrow.finalize();
        vm.prank(bob);
        escrow.executeAuthorizedStaff(1);
        vm.prank(carol);
        escrow.finalize();
        _refundThree();
        assertEq(venue.balance, 12 ether);
        assertEq(staff.balance, 2 ether);
        assertEq(escrow.totalRefunded(), 16 ether);
        assertEq(alice.balance + bob.balance + carol.balance, 16 ether);
        assertEq(address(escrow).balance, 0);
    }

    function test_Expiry30Equals12Plus18EmitsAndReturnsToOriginalSenders() public {
        _fundThirty();
        _authorize();
        vm.warp(collectUntil);
        escrow.executeScheduled(0);
        vm.warp(escrow.settlementUntil() - 1);
        vm.prank(organizer);
        vm.expectRevert("Staff payments pending");
        escrow.finalize();
        vm.warp(escrow.settlementUntil());
        vm.expectEmit(true, true, false, true, address(escrow));
        emit StaffAuthorizationExpired(1, staff, 2 ether);
        vm.prank(bob);
        escrow.finalize();
        assertEq(escrow.reservedStaff(), 0);
        assertFalse(escrow.staffAuthorized(1));
        assertEq(escrow.budgetSpent(1), 0);
        _refundThree();
        assertEq(staff.balance, 0);
        assertEq(venue.balance, 12 ether);
        assertEq(alice.balance, 6 ether);
        assertEq(bob.balance, 6 ether);
        assertEq(carol.balance, 6 ether);
        assertEq(escrow.totalRefunded(), 18 ether);
        vm.expectRevert("Not settling");
        escrow.executeAuthorizedStaff(1);
    }

    event StaffAuthorizationExpired(uint256 indexed budgetId, address indexed recipient, uint256 amount);

    function test_CollectionBoundaryLocksCancellationAndStartsExecution() public {
        _pay(alice, 10 ether);
        _authorize();
        vm.expectRevert("Not settling");
        escrow.executeAuthorizedStaff(1);
        vm.prank(bob);
        vm.expectRevert("Only organizer");
        escrow.cancelStaffAuthorization(1);
        vm.prank(organizer);
        vm.expectRevert("Not authorized");
        escrow.cancelStaffAuthorization(0);
        vm.warp(collectUntil - 1);
        vm.prank(organizer);
        escrow.cancelStaffAuthorization(1);
        assertEq(escrow.reservedStaff(), 0);
        assertFalse(escrow.staffAuthorized(1));
        assertEq(escrow.staffReceiptHash(1), bytes32(0));
        _authorize();
        vm.warp(collectUntil);
        vm.prank(organizer);
        vm.expectRevert("Cancellation closed");
        escrow.cancelStaffAuthorization(1);
        escrow.executeAuthorizedStaff(1);
        assertEq(staff.balance, 2 ether);
    }

    function test_SpendBoundaryClosesAuthorizationAndVenueButKeepsStaffExecution() public {
        _fundThirty();
        vm.warp(spendUntil - 1);
        _authorize();
        vm.warp(spendUntil);
        vm.prank(organizer);
        vm.expectRevert("Authorization closed");
        escrow.authorizeStaff(1, bytes32(0));
        vm.expectRevert("Not spending");
        escrow.executeScheduled(0);
        vm.prank(organizer);
        vm.expectRevert("Scheduled budget");
        escrow.spend(0, 1 ether, bytes32(0));
        escrow.executeAuthorizedStaff(1);
        escrow.finalize();
        assertEq(escrow.remainingLiability(), 28 ether);
    }

    function test_StaffExecutesAtLastGraceSecondButNotExactExpiry() public {
        _pay(alice, 10 ether);
        _authorize();
        vm.warp(escrow.settlementUntil() - 1);
        escrow.executeAuthorizedStaff(1);
        assertEq(staff.balance, 2 ether);
    }

    function test_ExactExpiryRejectsStaffExecutionBeforeFinalization() public {
        _pay(alice, 10 ether);
        _authorize();
        vm.warp(escrow.settlementUntil());
        vm.expectRevert("Not settling");
        escrow.executeAuthorizedStaff(1);
        assertEq(escrow.reservedStaff(), 2 ether);
        escrow.finalize();
        escrow.refundFor(alice);
        assertEq(alice.balance, 10 ether);
    }

    function test_EarlyFinalizationCannotBypassScheduledVenueOrStaff() public {
        _fundThirty();
        _authorize();
        vm.warp(collectUntil);
        vm.prank(organizer);
        vm.expectRevert("Scheduled payments pending");
        escrow.finalize();
        escrow.executeScheduled(0);
        vm.prank(organizer);
        vm.expectRevert("Staff payments pending");
        escrow.finalize();
        escrow.executeAuthorizedStaff(1);
        vm.expectRevert("Wait for deadline");
        escrow.finalize();
        vm.prank(organizer);
        escrow.finalize();
        assertTrue(escrow.finalized());
        vm.prank(organizer);
        vm.expectRevert("Authorization closed");
        escrow.authorizeStaff(1, bytes32(0));
    }

    function test_NoPendingStaffAllowsPermissionlessFinalizationAtSpendUntil() public {
        _fundThirty();
        vm.warp(spendUntil - 1);
        vm.expectRevert("Wait for deadline");
        escrow.finalize();
        vm.warp(spendUntil);
        escrow.finalize();
        assertEq(escrow.remainingLiability(), 30 ether);
    }

    function test_AuthorizationCannotReservePartialExcessOrForcedFunds() public {
        _pay(alice, 9 ether);
        _pay(bob, 1 ether);
        vm.deal(address(escrow), 100 ether);
        vm.prank(organizer);
        vm.expectRevert("Reserved payments");
        escrow.authorizeStaff(1, bytes32(0));
        assertEq(escrow.reservedStaff(), 0);
        _pay(alice, 4 ether);
        _authorize();
        assertEq(escrow.reservedStaff(), 2 ether);
        vm.warp(collectUntil);
        vm.expectRevert("Reserved payments");
        escrow.executeScheduled(0);
        escrow.executeAuthorizedStaff(1);
        vm.warp(spendUntil);
        escrow.finalize();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        assertEq(alice.balance, 11 ether);
        assertEq(bob.balance, 1 ether);
        assertEq(escrow.totalSpent(), 2 ether);
        assertEq(escrow.totalRefunded(), 12 ether);
        assertEq(escrow.unaccountedBalance(), 90 ether);
    }

    function test_ReservationCannotBeConsumedByOtherExpenses() public {
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].automatic = false;
        escrow = new SettlementEscrowHarness(organizer, _terms(), budgets);
        _approve(alice);
        _pay(alice, 13 ether);
        _authorize();
        vm.warp(collectUntil);
        vm.startPrank(organizer);
        vm.expectRevert("Reserved payments");
        escrow.spend(0, 9 ether, bytes32(0));
        escrow.spend(0, 8 ether, bytes32(0));
        vm.stopPrank();
        escrow.executeAuthorizedStaff(1);
        assertEq(escrow.totalSpent(), 10 ether);
        vm.warp(spendUntil);
        escrow.finalize();
        escrow.refundFor(alice);
        assertEq(alice.balance, 3 ether);
    }

    function test_CancellationReleasesReservationAndNonStaffAuthorizationRejected() public {
        _pay(alice, 10 ether);
        _pay(bob, 10 ether);
        _authorize();
        vm.prank(organizer);
        vm.expectRevert("Not staff");
        escrow.authorizeStaff(0, bytes32(0));
        vm.prank(organizer);
        escrow.cancelStaffAuthorization(1);
        vm.warp(collectUntil);
        escrow.executeScheduled(0);
        assertEq(escrow.totalSpent(), 12 ether);
        assertEq(escrow.reservedStaff(), 0);
    }

    function test_StaffFailedSendRollsBackAllStateAndRetriesDuringGrace() public {
        SettlementRefundReceiver receiver = new SettlementRefundReceiver();
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[1].recipient = payable(address(receiver));
        escrow = new SettlementEscrowHarness(organizer, _terms(), budgets);
        _approve(alice);
        _pay(alice, 10 ether);
        _authorize();
        vm.warp(spendUntil);
        vm.expectRevert("Native send failed");
        escrow.executeAuthorizedStaff(1);
        assertTrue(escrow.staffAuthorized(1));
        assertEq(escrow.reservedStaff(), 2 ether);
        assertEq(escrow.budgetSpent(1), 0);
        assertEq(escrow.totalSpent(), 0);
        assertEq(address(escrow).balance, 10 ether);
        assertEq(escrow.staffReceiptHash(1), keccak256("completed staff"));
        receiver.unblock();
        escrow.executeAuthorizedStaff(1);
        escrow.finalize();
        escrow.refundFor(alice);
        assertEq(address(receiver).balance, 2 ether);
        assertEq(alice.balance, 8 ether);
    }

    function test_ManualVenueClosesAtExactSpendBoundary() public {
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].automatic = false;
        escrow = new SettlementEscrowHarness(organizer, _terms(), budgets);
        _approve(alice);
        _pay(alice, 10 ether);
        vm.warp(spendUntil - 1);
        vm.prank(organizer);
        escrow.spend(0, 1 ether, bytes32(0));
        vm.warp(spendUntil);
        vm.prank(organizer);
        vm.expectRevert("Not spending");
        escrow.spend(0, 1 ether, bytes32(0));
        escrow.finalize();
        escrow.refundFor(alice);
        assertEq(venue.balance, 1 ether);
        assertEq(alice.balance, 9 ether);
    }

    function test_NewAuthorizationAccountsForPreviouslySpentPrincipal() public {
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].automatic = false;
        escrow = new SettlementEscrowHarness(organizer, _terms(), budgets);
        _approve(alice);
        _pay(alice, 13 ether);
        vm.warp(collectUntil);
        vm.prank(organizer);
        escrow.spend(0, 9 ether, bytes32(0));
        vm.prank(organizer);
        vm.expectRevert("Reserved payments");
        escrow.authorizeStaff(1, bytes32(0));
        assertEq(escrow.reservedStaff(), 0);
        assertFalse(escrow.staffAuthorized(1));
        assertEq(escrow.totalSpent(), 9 ether);
    }

    function test_ScheduledVenueCannotConsumeReservedStaffPrincipal() public {
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[1].cap = 9 ether;
        escrow = new SettlementEscrowHarness(organizer, _terms(), budgets);
        _approve(alice);
        _approve(bob);
        _pay(alice, 10 ether);
        _pay(bob, 10 ether);
        _authorize();
        vm.warp(collectUntil);
        vm.expectRevert("Reserved payments");
        escrow.executeScheduled(0);
        assertEq(escrow.budgetSpent(0), 0);
        assertEq(escrow.totalSpent(), 0);
        assertEq(escrow.reservedStaff(), 9 ether);
        escrow.executeAuthorizedStaff(1);
        assertEq(staff.balance, 9 ether);
        vm.warp(spendUntil);
        escrow.finalize();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        assertEq(escrow.totalRefunded(), 11 ether);
    }

    function test_MultipleReservationsSumAndOnlyUnpaidCommitmentExpires() public {
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = new NativeMeetupSettlementEscrowBase.Budget[](3);
        budgets[0] = _budgets()[0];
        budgets[1] = _budgets()[1];
        budgets[2] = NativeMeetupSettlementEscrowBase.Budget(payable(address(0x203)), 3 ether, 2, 0, false);
        escrow = new SettlementEscrowHarness(organizer, _terms(), budgets);
        _approve(alice);
        _approve(bob);
        _pay(alice, 10 ether);
        _pay(bob, 10 ether);
        _authorize();
        vm.prank(organizer);
        escrow.authorizeStaff(2, keccak256("second staff"));
        assertEq(escrow.reservedStaff(), 5 ether);
        vm.warp(collectUntil);
        escrow.executeScheduled(0);
        escrow.executeAuthorizedStaff(1);
        assertEq(escrow.reservedStaff(), 3 ether);
        vm.warp(spendUntil);
        vm.expectRevert("Staff payments pending");
        escrow.finalize();
        vm.warp(escrow.settlementUntil());
        vm.expectEmit(true, true, false, true, address(escrow));
        emit StaffAuthorizationExpired(2, address(0x203), 3 ether);
        escrow.finalize();
        assertFalse(escrow.staffAuthorized(2));
        assertEq(escrow.reservedStaff(), 0);
        assertEq(escrow.totalSpent(), 14 ether);
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        assertEq(escrow.totalRefunded(), 6 ether);
        assertEq(address(0x203).balance, 0);
    }

    function test_FailedStaffCanExpireAndFailedRefundStillRetainsLiability() public {
        SettlementRefundReceiver receiver = new SettlementRefundReceiver();
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[1].recipient = payable(address(receiver));
        escrow = new SettlementEscrowHarness(organizer, _terms(), budgets);
        _approve(address(receiver));
        receiver.pay{value: 10 ether}(address(escrow));
        _authorize();
        vm.warp(spendUntil);
        vm.expectRevert("Native send failed");
        escrow.executeAuthorizedStaff(1);
        vm.warp(escrow.settlementUntil());
        escrow.finalize();
        vm.expectRevert("Native send failed");
        escrow.refundFor(address(receiver));
        assertEq(escrow.reservedStaff(), 0);
        assertEq(escrow.remainingLiability(), 10 ether);
        assertEq(escrow.totalSpent(), 0);
        assertEq(escrow.totalRefunded(), 0);
        receiver.unblock();
        escrow.refundFor(address(receiver));
        assertEq(address(receiver).balance, 10 ether);
        assertEq(escrow.remainingLiability(), 0);
    }

    function test_OnlyFullPayersShareStaffCostAndRoundingConservesEveryUnit() public {
        _pay(alice, 13 ether + 1);
        _pay(bob, 10 ether);
        _pay(carol, 4 ether);
        _authorize();
        vm.warp(spendUntil);
        escrow.executeAuthorizedStaff(1);
        escrow.finalize();
        _refundThree();
        assertEq(alice.balance, 12 ether + 1);
        assertEq(bob.balance, 9 ether);
        assertEq(carol.balance, 4 ether);
        assertEq(escrow.totalRefunded(), 25 ether + 1);
    }

    function test_UnauthorizedExecutionAndNonStaffScheduleCannotBypass() public {
        _pay(alice, 10 ether);
        vm.warp(collectUntil);
        vm.expectRevert("Not authorized");
        escrow.executeAuthorizedStaff(1);
        vm.expectRevert("Not scheduled");
        escrow.executeScheduled(1);
        vm.expectRevert("Not authorized");
        escrow.executeAuthorizedStaff(0);
        _authorize();
        escrow.executeAuthorizedStaff(1);
    }

    function test_StaffReentrancyCannotExecuteFinalizeOrAuthorizeAgain() public {
        SettlementStaffReentrantReceiver receiver = new SettlementStaffReentrantReceiver();
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].automatic = false;
        budgets[1].recipient = payable(address(receiver));
        escrow = new SettlementEscrowHarness(address(receiver), _terms(), budgets);
        receiver.configure(escrow);
        receiver.approve(alice, collectUntil);
        _pay(alice, 10 ether);
        receiver.authorize();
        vm.warp(spendUntil);
        escrow.executeAuthorizedStaff(1);
        assertEq(receiver.successfulCallbacks(), 0);
        assertEq(address(receiver).balance, 2 ether);
        assertEq(escrow.totalSpent(), 2 ether);
        assertFalse(escrow.finalized());
        escrow.finalize();
        escrow.refundFor(alice);
        assertEq(alice.balance, 8 ether);
    }

    function testFuzz_ReservedStaffConservation(uint96 firstSeed, uint96 secondSeed, bool execute) public {
        uint256 first = bound(uint256(firstSeed), 10 ether, 30 ether);
        uint256 second = bound(uint256(secondSeed), 1, 30 ether);
        _pay(alice, first);
        _pay(bob, second);
        _authorize();
        vm.warp(collectUntil);
        if (escrow.paidCount() >= 2) escrow.executeScheduled(0);
        if (execute) {
            vm.warp(escrow.settlementUntil() - 1);
            escrow.executeAuthorizedStaff(1);
        }
        vm.warp(escrow.settlementUntil());
        escrow.finalize();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        assertEq(escrow.totalSpent() + escrow.totalRefunded(), first + second);
        assertEq(escrow.reservedStaff(), 0);
        assertEq(escrow.remainingLiability(), 0);
        assertEq(address(escrow).balance, 0);
    }
}

contract SettlementStaffReentrantReceiver {
    NativeMeetupSettlementEscrowBase public escrow;
    uint256 public successfulCallbacks;

    function configure(NativeMeetupSettlementEscrowBase escrow_) external { escrow = escrow_; }
    function approve(address payer, uint256 expiry) external {
        escrow.approveApplicant(payer, keccak256("payer"), expiry);
    }
    function authorize() external { escrow.authorizeStaff(1, bytes32(0)); }
    receive() external payable {
        try escrow.executeAuthorizedStaff(1) { successfulCallbacks++; } catch {}
        try escrow.finalize() { successfulCallbacks++; } catch {}
        try escrow.authorizeStaff(1, bytes32(0)) { successfulCallbacks++; } catch {}
        try escrow.cancelStaffAuthorization(1) { successfulCallbacks++; } catch {}
    }
}


