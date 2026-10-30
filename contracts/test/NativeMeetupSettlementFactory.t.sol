pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {
    NativeMeetupSettlementEscrowBase,
    NativeMeetupSettlementEscrowTestnet5042002,
    NativeMeetupSettlementEscrowMainnet5042
} from "../NativeMeetupSettlementEscrow.sol";
import {
    NativeMeetupSettlementFactoryTestnet5042002,
    NativeMeetupSettlementFactoryMainnet5042
} from "../NativeMeetupSettlementFactory.sol";

contract NativeMeetupSettlementFactoryTest is Test {
    NativeMeetupSettlementFactoryTestnet5042002 factory;
    address organizer = address(0x100);

    function setUp() public {
        vm.chainId(5042002);
        vm.warp(1_000_000);
        factory = new NativeMeetupSettlementFactoryTestnet5042002();
    }

    function _budgets() internal pure returns (NativeMeetupSettlementEscrowBase.Budget[] memory budgets) {
        budgets = new NativeMeetupSettlementEscrowBase.Budget[](2);
        budgets[0] = NativeMeetupSettlementEscrowBase.Budget(payable(address(0x200)), 12 ether, 0, 900, true);
        budgets[1] = NativeMeetupSettlementEscrowBase.Budget(payable(address(0x201)), 2 ether, 2, 0, false);
    }

    function _terms() internal view returns (NativeMeetupSettlementEscrowBase.Terms memory) {
        return NativeMeetupSettlementEscrowBase.Terms(keccak256("terms"), 10 ether, 3,
            block.timestamp + 900, block.timestamp + 1800, true);
    }

    function _create() internal returns (NativeMeetupSettlementEscrowBase escrow) {
        vm.prank(organizer);
        escrow = NativeMeetupSettlementEscrowBase(payable(factory.createEventWithDurations(
            keccak256("terms"), 10 ether, 3, 900, 1800, true, _budgets())));
    }

    function test_ApprovalDelayStartsDeadlinesAtExecutionAndAddsFixed24HourSettlement() public {
        vm.warp(block.timestamp + 18 minutes);
        uint256 executedAt = block.timestamp;
        NativeMeetupSettlementEscrowBase escrow = _create();
        (bytes32 metadataHash, uint256 fee, uint256 capacity, uint256 collectUntil,
            uint256 spendUntil, bool showStaffAmounts) = escrow.terms();
        assertEq(metadataHash, keccak256("terms"));
        assertEq(fee, 10 ether);
        assertEq(capacity, 3);
        assertTrue(showStaffAmounts);
        assertEq(collectUntil, executedAt + 900);
        assertEq(spendUntil, executedAt + 1800);
        assertEq(escrow.settlementUntil(), spendUntil + 24 hours);
        (, , , uint256 payAfter,) = escrow.budgets(0);
        assertEq(payAfter, collectUntil);
        assertEq(escrow.organizer(), organizer);
        assertEq(escrow.createdAtBlock(), block.number);
        assertTrue(factory.isEvent(address(escrow)));
        assertEq(escrow.contractVersion(), 3);
        assertEq(factory.contractVersion(), 3);
    }

    function test_AbsoluteDeadlineAPIRemainsAvailable() public {
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].payAfter += block.timestamp;
        vm.prank(organizer);
        address created = factory.createEvent(_terms(), budgets);
        NativeMeetupSettlementEscrowBase escrow = NativeMeetupSettlementEscrowBase(payable(created));
        assertTrue(factory.isEvent(created));
        assertEq(escrow.organizer(), organizer);
        assertEq(escrow.settlementUntil(), block.timestamp + 1800 + 24 hours);
    }

    function test_InvalidDurationsAndBothOffsetBoundariesRejected() public {
        vm.expectRevert("Bad durations");
        factory.createEventWithDurations(keccak256("terms"), 10 ether, 3, 0, 1800, true, _budgets());
        vm.expectRevert("Bad durations");
        factory.createEventWithDurations(keccak256("terms"), 10 ether, 3, 900, 900, true, _budgets());
        vm.expectRevert("Bad durations");
        factory.createEventWithDurations(keccak256("terms"), 10 ether, 3, 900, 90 days + 1, true, _budgets());
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].payAfter = 899;
        vm.expectRevert("Bad payment offset");
        factory.createEventWithDurations(keccak256("terms"), 10 ether, 3, 900, 1800, true, budgets);
        budgets[0].payAfter = 1800;
        vm.expectRevert("Bad payment offset");
        factory.createEventWithDurations(keccak256("terms"), 10 ether, 3, 900, 1800, true, budgets);
        budgets[0].payAfter = 1799;
        address created = factory.createEventWithDurations(keccak256("terms"), 10 ether, 3,
            900, 1800, true, budgets);
        assertTrue(factory.isEvent(created));
    }

    function test_ExactNinetyDayDurationAccepted() public {
        address created = factory.createEventWithDurations(keccak256("terms"), 10 ether, 3,
            900, 90 days, true, _budgets());
        NativeMeetupSettlementEscrowBase escrow = NativeMeetupSettlementEscrowBase(payable(created));
        assertEq(escrow.settlementUntil(), block.timestamp + 91 days);
    }

    function test_AutomaticStaffRejectedAndCapacityBackingChecked() public {
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[1].automatic = true;
        budgets[1].payAfter = 900;
        vm.expectRevert("Bad automatic payment");
        factory.createEventWithDurations(keccak256("terms"), 10 ether, 3, 900, 1800, true, budgets);
        budgets = _budgets();
        vm.expectRevert("Budget exceeds capacity");
        factory.createEventWithDurations(keccak256("terms"), 10 ether, 1, 900, 1800, true, budgets);
    }

    function test_MainnetFactoryAndEscrowWorkOnlyOn5042() public {
        vm.expectRevert("Mainnet only");
        new NativeMeetupSettlementFactoryMainnet5042();
        NativeMeetupSettlementEscrowBase.Budget[] memory budgets = _budgets();
        budgets[0].payAfter += block.timestamp;
        vm.expectRevert("Mainnet only");
        new NativeMeetupSettlementEscrowMainnet5042(organizer, _terms(), budgets);
        vm.chainId(5042);
        vm.prank(organizer);
        NativeMeetupSettlementFactoryMainnet5042 mainnet = new NativeMeetupSettlementFactoryMainnet5042();
        vm.prank(organizer);
        address created = mainnet.createEventWithDurations(keccak256("terms"), 0.01 ether, 3,
            900, 1800, true, _mainnetBudgets());
        assertTrue(mainnet.isEvent(created));
        assertEq(mainnet.contractVersion(), 3);
        NativeMeetupSettlementEscrowBase escrow = NativeMeetupSettlementEscrowBase(payable(created));
        assertEq(escrow.contractVersion(), 3);
        assertEq(escrow.organizer(), organizer);
        assertEq(escrow.settlementUntil(), block.timestamp + 1800 + 24 hours);
        vm.expectRevert("Testnet only");
        new NativeMeetupSettlementFactoryTestnet5042002();
        vm.expectRevert("Testnet only");
        new NativeMeetupSettlementEscrowTestnet5042002(organizer, _terms(), budgets);
    }

    function test_ExistingFactoryCannotCreateEscrowOnWrongChain() public {
        vm.chainId(5042);
        vm.expectRevert("Testnet only");
        _create();
        NativeMeetupSettlementFactoryMainnet5042 mainnet = new NativeMeetupSettlementFactoryMainnet5042();
        vm.chainId(1);
        vm.expectRevert("Mainnet only");
        mainnet.createEventWithDurations(keccak256("terms"), 0.01 ether, 3, 900, 1800, true, _mainnetBudgets());
        vm.expectRevert("Testnet only");
        new NativeMeetupSettlementFactoryTestnet5042002();
        vm.expectRevert("Mainnet only");
        new NativeMeetupSettlementFactoryMainnet5042();
    }

    function testFuzz_ExecutionDelayPreservesDurationAndSettlement(uint32 delaySeconds) public {
        vm.warp(block.timestamp + bound(uint256(delaySeconds), 0, 30 days));
        NativeMeetupSettlementEscrowBase escrow = _create();
        (, , , uint256 collectUntil, uint256 spendUntil,) = escrow.terms();
        assertEq(collectUntil - block.timestamp, 900);
        assertEq(spendUntil - block.timestamp, 1800);
        assertEq(escrow.settlementUntil() - spendUntil, 24 hours);
    }

    function _mainnetBudgets() internal pure returns (NativeMeetupSettlementEscrowBase.Budget[] memory budgets) {
        budgets = _budgets();
        budgets[0].cap = 0.012 ether;
        budgets[1].cap = 0.002 ether;
    }

    function _mainnetFactory() internal returns (NativeMeetupSettlementFactoryMainnet5042 mainnet) {
        vm.chainId(5042);
        mainnet = new NativeMeetupSettlementFactoryMainnet5042();
    }

    function _createMainnet(NativeMeetupSettlementFactoryMainnet5042 mainnet) internal returns (address) {
        return mainnet.createEventWithDurations(keccak256("demo"), 0.01 ether, 3,
            900, 1800, true, _mainnetBudgets());
    }

    function _mainnetTerms() internal view returns (NativeMeetupSettlementEscrowBase.Terms memory terms) {
        terms = _terms();
        terms.fee = 0.01 ether;
    }

    function _absoluteMainnetBudgets() internal view returns (NativeMeetupSettlementEscrowBase.Budget[] memory budgets) {
        budgets = _mainnetBudgets();
        budgets[0].payAfter += block.timestamp;
    }

    function test_MainnetOnlyImmutableDeployerMayCreateThroughEitherAPI() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        assertEq(mainnet.deploymentOperator(), address(this));
        vm.prank(organizer);
        vm.expectRevert("Only deployment operator");
        _createMainnet(mainnet);
        vm.prank(organizer);
        vm.expectRevert("Only deployment operator");
        mainnet.createEvent(_mainnetTerms(), _absoluteMainnetBudgets());
        assertFalse(mainnet.hasCreatedEvent());
        address created = _createMainnet(mainnet);
        assertTrue(mainnet.hasCreatedEvent());
        assertTrue(mainnet.isEvent(created));
        assertEq(NativeMeetupSettlementEscrowBase(payable(created)).organizer(), address(this));
    }

    function test_MainnetOneEventLimitSharedAcrossBothAPIs() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        address created = _createMainnet(mainnet);
        vm.expectRevert("Mainnet event already created");
        _createMainnet(mainnet);
        vm.expectRevert("Mainnet event already created");
        mainnet.createEvent(_mainnetTerms(), _absoluteMainnetBudgets());
        assertTrue(mainnet.isEvent(created));
        assertTrue(mainnet.hasCreatedEvent());
    }

    function test_MainnetAbsoluteCreationAlsoConsumesSingleEventSlot() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        address created = mainnet.createEvent(_mainnetTerms(), _absoluteMainnetBudgets());
        assertTrue(mainnet.isEvent(created));
        vm.expectRevert("Mainnet event already created");
        _createMainnet(mainnet);
    }

    function test_MainnetPrincipalAndCapacityBoundariesOnBothAPIs() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        assertEq(mainnet.MAX_PRINCIPAL(), 3e16);
        assertEq(mainnet.MAX_CAPACITY(), 3);
        vm.expectRevert("Mainnet principal cap");
        mainnet.createEventWithDurations(keccak256("demo"), 0.01 ether + 1, 3,
            900, 1800, true, _mainnetBudgets());
        NativeMeetupSettlementEscrowBase.Terms memory terms = _mainnetTerms();
        terms.fee++;
        vm.expectRevert("Mainnet principal cap");
        mainnet.createEvent(terms, _absoluteMainnetBudgets());
        vm.expectRevert("Mainnet capacity");
        mainnet.createEventWithDurations(keccak256("demo"), 0.001 ether, 4,
            900, 1800, true, _mainnetBudgets());
        terms.capacity = 4;
        vm.expectRevert("Mainnet capacity");
        mainnet.createEvent(terms, _absoluteMainnetBudgets());
        terms.capacity = 0;
        vm.expectRevert("Mainnet capacity");
        mainnet.createEvent(terms, _absoluteMainnetBudgets());
        terms.capacity = 1;
        terms.fee = type(uint256).max;
        vm.expectRevert("Mainnet principal cap");
        mainnet.createEvent(terms, _absoluteMainnetBudgets());
        assertFalse(mainnet.hasCreatedEvent());
        _createMainnet(mainnet);
        assertTrue(mainnet.hasCreatedEvent());
    }

    function test_MainnetFailedDeploymentRollsBackSingleEventFlag() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        NativeMeetupSettlementEscrowBase.Terms memory terms = _mainnetTerms();
        terms.metadataHash = bytes32(0);
        vm.expectRevert("Missing terms");
        mainnet.createEvent(terms, _absoluteMainnetBudgets());
        assertFalse(mainnet.hasCreatedEvent());
        address created = _createMainnet(mainnet);
        assertTrue(mainnet.isEvent(created));
        assertTrue(mainnet.hasCreatedEvent());
    }

    function test_MainnetBoundedDemonstrationConserves003() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        NativeMeetupSettlementEscrowBase escrow = NativeMeetupSettlementEscrowBase(payable(_createMainnet(mainnet)));
        address[] memory payers = new address[](3);
        payers[0] = address(0x301);
        payers[1] = address(0x302);
        payers[2] = address(0x303);
        (, , , uint256 collectUntil, uint256 spendUntil,) = escrow.terms();
        for (uint256 payerId; payerId < payers.length; payerId++) {
            escrow.approveApplicant(payers[payerId], keccak256(abi.encode(payers[payerId])), collectUntil);
            vm.deal(payers[payerId], 0.01 ether);
            vm.prank(payers[payerId]);
            (bool success,) = address(escrow).call{value: 0.01 ether}("");
            assertTrue(success);
        }
        escrow.authorizeStaff(1, keccak256("staff"));
        vm.warp(collectUntil);
        escrow.executeScheduled(0);
        vm.warp(spendUntil + 72 minutes + 46 seconds);
        escrow.executeAuthorizedStaff(1);
        escrow.finalize();
        for (uint256 payerId; payerId < payers.length; payerId++) escrow.refundFor(payers[payerId]);
        assertEq(escrow.totalCollected(), 0.03 ether);
        assertEq(address(0x200).balance, 0.012 ether);
        assertEq(address(0x201).balance, 0.002 ether);
        assertEq(escrow.totalRefunded(), 0.016 ether);
        assertEq(escrow.remainingLiability(), 0);
        assertEq(address(escrow).balance, 0);
    }

    function test_TestnetRetainsMultipleCreatorsEventsAndLargerPrincipal() public {
        address first = address(_create());
        vm.prank(address(0x999));
        address second = factory.createEventWithDurations(keccak256("other"), 10 ether, 4,
            900, 1800, true, _budgets());
        assertTrue(factory.isEvent(first));
        assertTrue(factory.isEvent(second));
        assertTrue(first != second);
        assertEq(NativeMeetupSettlementEscrowBase(payable(second)).organizer(), address(0x999));
    }

    function _sendNative(NativeMeetupSettlementEscrowBase escrow, address payer, uint256 amount) internal {
        vm.deal(payer, amount);
        vm.prank(payer);
        (bool success, bytes memory reason) = address(escrow).call{value: amount}("");
        if (!success) assembly { revert(add(reason, 32), mload(reason)) }
    }

    function _approvePayer(NativeMeetupSettlementEscrowBase escrow, address payer) internal {
        (, , , uint256 collectUntil,,) = escrow.terms();
        escrow.approveApplicant(payer, keccak256(abi.encode(payer)), collectUntil);
    }

    function _assertUnpaid(NativeMeetupSettlementEscrowBase escrow, address payer) internal view {
        (, uint256 paid, , uint256 transfers,,) = escrow.members(payer);
        assertEq(paid, 0);
        assertEq(transfers, 0);
        assertEq(escrow.totalCollected(), 0);
        assertEq(escrow.paidCount(), 0);
        assertEq(address(escrow).balance, 0);
    }

    function test_MainnetRejectsUnderpaymentAndAllowsExactRetry() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        NativeMeetupSettlementEscrowBase escrow = NativeMeetupSettlementEscrowBase(payable(_createMainnet(mainnet)));
        _approvePayer(escrow, organizer);
        vm.expectRevert("Mainnet exact payment");
        _sendNative(escrow, organizer, 0.01 ether - 1);
        _assertUnpaid(escrow, organizer);
        _sendNative(escrow, organizer, 0.01 ether);
        assertEq(escrow.totalCollected(), 0.01 ether);
        assertEq(escrow.paidCount(), 1);
    }

    function test_MainnetRejectsExcessIncludingLargeTransferAndAllowsExactRetry() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        NativeMeetupSettlementEscrowBase escrow = NativeMeetupSettlementEscrowBase(payable(_createMainnet(mainnet)));
        _approvePayer(escrow, organizer);
        vm.expectRevert("Mainnet exact payment");
        _sendNative(escrow, organizer, 0.01 ether + 1);
        _assertUnpaid(escrow, organizer);
        vm.expectRevert("Mainnet exact payment");
        _sendNative(escrow, organizer, 1 ether);
        _assertUnpaid(escrow, organizer);
        _sendNative(escrow, organizer, 0.01 ether);
        assertEq(escrow.totalCollected(), 0.01 ether);
    }

    function test_MainnetRejectsRepeatExactSendAndTopupWithoutChangingAccounting() public {
        NativeMeetupSettlementFactoryMainnet5042 mainnet = _mainnetFactory();
        NativeMeetupSettlementEscrowBase escrow = NativeMeetupSettlementEscrowBase(payable(_createMainnet(mainnet)));
        _approvePayer(escrow, organizer);
        _sendNative(escrow, organizer, 0.01 ether);
        vm.expectRevert("Mainnet already paid");
        _sendNative(escrow, organizer, 0.01 ether);
        vm.expectRevert("Mainnet already paid");
        _sendNative(escrow, organizer, 1);
        (, uint256 paid, , uint256 transfers,,) = escrow.members(organizer);
        assertEq(paid, 0.01 ether);
        assertEq(transfers, 1);
        assertEq(escrow.totalCollected(), 0.01 ether);
        assertEq(escrow.paidCount(), 1);
        assertEq(address(escrow).balance, 0.01 ether);
    }

    function test_DirectMainnetConstructorRejectsPrincipalAndCapacityAboveLimits() public {
        vm.chainId(5042);
        NativeMeetupSettlementEscrowBase.Terms memory terms = _mainnetTerms();
        terms.fee++;
        vm.expectRevert("Mainnet principal cap");
        new NativeMeetupSettlementEscrowMainnet5042(address(this), terms, _absoluteMainnetBudgets());
        terms = _mainnetTerms();
        terms.capacity = 4;
        vm.expectRevert("Mainnet capacity");
        new NativeMeetupSettlementEscrowMainnet5042(address(this), terms, _absoluteMainnetBudgets());
        terms.capacity = 1;
        terms.fee = 0.03 ether + 1;
        vm.expectRevert("Mainnet principal cap");
        new NativeMeetupSettlementEscrowMainnet5042(address(this), terms, _absoluteMainnetBudgets());
    }

    function test_DirectMainnetEscrowAcceptsExactlyThreeFeesAndRejectsFurtherValue() public {
        vm.chainId(5042);
        NativeMeetupSettlementEscrowMainnet5042 escrow = new NativeMeetupSettlementEscrowMainnet5042(
            address(this), _mainnetTerms(), _absoluteMainnetBudgets());
        assertEq(escrow.MAX_PRINCIPAL(), 3e16);
        assertEq(escrow.MAX_CAPACITY(), 3);
        for (uint256 payerId; payerId < 3; payerId++) {
            address payer = address(uint160(0x400 + payerId));
            _approvePayer(escrow, payer);
            _sendNative(escrow, payer, 0.01 ether);
        }
        assertEq(escrow.totalCollected(), 3e16);
        assertEq(escrow.paidCount(), 3);
        vm.expectRevert("Mainnet already paid");
        _sendNative(escrow, address(0x400), 0.01 ether);
        vm.expectRevert("Not approved");
        _sendNative(escrow, address(0x499), 0.01 ether);
        (, , , uint256 collectUntil,,) = escrow.terms();
        vm.expectRevert(bytes("Full"));
        escrow.approveApplicant(address(0x499), keccak256("fourth payer"), collectUntil);
        assertEq(escrow.totalCollected(), 3e16);
        assertEq(address(escrow).balance, 3e16);
    }

    function test_DirectMainnetSinglePayerAcceptsExactMaximumAndRetainsRefundLiability() public {
        vm.chainId(5042);
        NativeMeetupSettlementEscrowBase.Terms memory terms = _mainnetTerms();
        terms.capacity = 1;
        terms.fee = 3e16;
        NativeMeetupSettlementEscrowMainnet5042 escrow = new NativeMeetupSettlementEscrowMainnet5042(
            address(this), terms, _absoluteMainnetBudgets());
        _approvePayer(escrow, organizer);
        _sendNative(escrow, organizer, 3e16);
        vm.warp(terms.spendUntil);
        escrow.finalize();
        escrow.refundFor(organizer);
        assertEq(organizer.balance, 3e16);
        assertEq(escrow.totalRefunded(), 3e16);
        assertEq(escrow.remainingLiability(), 0);
    }

    function test_TestnetStillAcceptsShortExcessAndRepeatedTopups() public {
        NativeMeetupSettlementEscrowBase escrow = _create();
        (, , , uint256 collectUntil, uint256 spendUntil,) = escrow.terms();
        vm.prank(organizer);
        escrow.approveApplicant(address(0x501), keccak256("testnet payer"), collectUntil);
        _sendNative(escrow, address(0x501), 4 ether);
        _sendNative(escrow, address(0x501), 9 ether);
        _sendNative(escrow, address(0x501), 1 ether);
        (, uint256 paid, , uint256 transfers,,) = escrow.members(address(0x501));
        assertEq(paid, 14 ether);
        assertEq(transfers, 3);
        assertEq(escrow.paidCount(), 1);
        assertEq(escrow.totalCollected(), 14 ether);
        vm.warp(spendUntil);
        escrow.finalize();
        escrow.refundFor(address(0x501));
        assertEq(address(0x501).balance, 14 ether);
        assertEq(escrow.remainingLiability(), 0);
    }
}

