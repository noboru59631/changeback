// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ChangeBackVaultBase} from "../ChangeBackVaultBase.sol";

/**
 * @title ChangeBackVaultHarness
 * @notice Test-only concrete subclass. Accepts an arbitrary token address so
 *         tests can inject MockERC20. Never deployed in production; production
 *         uses ChangeBackVault which hard-codes the USDC address.
 */
contract ChangeBackVaultHarness is ChangeBackVaultBase {
    address private immutable _token;

    constructor(
        address[] memory _participants,
        uint256 _threshold,
        uint256 _collectUntil,
        uint256 _spendUntil,
        address _guardian,
        address token_
    ) ChangeBackVaultBase(_participants, _threshold, _collectUntil, _spendUntil, _guardian) {
        require(token_ != address(0), "Zero token");
        _token = token_;
    }

    function _usdcToken() internal view override returns (address) {
        return _token;
    }

    /// @dev Test-only accessor for proposal approvalCount.
    function proposals_approvalCount(uint256 id) external view returns (uint256) {
        return proposals[id].approvalCount;
    }

    /// @dev Test-only accessor for proposal executed flag.
    function proposals_executed(uint256 id) external view returns (bool) {
        return proposals[id].executed;
    }
}
