pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChangeBackVaultHarness} from "./ChangeBackVaultHarness.sol";
import {MockERC20} from "./MockERC20.sol";

contract MeetupLifecycleTest is Test {
    MockERC20 token;
    ChangeBackVaultHarness vault;
    address alice = address(0x1000);
    address bob = address(0x2000);
    address carol = address(0x3000);
    address venue = address(0x9000);

    function setUp() public {
        vm.warp(1_000_000);
        token = new MockERC20("Mock USDC", "USDC", 6);
        address[] memory participants = new address[](3);
        participants[0] = alice;
        participants[1] = bob;
        participants[2] = carol;
        vault = new ChangeBackVaultHarness(participants, 2, block.timestamp + 1 hours,
            block.timestamp + 1 days, alice, address(token));
    }

    function contribute(address participant, uint256 amount) internal {
        token.mint(participant, amount);
        vm.startPrank(participant);
        token.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
        assertEq(token.allowance(participant, address(vault)), 0);
    }

    function test_Meetup_MultiContributor_Pay_EarlyReturn_Refund_Close() public {
        contribute(alice, 40_000);
        contribute(bob, 30_000);
        contribute(carol, 30_000);
        assertEq(vault.totalContributions(), 100_000);
        vm.warp(vault.collectUntil());
        uint256 expiry = vault.spendUntil();
        vm.prank(alice);
        uint256 payment = vault.proposePayment(venue, 30_000, bytes32(0), expiry);
        vm.prank(alice);
        vault.approve(payment);
        vm.expectRevert("Below threshold");
        vault.execute(payment);
        assertEq(token.balanceOf(venue), 0);
        vm.prank(bob);
        vault.approve(payment);
        vault.execute(payment);
        assertEq(token.balanceOf(venue), 30_000);
        vm.expectRevert("Not executable");
        vault.execute(payment);
        vm.prank(carol);
        uint256 early = vault.proposeEarlyReturn(bytes32(0), expiry);
        vm.prank(alice);
        vault.approve(early);
        vm.expectRevert("Below threshold");
        vault.executeEarlyReturn(early);
        vm.prank(carol);
        vault.approve(early);
        vault.executeEarlyReturn(early);
        vm.expectRevert("Not active");
        vault.execute(payment);
        vm.expectRevert("Liabilities outstanding");
        vault.close();
        vault.claimFor(alice);
        vault.claimFor(bob);
        vault.claimFor(carol);
        assertEq(token.balanceOf(alice), 28_000);
        assertEq(token.balanceOf(bob), 21_000);
        assertEq(token.balanceOf(carol), 21_000);
        assertEq(vault.totalSpent() + vault.totalRefunded(), vault.totalContributions());
        assertEq(vault.totalRemainingLiability(), 0);
        assertEq(token.balanceOf(address(vault)), 0);
        vault.close();
        assertTrue(vault.closed());
    }

    function test_CurrentContract_DoesNotEnforceOperationalDepositCap() public {
        contribute(alice, 90_000);
        contribute(alice, 90_000);
        contribute(alice, 90_000);
        assertEq(vault.totalContributions(), 270_000);
    }

    function test_DirectTransfersRemainStrandedBeforeAndAfterClose() public {
        contribute(alice, 40_000);
        token.mint(bob, 10_000);
        vm.prank(bob);
        token.transfer(address(vault), 10_000);
        assertEq(vault.contributions(bob), 0);
        assertEq(vault.strandedSurplus(), 10_000);
        vm.warp(vault.spendUntil());
        vault.claimFor(alice);
        vault.close();
        assertEq(vault.totalRemainingLiability(), 0);
        assertEq(token.balanceOf(address(vault)), 10_000);
        token.mint(carol, 5_000);
        vm.prank(carol);
        token.transfer(address(vault), 5_000);
        assertEq(vault.strandedSurplus(), 15_000);
        vm.expectRevert("Vault closed");
        vault.claimFor(bob);
    }
}
