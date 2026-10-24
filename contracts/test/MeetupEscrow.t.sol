pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MeetupEscrowBase, MeetupEscrowTestnet} from "../MeetupEscrow.sol";
import {MockERC20} from "./MockERC20.sol";

contract AuthorizationToken is MockERC20 {
    mapping(address => mapping(bytes32 => bool)) public used;
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant TYPE_HASH = keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    constructor() MockERC20("USDC", "USDC", 6) {
        DOMAIN_SEPARATOR = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("USDC"), keccak256("2"), block.chainid, address(this)));
    }

    function digest(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore,
        bytes32 nonce) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPE_HASH, from, to, value, validAfter, validBefore, nonce))));
    }

    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter,
        uint256 validBefore, bytes32 nonce, uint8 signatureV, bytes32 signatureR, bytes32 signatureS) external {
        require(msg.sender == to, "Recipient only");
        require(block.timestamp > validAfter && block.timestamp < validBefore, "Authorization expired");
        require(!used[from][nonce], "Nonce used");
        require(ECDSA.recover(digest(from, to, value, validAfter, validBefore, nonce),
            signatureV, signatureR, signatureS) == from, "Bad signature");
        used[from][nonce] = true;
        _transfer(from, to, value, false);
    }
}

contract MeetupHarness is MeetupEscrowBase {
    address private immutable token;
    constructor(address token_, address organizer_, Terms memory terms_, Budget[] memory budgets_)
        MeetupEscrowBase(organizer_, terms_, budgets_) { token = token_; }
    function _token() internal view override returns (address) { return token; }
}

