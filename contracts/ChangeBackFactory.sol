// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ChangeBackVault} from "./ChangeBackVault.sol";

/**
 * @title ChangeBackFactory
 * @notice Deploys ChangeBackVault instances.
 *         Only deployable on Arc Mainnet (5042) or Arc Testnet (5042002).
 *         Every deployed vault is recorded in `isVault` for on-chain verification.
 *         There is no admin function; the factory cannot touch vault state after creation.
 */
contract ChangeBackFactory {
    // USDC address is the same on Arc Mainnet and Arc Testnet.
    // It is also hard-coded inside ChangeBackVault._usdcToken(); the constant
    // here is kept for informational purposes only.
    address public constant USDC_ADDRESS = 0x3600000000000000000000000000000000000000;

    uint256 public constant ARC_MAINNET_CHAIN_ID = 5042;
    uint256 public constant ARC_TESTNET_CHAIN_ID = 5042002;

    mapping(address => bool) public isVault;
    uint256 public vaultCount;

    event VaultCreated(
        address indexed vault,
        address indexed creator,
        address[] participants,
        uint256 threshold,
        uint256 collectUntil,
        uint256 spendUntil
    );

    constructor() {
        require(
            block.chainid == ARC_MAINNET_CHAIN_ID || block.chainid == ARC_TESTNET_CHAIN_ID,
            "Wrong chain"
        );
    }

    function createVault(
        address[] calldata participants,
        uint256 threshold,
        uint256 collectUntil,
        uint256 spendUntil,
        address guardian
    ) external returns (address) {
        // FIX-3: No _token parameter — token is fixed to USDC inside ChangeBackVault.
        ChangeBackVault vault = new ChangeBackVault(
            participants,
            threshold,
            collectUntil,
            spendUntil,
            guardian
        );

        isVault[address(vault)] = true;
        vaultCount += 1;

        emit VaultCreated(
            address(vault),
            msg.sender,
            participants,
            threshold,
            collectUntil,
            spendUntil
        );

        return address(vault);
    }
}
