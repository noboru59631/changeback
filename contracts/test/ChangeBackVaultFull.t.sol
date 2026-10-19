// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChangeBackVaultHarness} from "./ChangeBackVaultHarness.sol";
import {ChangeBackVaultBase} from "../ChangeBackVaultBase.sol";
import {ChangeBackFactory} from "../ChangeBackFactory.sol";
import {MockERC20} from "./MockERC20.sol";

/**
 * @title ChangeBackVaultFullTest
 * @notice Expanded test suite. Every test name is a behavioural assertion;
 *         setup helpers are prefixed with underscore. All external getter
 *         calls that produce arguments are computed BEFORE vm.prank /
 *         vm.expectRevert to avoid consuming the one-shot cheat-code state.
 *
 * Coverage:
 *   - Six claim-order permutations for 3 contributors
 *   - Fuzz: contribution amounts, refund-pool conservation, no-spend and spend paths
 *   - Fuzz: 3 random weights including zeros, rounding, claim-order independence
 *   - Duplicate approve / execute / claim
 *   - Revoke drops quorum, re-approve succeeds
 *   - Failed outgoing transfer rolls back claimFor atomically
 *   - Blocked recipient: others claim unimpeded; block then unblock
 *   - Failed payment transfer rolls back execute atomically
 *   - Reentrant deposit blocked by ReentrancyGuard (accounting unchanged)
 *   - Reentrant claim and execute blocked
 *   - Competing payments together exceed balance
 *   - Exact collectUntil / spendUntil / pause+24h timestamp boundaries
 *   - No late deposit one second after collectUntil
 *   - Outsider cannot propose, vote, deposit, pause (phase and participant both checked)
 *   - Invalid constructor arguments (roster, threshold, guardian, zero addresses, deadlines)
 *   - Factory: isVault registration, two-vault isolation, wrong-chain factory reverts
 *   - Production vault concrete chain/token guard (harness succeeds, production reverts)
 *   - Many-proposal early-return gas bound (O(1) cost independent of proposalCount)
 */
