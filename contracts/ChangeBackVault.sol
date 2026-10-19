// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ChangeBackVaultBase} from "./ChangeBackVaultBase.sol";

/**
 * @title ChangeBackVault
 * @notice Production vault. Hard-codes the Arc USDC address and enforces that
 *         it is only deployed on Arc Mainnet or Arc Testnet.
 *
 * The constructor does NOT accept a token parameter; the token is fixed.
 * Vaults are deployed by ChangeBackFactory, which records each deployed address
 * in its `isVault` registry. Direct deployment outside the factory is possible
 * at the EVM level but bypasses the registry, so UIs should check
 * `factory.isVault(address)` to confirm factory provenance.
 */
contract ChangeBackVault is ChangeBackVaultBase {
    address private constant USDC = 0x3600000000000000000000000000000000000000;

    uint256 private constant ARC_MAINNET_CHAIN_ID = 5042;
    uint256 private constant ARC_TESTNET_CHAIN_ID = 5042002;

    constructor(
        address[] memory _participants,
        uint256 _threshold,
        uint256 _collectUntil,
        uint256 _spendUntil,
        address _guardian
    ) ChangeBackVaultBase(_participants, _threshold, _collectUntil, _spendUntil, _guardian) {
        require(
            block.chainid == ARC_MAINNET_CHAIN_ID || block.chainid == ARC_TESTNET_CHAIN_ID,
            "Wrong chain"
        );
    }

    function _usdcToken() internal pure override returns (address) {
        return USDC;
    }
}