contract MeetupEscrowTest is Test {
    AuthorizationToken token;
    MeetupHarness escrow;
    address alice;
    address bob = address(0x2000);
    address carol = address(0x3000);
    address venue = address(0x9000);
    uint256 constant FEE = 10e6;
    uint256 constant ALICE_KEY = 12345;

    function setUp() public {
        vm.warp(1_000_000);
        alice = vm.addr(ALICE_KEY);
        token = new AuthorizationToken();
        MeetupEscrowBase.Budget[] memory budgets = new MeetupEscrowBase.Budget[](3);
        budgets[0] = MeetupEscrowBase.Budget(venue, 12e6, 0, 0, false);
        budgets[1] = MeetupEscrowBase.Budget(venue, 10e6, 1, 0, false);
        budgets[2] = MeetupEscrowBase.Budget(bob, 2e6, 2, 0, false);
        escrow = new MeetupHarness(address(token), alice,
            MeetupEscrowBase.Terms(keccak256("terms"), FEE, 3, block.timestamp + 1 hours,
                block.timestamp + 1 days, false), budgets);
        register(alice);
        register(bob);
        register(carol);
    }

    function register(address payer) internal {
        vm.prank(payer);
        escrow.register(keccak256(abi.encode(payer)), payer);
    }

    function pay(address payer, uint256 amount) internal {
        token.mint(payer, amount);
        vm.startPrank(payer);
        token.approve(address(escrow), amount);
        escrow.pay(amount);
        vm.stopPrank();
    }

    function startSpending() internal { vm.warp(1_000_000 + 1 hours); }

    function finish() internal {
        vm.warp(1_000_000 + 1 days);
        escrow.finalize();
    }

    function test_E2E_CollectPayStaffRefundAndConserve() public {
        pay(alice, FEE);
        pay(bob, FEE);
        pay(carol, FEE);
        startSpending();
        vm.startPrank(alice);
        escrow.spend(0, 12e6, keccak256("venue receipt"));
        escrow.spend(2, 2e6, keccak256("job completed"));
        escrow.finalize();
        vm.stopPrank();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        escrow.refundFor(carol);
        assertEq(escrow.totalSpent(), 14e6);
        assertEq(escrow.totalRefunded(), 16e6);
        assertEq(escrow.remainingLiability(), 0);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(venue), 12e6);
        assertEq(token.balanceOf(bob), 2e6 + 5_333_333);
    }

    function test_PartialPaymentsCannotFundExpenses() public {
        pay(alice, FEE);
        pay(bob, 5e6);
        startSpending();
        vm.startPrank(alice);
        vm.expectRevert("Partial payments reserved");
        escrow.spend(0, 12e6, bytes32(0));
        escrow.spend(0, FEE, bytes32(0));
        vm.stopPrank();
        finish();
        escrow.refundFor(bob);
        assertEq(token.balanceOf(bob), 5e6);
    }

    function test_SpoofUnregisteredOverpaymentDuplicateAndLateRejected() public {
        vm.prank(venue);
        vm.expectRevert("Register first");
        escrow.pay(FEE);
        vm.prank(alice);
        vm.expectRevert("Already registered");
        escrow.register(keccak256("spoof"), venue);
        vm.prank(bob);
        vm.expectRevert("Overpayment or duplicate");
        escrow.pay(FEE + 1);
        pay(bob, FEE);
        vm.prank(bob);
        vm.expectRevert("Overpayment or duplicate");
        escrow.pay(1);
        startSpending();
        vm.prank(alice);
        vm.expectRevert("Collection closed");
        escrow.pay(FEE);
    }

    function test_CapsFixedStaffAndOrganizerAccess() public {
        pay(alice, FEE);
        pay(bob, FEE);
        startSpending();
        vm.prank(bob);
        vm.expectRevert("Only organizer");
        escrow.spend(0, 1, bytes32(0));
        vm.startPrank(alice);
        vm.expectRevert("Budget cap");
        escrow.spend(0, 12e6 + 1, bytes32(0));
        vm.expectRevert("Fixed staff payment");
        escrow.spend(2, 1e6, bytes32(0));
        escrow.spend(2, 2e6, bytes32(0));
        vm.expectRevert("Budget cap");
        escrow.spend(2, 1, bytes32(0));
        vm.stopPrank();
    }

    function test_RefundFailureIsolatedAndPayerCanRecover() public {
        pay(alice, FEE);
        pay(bob, FEE);
        finish();
        token.setBlockedRecipient(alice);
        vm.expectRevert();
        escrow.refundFor(alice);
        assertEq(escrow.remainingLiability(), 2 * FEE);
        escrow.refundFor(bob);
        vm.prank(carol);
        escrow.setRefundDestination(venue);
        vm.prank(alice);
        escrow.setRefundDestination(venue);
        escrow.refundFor(alice);
        assertEq(escrow.remainingLiability(), 0);
        assertEq(token.balanceOf(venue), FEE);
        vm.expectRevert("Not refundable");
        escrow.refundFor(alice);
    }

    function test_DirectTransferNeverCreditsNorEntersRefundPool() public {
        pay(alice, FEE);
        token.mint(address(escrow), 9e6);
        assertEq(escrow.unaccountedBalance(), 9e6);
        assertEq(escrow.paidCount(), 1);
        finish();
        escrow.refundFor(alice);
        assertEq(escrow.totalRefunded(), FEE);
        assertEq(escrow.unaccountedBalance(), 9e6);
    }

    function test_AuthorizationRelayerNoAllowanceRequired() public {
        token.mint(alice, FEE);
        bytes32 nonce = keccak256("authorization");
        (uint8 signatureV, bytes32 signatureR, bytes32 signatureS) = vm.sign(ALICE_KEY,
            token.digest(alice, address(escrow), FEE, 0, 1_003_600, nonce));
        vm.prank(venue);
        escrow.payWithAuthorization(alice, FEE, 0, 1_003_600, nonce, signatureV, signatureR, signatureS);
        assertEq(escrow.paidCount(), 1);
        assertEq(token.allowance(alice, address(escrow)), 0);
        vm.expectRevert("Overpayment or duplicate");
        escrow.payWithAuthorization(alice, FEE, 0, 1_003_600, nonce, signatureV, signatureR, signatureS);
    }

    function test_AuthorizationCannotSpoofPayer() public {
        bytes32 nonce = keccak256("spoof");
        (uint8 signatureV, bytes32 signatureR, bytes32 signatureS) = vm.sign(ALICE_KEY,
            token.digest(alice, address(escrow), FEE, 0, 1_003_600, nonce));
        vm.expectRevert("Bad signature");
        escrow.payWithAuthorization(bob, FEE, 0, 1_003_600, nonce, signatureV, signatureR, signatureS);
        assertEq(escrow.totalCollected(), 0);
    }

    function test_FeeOnTransferAndReentrancyRejected() public {
        token.setFeeOnTransfer(true, 1);
        token.mint(alice, FEE);
        vm.startPrank(alice);
        token.approve(address(escrow), FEE);
        vm.expectRevert("Unsupported token");
        escrow.pay(FEE);
        vm.stopPrank();
        assertEq(escrow.totalCollected(), 0);
        token.setFeeOnTransfer(false, 0);
        token.setReentrantTarget(address(escrow), abi.encodeCall(escrow.pay, (1)));
        vm.prank(alice);
        vm.expectRevert();
        escrow.pay(FEE);
    }

    function test_FinalizationDeadlineAndNativeValueRejected() public {
        vm.expectRevert("Cannot finalize");
        escrow.finalize();
        startSpending();
        vm.expectRevert("Wait for deadline");
        escrow.finalize();
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool success,) = address(escrow).call{value: 1 ether}("");
        assertFalse(success);
        finish();
        vm.prank(alice);
        vm.expectRevert("Not spending");
        escrow.spend(0, 1, bytes32(0));
    }

    function testFuzz_ExactConservation(uint96 partialSeed, uint96 spendSeed) public {
        uint256 partialAmount = bound(partialSeed, 0, FEE - 1);
        uint256 expense = bound(spendSeed, 1, 12e6);
        pay(alice, FEE);
        pay(bob, FEE);
        if (partialAmount > 0) pay(carol, partialAmount);
        startSpending();
        vm.prank(alice);
        escrow.spend(0, expense, bytes32(0));
        finish();
        escrow.refundFor(alice);
        escrow.refundFor(bob);
        escrow.refundFor(carol);
        assertEq(escrow.totalCollected(), escrow.totalSpent() + escrow.totalRefunded());
        assertEq(token.balanceOf(carol), partialAmount);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_ProductionDeploymentRejectsMainnet() public {
        vm.chainId(5042);
        MeetupEscrowBase.Budget[] memory budgets = new MeetupEscrowBase.Budget[](1);
        budgets[0] = MeetupEscrowBase.Budget(venue, FEE, 0, 0, false);
        vm.expectRevert("Testnet only");
        new MeetupEscrowTestnet(alice, MeetupEscrowBase.Terms(keccak256("terms"), FEE,
            3, block.timestamp + 1 hours, block.timestamp + 1 days, false), budgets);
    }

    function test_BatchIsolatesFailureAndRetriesWithoutDoublePay() public {
        pay(alice, FEE);
        pay(bob, FEE);
        finish();
        address[] memory payers = new address[](3);
        payers[0] = alice;
        payers[1] = bob;
        payers[2] = venue;
        token.setBlockedRecipient(alice);
        escrow.refundBatch(payers);
        assertEq(token.balanceOf(bob), FEE);
        assertEq(escrow.remainingLiability(), FEE);
        vm.prank(alice);
        escrow.setRefundDestination(venue);
        escrow.refundBatch(payers);
        assertEq(token.balanceOf(bob), FEE);
        assertEq(token.balanceOf(venue), FEE);
        assertEq(escrow.remainingLiability(), 0);
        payers = new address[](21);
        vm.expectRevert("Bad batch size");
        escrow.refundBatch(payers);
    }

    function test_ScheduledMerchantPaymentRequiresTimeAndCannotPayStaff() public {
        MeetupEscrowBase.Budget[] memory budgets = new MeetupEscrowBase.Budget[](1);
        budgets[0] = MeetupEscrowBase.Budget(venue, FEE, 0, 1_003_600, true);
        escrow = new MeetupHarness(address(token), alice,
            MeetupEscrowBase.Terms(keccak256("terms"), FEE, 3, 1_003_600, 1_086_400, false), budgets);
        register(alice);
        pay(alice, FEE);
        vm.expectRevert("Not scheduled");
        escrow.executeScheduled(0);
        startSpending();
        vm.prank(alice);
        vm.expectRevert("Scheduled payments pending");
        escrow.finalize();
        vm.prank(bob);
        escrow.executeScheduled(0);
        assertEq(token.balanceOf(venue), FEE);
        vm.expectRevert("Already paid");
        escrow.executeScheduled(0);
        vm.prank(alice);
        escrow.finalize();
        escrow.refundFor(alice);
        assertEq(escrow.remainingLiability(), 0);
        budgets[0] = MeetupEscrowBase.Budget(bob, FEE, 2, 1_007_200, true);
        vm.expectRevert("Bad automatic payment");
        new MeetupHarness(address(token), alice,
            MeetupEscrowBase.Terms(keccak256("terms"), FEE, 3, 1_007_200, 1_086_400, false), budgets);
    }

    function test_ExchangeTransferCannotCreditRegisteredWallet() public {
        token.mint(venue, FEE);
        vm.prank(venue);
        token.transfer(address(escrow), FEE);
        (,,uint256 paid,,) = escrow.members(alice);
        assertEq(paid, 0);
        assertEq(escrow.totalCollected(), 0);
        assertEq(escrow.unaccountedBalance(), FEE);
    }

    function test_AuthorizationExpiryWrongEventAndReplay() public {
        token.mint(alice, FEE);
        bytes32 nonce = keccak256("partial authorization");
        (uint8 signatureV, bytes32 signatureR, bytes32 signatureS) = vm.sign(ALICE_KEY,
            token.digest(alice, address(escrow), FEE / 2, 0, 1_003_600, nonce));
        escrow.payWithAuthorization(alice, FEE / 2, 0, 1_003_600, nonce, signatureV, signatureR, signatureS);
        vm.expectRevert("Nonce used");
        escrow.payWithAuthorization(alice, FEE / 2, 0, 1_003_600, nonce, signatureV, signatureR, signatureS);
        bytes32 otherNonce = keccak256("wrong event");
        (signatureV, signatureR, signatureS) = vm.sign(ALICE_KEY,
            token.digest(alice, venue, FEE / 2, 0, 1_003_600, otherNonce));
        vm.expectRevert("Bad signature");
        escrow.payWithAuthorization(alice, FEE / 2, 0, 1_003_600, otherNonce, signatureV, signatureR, signatureS);
        vm.expectRevert("Authorization expired");
        escrow.payWithAuthorization(alice, FEE / 2, 0, 999_999, otherNonce, signatureV, signatureR, signatureS);
    }

    function test_MaxCapacityFinalizationAndNoArbitraryOrganizerWithdrawal() public {
        MeetupEscrowBase.Budget[] memory budgets = new MeetupEscrowBase.Budget[](1);
        budgets[0] = MeetupEscrowBase.Budget(venue, FEE, 0, 0, false);
        escrow = new MeetupHarness(address(token), alice,
            MeetupEscrowBase.Terms(keccak256("terms"), FEE, 100, 1_003_600, 1_086_400, false), budgets);
        for (uint256 memberId = 1; memberId <= 100; memberId++) {
            address payer = address(uint160(memberId + 10_000));
            register(payer);
            pay(payer, FEE);
        }
        vm.prank(alice);
        vm.expectRevert(bytes("Full"));
        escrow.register(keccak256("extra"), alice);
        startSpending();
        vm.startPrank(alice);
        (bool withdrawn,) = address(escrow).call(abi.encodeWithSignature("withdraw(address,uint256)", alice, FEE));
        assertFalse(withdrawn);
        escrow.spend(0, FEE, bytes32(0));
        assertEq(token.balanceOf(alice), 0);
        uint256 gasBefore = gasleft();
        escrow.finalize();
        assertLt(gasBefore - gasleft(), 8_000_000);
        vm.stopPrank();
        assertEq(escrow.remainingLiability(), FEE * 99);
    }
}