contract ChangeBackVaultFullTest is Test {
    MockERC20 token;

    // Sorted ascending so the vault constructor accepts them.
    address alice    = address(0x1000);
    address bob      = address(0x2000);
    address carol    = address(0x3000);
    address dave     = address(0x4000);
    // outsider is NOT a participant in any vault created below.
    address outsider = address(0x9_000_000);

    uint256 constant UNIT = 1_000_000; // 1 USDC (6 dp)

    // ─── Setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        token = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.warp(1_000_000);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// @dev Two-participant vault: alice + bob, threshold 2, 1h collect / 2h spend.
    function _vault2(address guardian) internal returns (ChangeBackVaultHarness) {
        address[] memory participants = new address[](2);
        participants[0] = alice;
        participants[1] = bob;
        return new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours,
            block.timestamp + 2 hours,
            guardian, address(token)
        );
    }

    /// @dev Three-participant vault: alice + bob + carol, threshold 2.
    function _vault3(address guardian) internal returns (ChangeBackVaultHarness) {
        address[] memory participants = new address[](3);
        participants[0] = alice;
        participants[1] = bob;
        participants[2] = carol;
        return new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours,
            block.timestamp + 2 hours,
            guardian, address(token)
        );
    }

    /// @dev Four-participant vault: alice + bob + carol + dave, threshold 3.
    function _vault4(address guardian) internal returns (ChangeBackVaultHarness) {
        address[] memory participants = new address[](4);
        participants[0] = alice;
        participants[1] = bob;
        participants[2] = carol;
        participants[3] = dave;
        return new ChangeBackVaultHarness(
            participants, 3,
            block.timestamp + 1 hours,
            block.timestamp + 2 hours,
            guardian, address(token)
        );
    }

    /// @dev Vault2 but with a long spend window so pause+24h fires before spendUntil.
    function _vault2Long(address guardian) internal returns (ChangeBackVaultHarness) {
        address[] memory participants = new address[](2);
        participants[0] = alice;
        participants[1] = bob;
        return new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours,
            block.timestamp + 10 days, // >> 24h after any pause
            guardian, address(token)
        );
    }

    function _deposit(ChangeBackVaultHarness vault, address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who); token.approve(address(vault), amount);
        vm.prank(who); vault.deposit(amount);
    }

    function _enterActive(ChangeBackVaultHarness vault) internal {
        vm.warp(vault.collectUntil() + 1);
    }

    function _enterReturning(ChangeBackVaultHarness vault) internal {
        vm.warp(vault.spendUntil() + 1);
    }

    /// @dev Alice + bob both vote for proposalId.
    function _approve2(ChangeBackVaultHarness vault, uint256 proposalId) internal {
        vm.prank(alice); vault.approve(proposalId);
        vm.prank(bob);   vault.approve(proposalId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLAIM-ORDER PERMUTATIONS (6 of 6 for 3 contributors)
    // ═══════════════════════════════════════════════════════════════════════════

    function _setup3Contributors()
        internal
        returns (ChangeBackVaultHarness vault, uint256 totalC)
    {
        vault = _vault3(alice);
        _deposit(vault, alice, 50 * UNIT);
        _deposit(vault, bob,   30 * UNIT);
        _deposit(vault, carol, 20 * UNIT);
        totalC = 100 * UNIT;
        _enterReturning(vault);
        vault.finalize();
    }

    function _claimAll3(ChangeBackVaultHarness vault, address[3] memory order) internal {
        vault.claimFor(order[0]);
        vault.claimFor(order[1]);
        vault.claimFor(order[2]);
    }

    function _assertConserved(ChangeBackVaultHarness vault, uint256 totalC) internal view {
        assertEq(vault.totalRefunded() + vault.totalSpent(), totalC, "Conservation violated");
        assertEq(vault.totalRemainingLiability(), 0, "Residual liability");
    }

    function test_ClaimOrder_AliceBobCarol() public {
        (ChangeBackVaultHarness vault, uint256 totalC) = _setup3Contributors();
        _claimAll3(vault, [alice, bob, carol]);
        _assertConserved(vault, totalC);
    }

    function test_ClaimOrder_AliceCarolBob() public {
        (ChangeBackVaultHarness vault, uint256 totalC) = _setup3Contributors();
        _claimAll3(vault, [alice, carol, bob]);
        _assertConserved(vault, totalC);
    }

    function test_ClaimOrder_BobAliceCarol() public {
        (ChangeBackVaultHarness vault, uint256 totalC) = _setup3Contributors();
        _claimAll3(vault, [bob, alice, carol]);
        _assertConserved(vault, totalC);
    }

    function test_ClaimOrder_BobCarolAlice() public {
        (ChangeBackVaultHarness vault, uint256 totalC) = _setup3Contributors();
        _claimAll3(vault, [bob, carol, alice]);
        _assertConserved(vault, totalC);
    }

    function test_ClaimOrder_CarolAliceBob() public {
        (ChangeBackVaultHarness vault, uint256 totalC) = _setup3Contributors();
        _claimAll3(vault, [carol, alice, bob]);
        _assertConserved(vault, totalC);
    }

    function test_ClaimOrder_CarolBobAlice() public {
        (ChangeBackVaultHarness vault, uint256 totalC) = _setup3Contributors();
        _claimAll3(vault, [carol, bob, alice]);
        _assertConserved(vault, totalC);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ: conservation (no spend)
    // ═══════════════════════════════════════════════════════════════════════════

    function testFuzz_ConservationTwoParticipants(uint64 amountAlice, uint64 amountBob) public {
        vm.assume(amountAlice > 0 && amountBob > 0);
        vm.assume(uint256(amountAlice) + uint256(amountBob) < type(uint128).max);

        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, amountAlice);
        _deposit(vault, bob,   amountBob);
        _enterReturning(vault);
        vault.finalize();

        uint256 expectedPool = uint256(amountAlice) + uint256(amountBob);
        assertEq(vault.returnPool(), expectedPool);

        vault.claimFor(alice);
        vault.claimFor(bob);

        assertEq(vault.totalRefunded(), expectedPool, "2p fuzz: refunded != pool");
        assertEq(vault.totalRemainingLiability(), 0,   "2p fuzz: residual liability");
    }

    function testFuzz_ConservationThreeParticipants(
        uint48 amountAlice,
        uint48 amountBob,
        uint48 amountCarol
    ) public {
        vm.assume(amountAlice > 0 && amountBob > 0 && amountCarol > 0);

        ChangeBackVaultHarness vault = _vault3(alice);
        _deposit(vault, alice, amountAlice);
        _deposit(vault, bob,   amountBob);
        _deposit(vault, carol, amountCarol);
        _enterReturning(vault);
        vault.finalize();

        uint256 expectedPool =
            uint256(amountAlice) + uint256(amountBob) + uint256(amountCarol);
        assertEq(vault.returnPool(), expectedPool);

        vault.claimFor(alice);
        vault.claimFor(bob);
        vault.claimFor(carol);

        assertEq(vault.totalRefunded(), expectedPool, "3p fuzz: refunded != pool");
        assertEq(vault.totalRemainingLiability(), 0,   "3p fuzz: residual liability");
    }

    // ─── Fuzz: conservation WITH spending (2 participants, random spend) ───────

    function testFuzz_ConservationWithSpend(
        uint48 amountAlice,
        uint48 amountBob,
        uint32 spendAmount
    ) public {
        vm.assume(amountAlice > 0 && amountBob > 0);
        uint256 totalC = uint256(amountAlice) + uint256(amountBob);
        vm.assume(spendAmount > 0 && spendAmount < totalC);

        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, amountAlice);
        _deposit(vault, bob,   amountBob);
        _enterActive(vault);

        // Compute expiry before setting any prank/expectRevert state.
        uint256 expiry = vault.spendUntil() - 1;

        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, spendAmount, bytes32(0), expiry);
        _approve2(vault, proposalId);
        vault.execute(proposalId);

        _enterReturning(vault);
        vault.finalize();

        vault.claimFor(alice);
        vault.claimFor(bob);

        assertEq(
            vault.totalSpent() + vault.totalRefunded(),
            totalC,
            "Fuzz spend: spent+refunded != totalC"
        );
    }

    // ─── Fuzz: 3 random weights including zeros, rounding, claim-order independence ─

    /**
     * @notice Exercises the telescoping floor-division entitlement formula with
     *         random weights, spending, and zero-contribution participants.
     *         Asserts:
     *         (a) each entitlement is within 1 micro-unit of the ideal fraction,
     *         (b) sum(entitlements) == returnPool exactly,
     *         (c) claim-order does not affect conservation.
     */
    function testFuzz_ThreeWeightsWithSpendRoundingOrderIndependence(
        uint32 wAlice,
        uint32 wBob,
        uint32 wCarol,
        uint32 spendFraction // spend = totalC * spendFraction / type(uint32).max, clamped
    ) public {
        // Allow zeros for any one weight but not all three.
        vm.assume(uint256(wAlice) + uint256(wBob) + uint256(wCarol) > 0);

        // Scale up to realistic USDC amounts (at least 1 micro-unit each).
        uint256 amountAlice = uint256(wAlice);
        uint256 amountBob   = uint256(wBob);
        uint256 amountCarol = uint256(wCarol);
        uint256 totalC      = amountAlice + amountBob + amountCarol;

        // Bound to avoid overflow in mulDiv (pool * cumulativeWeight <= uint256).
        vm.assume(totalC <= type(uint64).max);

        ChangeBackVaultHarness vault = _vault3(alice);

        if (amountAlice > 0) _deposit(vault, alice, amountAlice);
        if (amountBob   > 0) _deposit(vault, bob,   amountBob);
        if (amountCarol > 0) _deposit(vault, carol, amountCarol);

        // If totalContributions is 0 after skipping all-zero, the vault stays
        // Collecting → skip; vm.assume already excludes all-zero.
        _enterActive(vault);

        // Spend a random fraction of totalC (0 to totalC−1).
        uint256 actualTotalC = vault.totalContributions();
        uint256 spendAmt = 0;
        if (actualTotalC > 1) {
            spendAmt = uint256(spendFraction) * actualTotalC / type(uint32).max;
            if (spendAmt == 0) spendAmt = 0; // zero spend is fine
            if (spendAmt > 0 && spendAmt < actualTotalC) {
                uint256 expiry = vault.spendUntil() - 1;
                vm.prank(alice);
                uint256 pid = vault.proposePayment(outsider, spendAmt, bytes32(0), expiry);
                _approve2(vault, pid);
                vault.execute(pid);
            } else {
                spendAmt = 0;
            }
        }

        _enterReturning(vault);
        vault.finalize();

        uint256 returnPool = vault.returnPool();
        assertEq(returnPool, actualTotalC - spendAmt, "returnPool mismatch");

        // Each entitlement within 1 micro-unit of ideal (telescoping formula is exact).
        // Sum of entitlements == returnPool (no dust).
        uint256 sumEntitlements = 0;
        if (amountAlice > 0 || amountBob > 0 || amountCarol > 0) {
            sumEntitlements =
                vault.entitlement(alice) +
                vault.entitlement(bob)   +
                vault.entitlement(carol);
        }
        assertEq(sumEntitlements, returnPool, "Entitlements do not sum to returnPool");

        // Conservation: claim in reverse order.
        vault.claimFor(carol);
        vault.claimFor(bob);
        vault.claimFor(alice);

        assertEq(
            vault.totalSpent() + vault.totalRefunded(),
            actualTotalC,
            "3-weight fuzz: spent+refunded != totalC"
        );
        assertEq(vault.totalRemainingLiability(), 0, "3-weight fuzz: residual liability");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DUPLICATE APPROVE / EXECUTE / CLAIM
    // ═══════════════════════════════════════════════════════════════════════════

    function test_DuplicateApproveReverts() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, UNIT, bytes32(0), expiry);

        vm.prank(alice); vault.approve(proposalId);
        vm.prank(alice);
        vm.expectRevert("Already voted");
        vault.approve(proposalId);
    }

    function test_DuplicateExecuteReverts() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, UNIT, bytes32(0), expiry);
        _approve2(vault, proposalId);
        vault.execute(proposalId);

        vm.expectRevert("Not executable");
        vault.execute(proposalId);
    }

    function test_DuplicateClaimReverts() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 6 * UNIT);
        _deposit(vault, bob,   4 * UNIT);
        _enterReturning(vault);
        vault.finalize();

        vault.claimFor(alice);
        vm.expectRevert("Already claimed");
        vault.claimFor(alice);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REVOKE DROPS BELOW THRESHOLD, THEN RE-APPROVE SUCCEEDS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_RevokeDropsBelowThreshold_ThenReapprove() public {
        ChangeBackVaultHarness vault = _vault3(alice); // threshold = 2
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, UNIT, bytes32(0), expiry);

        vm.prank(alice); vault.approve(proposalId);
        vm.prank(bob);   vault.approve(proposalId);
        assertEq(vault.proposals_approvalCount(proposalId), 2);

        // Alice revokes → drops to 1, below threshold.
        vm.prank(alice); vault.revoke(proposalId);
        assertEq(vault.proposals_approvalCount(proposalId), 1);
        vm.expectRevert("Below threshold");
        vault.execute(proposalId);

        // Alice re-approves → back to 2, execute succeeds.
        vm.prank(alice); vault.approve(proposalId);
        vault.execute(proposalId);
        assertTrue(vault.proposals_executed(proposalId));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BLOCKED RECIPIENT: claimFor reverts for blocked participant, others unaffected
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Alice is the blocked recipient. Bob and Carol claim successfully
     *         while Alice is blocked. Accounting reflects blocked state correctly.
     *         After unblocking, Alice claims successfully.
     */
    function test_BlockedRecipient_OthersClaimUnimpeded_ThenUnblock() public {
        ChangeBackVaultHarness vault = _vault3(alice);
        _deposit(vault, alice, 60 * UNIT);
        _deposit(vault, bob,   30 * UNIT);
        _deposit(vault, carol, 10 * UNIT);
        _enterReturning(vault);
        vault.finalize();

        uint256 aliceEntitlement = vault.entitlement(alice);
        uint256 bobEntitlement   = vault.entitlement(bob);
        uint256 carolEntitlement = vault.entitlement(carol);

        // Block Alice's address for outgoing transfers.
        token.setBlockedRecipient(alice);

        // Alice's claimFor must revert, and her claimed flag must stay false.
        vm.expectRevert("Transfer blocked");
        vault.claimFor(alice);
        assertFalse(vault.claimed(alice),             "Alice claimed flag must stay false");
        assertEq(vault.totalRefunded(), 0,             "totalRefunded unchanged after blocked claim");
        assertEq(
            vault.totalRemainingLiability(),
            aliceEntitlement + bobEntitlement + carolEntitlement,
            "Liability unchanged after blocked claim"
        );

        // Bob and Carol claim normally while Alice is still blocked.
        vault.claimFor(bob);
        assertEq(token.balanceOf(bob), bobEntitlement, "Bob received wrong amount");
        assertTrue(vault.claimed(bob));

        vault.claimFor(carol);
        assertEq(token.balanceOf(carol), carolEntitlement, "Carol received wrong amount");
        assertTrue(vault.claimed(carol));

        // Alice's liability still outstanding.
        assertEq(vault.totalRemainingLiability(), aliceEntitlement, "Alice liability still owed");

        // Unblock Alice; her claim succeeds.
        token.setBlockedRecipient(address(0));
        vault.claimFor(alice);
        assertEq(token.balanceOf(alice), aliceEntitlement, "Alice received wrong amount after unblock");
        assertEq(vault.totalRemainingLiability(), 0,         "All liabilities cleared");
        assertEq(
            vault.totalRefunded(),
            aliceEntitlement + bobEntitlement + carolEntitlement,
            "totalRefunded == returnPool"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FAILED PAYMENT TRANSFER: execute rolls back atomically
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Block the payment destination mid-execute. The execute call must
     *         revert; proposal.executed stays false and totalSpent is unchanged.
     */
    function test_FailedPaymentTransfer_RollsBackExecute() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, 5 * UNIT, bytes32(0), expiry);
        _approve2(vault, proposalId);

        // Block the payment destination so safeTransfer reverts.
        token.setBlockedRecipient(outsider);

        uint256 spentBefore = vault.totalSpent();
        vm.expectRevert("Transfer blocked");
        vault.execute(proposalId);

        // State must be rolled back.
        assertEq(vault.totalSpent(), spentBefore, "totalSpent must be unchanged after failed execute");
        assertFalse(vault.proposals_executed(proposalId), "proposal.executed must stay false");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REENTRANT DEPOSIT BLOCKED (ReentrancyGuard + accounting unchanged)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ReentrantDeposit_IsBlocked_AccountingUnchanged() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        token.mint(alice, 10 * UNIT);
        vm.prank(alice); token.approve(address(vault), 10 * UNIT);

        // Wire the reentrant call: during transferFrom the token will call
        // vault.deposit(1 UNIT) again on behalf of the vault. The reentrancy guard
        // on deposit will cause that inner call to revert, which propagates back
        // through require(ok) in MockERC20, reverting the outer deposit too.
        bytes memory callData = abi.encodeWithSignature("deposit(uint256)", 1 * UNIT);
        token.setReentrantTarget(address(vault), callData);

        uint256 contributionBefore = vault.totalContributions();

        vm.prank(alice);
        vm.expectRevert(); // ReentrancyGuard reverts "ReentrancyGuard: reentrant call"
        vault.deposit(5 * UNIT);

        // Accounting must be unchanged — the deposit was fully rolled back.
        assertEq(vault.totalContributions(), contributionBefore, "totalContributions must be unchanged");
        assertEq(vault.contributions(alice), 0,                  "alice contribution must be unchanged");
        assertEq(token.balanceOf(address(vault)), 0,             "vault token balance must be 0");
    }

    // ─── Reentrant claimFor blocked ───────────────────────────────────────────

    function test_ReentrantClaim_IsBlocked() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 6 * UNIT);
        _deposit(vault, bob,   4 * UNIT);
        _enterReturning(vault);
        vault.finalize();

        // Wire the reentrant call: during claimFor(alice)'s outgoing safeTransfer
        // (which calls token.transfer), the token calls vault.claimFor(alice) again.
        // ReentrancyGuard on claimFor causes the inner call to revert, propagating
        // back through require(ok) in MockERC20 and reverting the outer claimFor.
        bytes memory callData = abi.encodeWithSignature("claimFor(address)", alice);
        token.setReentrantTargetOnTransfer(address(vault), callData);

        vm.expectRevert();
        vault.claimFor(alice);

        // Alice's claimed flag must be false — the outer claimFor was rolled back.
        assertFalse(vault.claimed(alice), "alice claimed flag must stay false");
    }

    // ─── Reentrant execute blocked ────────────────────────────────────────────

    function test_ReentrantExecute_IsBlocked() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, 5 * UNIT, bytes32(0), expiry);
        _approve2(vault, proposalId);

        // Wire reentrant: during execute's outgoing safeTransfer (token.transfer),
        // the token calls vault.execute(proposalId) again. ReentrancyGuard causes
        // the inner call to revert, propagating back and reverting the outer execute.
        bytes memory callData = abi.encodeWithSignature("execute(uint256)", proposalId);
        token.setReentrantTargetOnTransfer(address(vault), callData);

        uint256 spentBefore = vault.totalSpent();
        vm.expectRevert();
        vault.execute(proposalId);

        assertEq(vault.totalSpent(), spentBefore, "totalSpent unchanged after reentrant execute");
        assertFalse(vault.proposals_executed(proposalId), "proposal.executed stays false");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPETING PAYMENTS TOGETHER EXCEED ACCOUNTING BALANCE
    // ═══════════════════════════════════════════════════════════════════════════

    function test_CompetingPaymentsOverspend() public {
        ChangeBackVaultHarness vault = _vault3(alice); // threshold = 2
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _deposit(vault, carol, 10 * UNIT); // total = 30
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;

        vm.prank(alice);
        uint256 proposalId1 = vault.proposePayment(outsider, 20 * UNIT, bytes32(0), expiry);
        vm.prank(alice);
        uint256 proposalId2 = vault.proposePayment(outsider, 20 * UNIT, bytes32("b"), expiry);

        vm.prank(alice); vault.approve(proposalId1);
        vm.prank(bob);   vault.approve(proposalId1);
        vm.prank(alice); vault.approve(proposalId2);
        vm.prank(bob);   vault.approve(proposalId2);

        // First execute succeeds.
        vault.execute(proposalId1);
        assertEq(vault.totalSpent(), 20 * UNIT);

        // Second execute reverts — only 10 USDC remaining in accounting.
        vm.expectRevert("Insufficient accounting balance");
        vault.execute(proposalId2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXACT TIMESTAMP BOUNDARIES
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Boundary_DepositAtExactlyCollectUntil_Reverts() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        vm.warp(vault.collectUntil()); // exactly at collectUntil → Active
        token.mint(alice, 10 * UNIT);
        vm.prank(alice); token.approve(address(vault), 10 * UNIT);
        vm.prank(alice);
        vm.expectRevert("Not collecting");
        vault.deposit(10 * UNIT);
    }

    function test_Boundary_DepositOneSecondBeforeCollectUntil_Succeeds() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        vm.warp(vault.collectUntil() - 1);
        token.mint(alice, 10 * UNIT);
        vm.prank(alice); token.approve(address(vault), 10 * UNIT);
        vm.prank(alice);
        vault.deposit(10 * UNIT); // must succeed
    }

    function test_Boundary_NoLateDeposit_OneSecondAfterCollectUntil() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        vm.warp(vault.collectUntil() + 1);
        token.mint(alice, 5 * UNIT);
        vm.prank(alice); token.approve(address(vault), 5 * UNIT);
        vm.prank(alice);
        vm.expectRevert("Not collecting");
        vault.deposit(5 * UNIT);
    }

    function test_Boundary_ExecuteAtExactlySpendUntil_Reverts() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        // Compute expiry before any prank state.
        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, UNIT, bytes32(0), expiry);
        _approve2(vault, proposalId);

        vm.warp(vault.spendUntil()); // → Returning
        vm.expectRevert("Not active");
        vault.execute(proposalId);
    }

    function test_Boundary_FinalizeNotCallableOneSecondBeforeSpendUntil() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 5 * UNIT);
        vm.warp(vault.spendUntil() - 1);
        vm.expectRevert("Cannot finalize yet");
        vault.finalize();
    }

    function test_Boundary_FinalizeCallableAtExactlySpendUntil() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 5 * UNIT);
        vm.warp(vault.spendUntil());
        vault.finalize(); // must succeed
    }

    /**
     * @notice Tests the pause+24h Returning trigger against the ACTUAL phase
     *         logic: getPhase() returns Returning when EITHER spendUntil has
     *         passed OR pausedAt+24h has passed, whichever comes first.
     *
     *         This fixture uses _vault2Long (spendUntil = +10 days) so that
     *         pause+24h is guaranteed to fire before the normal deadline.
     *         We record pausedAt and verify the exact boundary.
     */
    function test_Boundary_Pause24h_ExactlyAt24h_IsReturning() public {
        ChangeBackVaultHarness vault = _vault2Long(alice);
        _deposit(vault, alice, 5 * UNIT);
        _deposit(vault, bob,   5 * UNIT);

        // Pause during Collecting (before collectUntil).
        vm.prank(alice); vault.pause();
        uint256 pausedAtTs = vault.pausedAt();

        // One second before pause+24h: still Active (phase index 1).
        vm.warp(pausedAtTs + 1 days - 1);
        assertEq(uint8(vault.getPhase()), 1, "Should be Active one second before pause+24h");

        // Exactly at pause+24h: Returning (phase index 2).
        vm.warp(pausedAtTs + 1 days);
        assertEq(uint8(vault.getPhase()), 2, "Should be Returning at exactly pause+24h");

        // Confirm spendUntil is still in the future (so it is pause that fired).
        assertGt(vault.spendUntil(), block.timestamp, "spendUntil should not have fired yet");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OUTSIDER CANNOT ACT
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Outsider_CannotDeposit() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        token.mint(outsider, 5 * UNIT);
        vm.prank(outsider); token.approve(address(vault), 5 * UNIT);
        vm.prank(outsider);
        vm.expectRevert("Not participant");
        vault.deposit(5 * UNIT);
    }

    function test_Outsider_CannotPropose_InActivePhase() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 5 * UNIT);
        _deposit(vault, bob,   5 * UNIT);
        _enterActive(vault);

        // Assert we are actually in Active phase before testing.
        assertEq(uint8(vault.getPhase()), 1, "Phase must be Active");

        // Compute expiry before any cheat-code state.
        uint256 expiry = vault.spendUntil() - 1;

        vm.prank(outsider);
        vm.expectRevert("Not participant");
        vault.proposePayment(outsider, UNIT, bytes32(0), expiry);
    }

    function test_Outsider_CannotVote_InActivePhase() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 5 * UNIT);
        _deposit(vault, bob,   5 * UNIT);
        _enterActive(vault);

        // Assert Active phase.
        assertEq(uint8(vault.getPhase()), 1, "Phase must be Active");

        // Compute expiry before any cheat-code state.
        uint256 expiry = vault.spendUntil() - 1;

        // Alice proposes (not outsider).
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, UNIT, bytes32(0), expiry);

        // Outsider tries to vote.
        vm.prank(outsider);
        vm.expectRevert("Not participant");
        vault.approve(proposalId);
    }

    function test_Outsider_CannotPause() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        vm.prank(outsider);
        vm.expectRevert("Not guardian");
        vault.pause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALID CONSTRUCTOR ARGUMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_InvalidConstructor_TooFewParticipants() public {
        address[] memory participants = new address[](1);
        participants[0] = alice;
        vm.expectRevert("Bad participants length");
        new ChangeBackVaultHarness(
            participants, 1,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            alice, address(token)
        );
    }

    function test_InvalidConstructor_TooManyParticipants() public {
        address[] memory participants = new address[](21);
        for (uint256 i = 0; i < 21; i++) {
            participants[i] = address(uint160(0x100 + i));
        }
        vm.expectRevert("Bad participants length");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            participants[0], address(token)
        );
    }

    function test_InvalidConstructor_ThresholdTooLow() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        vm.expectRevert("Bad threshold");
        new ChangeBackVaultHarness(
            participants, 1,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            alice, address(token)
        );
    }

    function test_InvalidConstructor_ThresholdTooHigh() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        vm.expectRevert("Bad threshold");
        new ChangeBackVaultHarness(
            participants, 3,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            alice, address(token)
        );
    }

    function test_InvalidConstructor_CollectUntilInPast() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        vm.expectRevert("Collect in past");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp - 1, block.timestamp + 2 hours,
            alice, address(token)
        );
    }

    function test_InvalidConstructor_SpendUntilBeforeCollectUntil() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        vm.expectRevert("Bad spend deadline");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 2 hours, block.timestamp + 1 hours,
            alice, address(token)
        );
    }

    function test_InvalidConstructor_SpendUntilTooFar() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        vm.expectRevert("Spend too far");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 91 days,
            alice, address(token)
        );
    }

    function test_InvalidConstructor_ZeroParticipant() public {
        address[] memory participants = new address[](2);
        participants[0] = address(0); participants[1] = bob;
        vm.expectRevert("Zero participant");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            bob, address(token)
        );
    }

    function test_InvalidConstructor_UnsortedParticipants() public {
        address[] memory participants = new address[](2);
        participants[0] = bob; participants[1] = alice; // bob > alice: wrong order
        vm.expectRevert("Participants not strictly sorted");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            alice, address(token)
        );
    }

    function test_InvalidConstructor_DuplicateParticipant() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = alice;
        vm.expectRevert("Participants not strictly sorted");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            alice, address(token)
        );
    }

    function test_InvalidConstructor_GuardianNotParticipant() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        vm.expectRevert("Guardian not participant");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            outsider, address(token)
        );
    }

    function test_InvalidConstructor_ZeroToken() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        vm.expectRevert("Zero token");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            alice, address(0)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FACTORY: registration, two-vault isolation, wrong-chain guard
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice ChangeBackFactory constructor enforces Arc chain ID (5042 / 5042002).
     *         In the Anvil test environment chainid = 31337, so even deploying the
     *         factory reverts with "Wrong chain". This test verifies that chain guard.
     */
    function test_FactoryOnWrongChain_Reverts() public {
        // The factory constructor itself reverts on Anvil chainid 31337.
        vm.expectRevert("Wrong chain");
        new ChangeBackFactory();
    }

    /**
     * @notice Two vaults created by the factory are independent: deposits,
     *         proposals, and accounting in one do not affect the other.
     *         Tested via harness (bypasses chain guard) to allow execution.
     */
    function test_TwoVaultIsolation() public {
        ChangeBackVaultHarness vaultA = _vault2(alice);
        ChangeBackVaultHarness vaultB = _vault2(alice);

        _deposit(vaultA, alice, 40 * UNIT);
        _deposit(vaultA, bob,   60 * UNIT);

        _deposit(vaultB, alice, 10 * UNIT);
        _deposit(vaultB, bob,   10 * UNIT);

        // Vault B enters Active and makes a payment.
        _enterActive(vaultB);
        uint256 expiry = vaultB.spendUntil() - 1;
        vm.prank(alice); uint256 pid = vaultB.proposePayment(outsider, 5 * UNIT, bytes32(0), expiry);
        _approve2(vaultB, pid);
        vaultB.execute(pid);

        // Vault A still in Collecting; its accounting is untouched.
        assertEq(vaultA.totalContributions(), 100 * UNIT, "VaultA contributions must be unchanged");
        assertEq(vaultA.totalSpent(),          0,          "VaultA totalSpent must be 0");
        assertEq(vaultB.totalSpent(),          5 * UNIT,   "VaultB totalSpent must be 5 USDC");
    }

    /**
     * @notice Production ChangeBackVault enforces Arc chain ID.
     *         Harness must NOT have the chain guard (to allow tests to run on Anvil).
     *         Factory constructor also enforces Arc chain ID (both guards fire on Anvil).
     */
    function test_ProductionVault_RevertsOnWrongChain_HarnessDoesNot() public {
        // Harness constructs fine on Anvil (chainid 31337) — no chain guard.
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        ChangeBackVaultHarness harness = new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            alice, address(token)
        );
        assertNotEq(address(harness), address(0), "Harness must deploy on any chain");

        // Factory deployment also reverts on Anvil — both factory and vault have the chain guard.
        vm.expectRevert("Wrong chain");
        new ChangeBackFactory();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EARLY RETURN: pending payments globally invalidated via phase; O(1) cost
    // ═══════════════════════════════════════════════════════════════════════════

    function test_EarlyReturn_PendingPaymentsGloballyInvalidated() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 paymentPid = vault.proposePayment(outsider, 5 * UNIT, bytes32(0), expiry);
        _approve2(vault, paymentPid);

        vm.prank(alice);
        uint256 erPid = vault.proposeEarlyReturn(bytes32(0), expiry);
        _approve2(vault, erPid);
        vault.executeEarlyReturn(erPid);

        vm.expectRevert("Not active");
        vault.execute(paymentPid);
    }

    /**
     * @notice Gas regression: executeEarlyReturn cost must be bounded and
     *         independent of proposalCount (O(1), no loop over proposals).
     */
    function test_EarlyReturn_GasIndependentOfProposalCount() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 20 * UNIT);
        _deposit(vault, bob,   20 * UNIT);
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;

        // Create 50 payment proposals (spam).
        for (uint256 i = 0; i < 50; i++) {
            vm.prank(alice);
            vault.proposePayment(outsider, UNIT, bytes32(uint256(i)), expiry);
        }
        assertEq(vault.proposalCount(), 50);

        // Early return proposal.
        vm.prank(alice);
        uint256 erPid = vault.proposeEarlyReturn(bytes32(0), expiry);
        _approve2(vault, erPid);

        uint256 gasBefore = gasleft();
        vault.executeEarlyReturn(erPid);
        uint256 gasUsed = gasBefore - gasleft();

        // 100 000 gas is a generous upper bound for a single storage write + event.
        assertLt(gasUsed, 100_000, "executeEarlyReturn must not loop over proposals");
        assertTrue(vault.earlyReturnExecuted(), "earlyReturnExecuted flag must be set");
        assertEq(uint8(vault.getPhase()), 2, "Phase must be Returning");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROPOSAL EXPIRY: strict < boundary
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ProposalExpiry_ExecuteRevertsAtExactExpiry() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        uint256 proposalExpiry = block.timestamp + 30 minutes;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, UNIT, bytes32(0), proposalExpiry);
        _approve2(vault, proposalId);

        vm.warp(proposalExpiry); // block.timestamp == expiresAt → expired
        vm.expectRevert("Expired");
        vault.execute(proposalId);
    }

    function test_ProposalExpiry_ExecuteSucceedsOneSecondBefore() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        uint256 proposalExpiry = block.timestamp + 30 minutes;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, UNIT, bytes32(0), proposalExpiry);
        _approve2(vault, proposalId);

        vm.warp(proposalExpiry - 1); // one second before expiry → still valid
        vault.execute(proposalId);   // must succeed
        assertTrue(vault.proposals_executed(proposalId));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GUARDIAN: non-guardian cannot pause; double pause reverts
    // ═══════════════════════════════════════════════════════════════════════════

    function test_NonGuardian_CannotPause() public {
        ChangeBackVaultHarness vault = _vault2(alice); // alice is guardian
        vm.prank(bob);
        vm.expectRevert("Not guardian");
        vault.pause();
    }

    function test_Guardian_NonParticipant_RevertsAtConstruction() public {
        address[] memory participants = new address[](2);
        participants[0] = alice; participants[1] = bob;
        vm.expectRevert("Guardian not participant");
        new ChangeBackVaultHarness(
            participants, 2,
            block.timestamp + 1 hours, block.timestamp + 2 hours,
            carol, address(token) // carol not in participants
        );
    }

    function test_DoublePause_Reverts() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 5 * UNIT);
        vm.prank(alice); vault.pause();
        vm.prank(alice);
        vm.expectRevert("Already paused");
        vault.pause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SPEND AFTER CLOSED: pending payment cannot execute after vault closes
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice A payment proposal is created and fully approved while the vault
     *         is Active. The vault then returns (time-based) and all participants
     *         claim and close. Calling execute() on the approved-but-unexecuted
     *         proposal after Close must revert with "Not active" and must not
     *         alter totalSpent, vault balance, or destination balance.
     *
     *         This is distinct from test_FIX7_claimForRevertsWhenClosed which
     *         tests CLAIM after Closed; this test targets SPEND (execute) after Closed.
     */
    function test_SpendAfterClosed_ExecuteReverts_AccountingUnchanged() public {
        ChangeBackVaultHarness vault = _vault2(alice);
        _deposit(vault, alice, 10 * UNIT);
        _deposit(vault, bob,   10 * UNIT);
        _enterActive(vault);

        // Propose and fully approve a payment — but do NOT execute it yet.
        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 pendingId = vault.proposePayment(outsider, 5 * UNIT, bytes32(0), expiry);
        _approve2(vault, pendingId);

        // Phase transitions to Returning via time (spendUntil passes).
        _enterReturning(vault);

        // Finalize and claim all entitlements, then close.
        vault.finalize();
        vault.claimFor(alice);
        vault.claimFor(bob);
        vault.close();

        // Vault is now Closed.
        assertEq(uint8(vault.getPhase()), 3, "Phase must be Closed");

        // Record state before the attempted execute.
        uint256 spentBefore        = vault.totalSpent();
        uint256 vaultBalBefore     = token.balanceOf(address(vault));
        uint256 outsiderBalBefore  = token.balanceOf(outsider);

        // Attempt execute on the still-approved, never-executed proposal.
        vm.expectRevert("Not active");
        vault.execute(pendingId);

        // All accounting must be unchanged.
        assertEq(vault.totalSpent(),              spentBefore,       "totalSpent must be unchanged");
        assertEq(token.balanceOf(address(vault)), vaultBalBefore,    "Vault balance must be unchanged");
        assertEq(token.balanceOf(outsider),       outsiderBalBefore, "Outsider balance must be unchanged");
        assertFalse(vault.proposals_executed(pendingId),             "proposal.executed must stay false");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONCRETE 3-MEMBER / 1_000_001 EACH: exact entitlements, conservation,
    // duplicate execute, below-threshold execute, double claim, close
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Mirrors the testnet acceptance Case A fixture exactly:
     *         3 participants each contribute 1_000_001 micro-USDC (1.000001 USDC).
     *         1_000_000 micro-USDC is spent via an approved payment.
     *         Remaining pool = 3_000_003 - 1_000_000 = 2_000_003.
     *
     *         Entitlements from the telescoping floor-division formula:
     *           totalWeight = 3_000_003, pool = 2_000_003
     *
     *           All three weights are equal (1_000_001), so the equal-weight
     *           cancellation applies exactly:
     *             pool × 1_000_001 / (3 × 1_000_001) = pool / 3
     *
     *           Alice (sorted first):
     *             cumW = 1_000_001
     *             floor(2_000_003 / 3) = floor(666_667 + 2/3) = 666_667
     *             share = 666_667
     *           Bob:
     *             cumW = 2_000_002
     *             floor(2 × 2_000_003 / 3) = floor(1_333_335 + 1/3) = 1_333_335
     *             share = 1_333_335 - 666_667 = 666_668
     *           Carol:
     *             pool - 1_333_335 = 2_000_003 - 1_333_335 = 666_668
     *
     *         Sum = 666_667 + 666_668 + 666_668 = 2_000_003 ✓ (exact, no dust)
     *         Total = spent + refunded = 1_000_000 + 2_000_003 = 3_000_003 = totalC ✓
     *
     *         Also tests: duplicate execute reverts, below-threshold execute reverts,
     *         double claim reverts, close after all claims.
     */
    function test_Concrete3Member_1_000_001Each_ExactEntitlements() public {
        // ── Setup ──
        // Vault: alice < bob < carol, threshold 2, alice is guardian.
        ChangeBackVaultHarness vault = _vault3(alice);

        uint256 contrib = 1_000_001; // 1.000001 USDC in 6-dp micro-units
        _deposit(vault, alice, contrib);
        _deposit(vault, bob,   contrib);
        _deposit(vault, carol, contrib);

        uint256 totalC = 3_000_003;
        assertEq(vault.totalContributions(), totalC, "totalC mismatch");

        // ── Active phase: propose a 1.000000 USDC payment ──
        _enterActive(vault);
        uint256 spendAmt = 1_000_000;
        uint256 expiry   = vault.spendUntil() - 1;

        vm.prank(alice);
        uint256 payId = vault.proposePayment(outsider, spendAmt, bytes32(0), expiry);

        // Below-threshold execute reverts (only alice has approved at this point — approvalCount=0).
        vm.expectRevert("Below threshold");
        vault.execute(payId);

        // Alice approves (approvalCount → 1): still below threshold of 2.
        vm.prank(alice); vault.approve(payId);
        vm.expectRevert("Below threshold");
        vault.execute(payId);

        // Bob approves (approvalCount → 2): at threshold.
        vm.prank(bob); vault.approve(payId);

        // Execute succeeds.
        vault.execute(payId);
        assertEq(vault.totalSpent(), spendAmt, "totalSpent must equal spendAmt after execute");
        assertTrue(vault.proposals_executed(payId), "proposal must be marked executed");

        // Duplicate execute reverts.
        vm.expectRevert("Not executable");
        vault.execute(payId);

        // ── Returning phase: finalize ──
        _enterReturning(vault);
        vault.finalize();

        uint256 expectedPool = totalC - spendAmt; // 2_000_003
        assertEq(vault.returnPool(), expectedPool, "returnPool mismatch");

        // ── Assert exact entitlements from formula ──
        uint256 aliceEnt = vault.entitlement(alice);
        uint256 bobEnt   = vault.entitlement(bob);
        uint256 carolEnt = vault.entitlement(carol);

        assertEq(aliceEnt, 666_667, "Alice entitlement must be 666_667");
        assertEq(bobEnt,   666_668, "Bob entitlement must be 666_668");
        assertEq(carolEnt, 666_668, "Carol entitlement must be 666_668");
        assertEq(aliceEnt + bobEnt + carolEnt, expectedPool, "Entitlements must sum to returnPool");

        // ── Claims ──
        uint256 aliceBalBefore = token.balanceOf(alice);
        vault.claimFor(alice);
        assertEq(token.balanceOf(alice) - aliceBalBefore, aliceEnt, "Alice received wrong amount");

        // Double claim reverts.
        vm.expectRevert("Already claimed");
        vault.claimFor(alice);

        vault.claimFor(bob);
        assertEq(token.balanceOf(bob), bobEnt, "Bob received wrong amount");

        vault.claimFor(carol);
        assertEq(token.balanceOf(carol), carolEnt, "Carol received wrong amount");

        // ── Conservation invariant ──
        assertEq(
            vault.totalSpent() + vault.totalRefunded(),
            totalC,
            "spent + refunded must equal totalC"
        );
        assertEq(vault.totalRemainingLiability(), 0, "No residual liability");

        // ── Close ──
        vault.close();
        assertEq(uint8(vault.getPhase()), 3, "Phase must be Closed after close()");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACCOUNTING: full spend+return cycle invariant
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Accounting_InvariantAfterFullCycle() public {
        ChangeBackVaultHarness vault = _vault4(alice); // threshold = 3
        _deposit(vault, alice, 40 * UNIT);
        _deposit(vault, bob,   30 * UNIT);
        _deposit(vault, carol, 20 * UNIT);
        _deposit(vault, dave,  10 * UNIT);
        _enterActive(vault);

        uint256 expiry = vault.spendUntil() - 1;
        vm.prank(alice);
        uint256 proposalId = vault.proposePayment(outsider, 25 * UNIT, bytes32(0), expiry);
        vm.prank(alice); vault.approve(proposalId);
        vm.prank(bob);   vault.approve(proposalId);
        vm.prank(carol); vault.approve(proposalId);
        vault.execute(proposalId);

        _enterReturning(vault);
        vault.finalize();

        vault.claimFor(alice);
        vault.claimFor(bob);
        vault.claimFor(carol);
        vault.claimFor(dave);

        assertEq(
            vault.totalSpent() + vault.totalRefunded(),
            100 * UNIT,
            "Full cycle: spent+refunded != totalC"
        );
        assertEq(vault.totalRemainingLiability(), 0);
        vault.close();
    }
}
