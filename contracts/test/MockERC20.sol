// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockERC20
 * @notice Minimal ERC-20 for Foundry tests. Supports fee-on-transfer,
 *         reentrancy simulation on transferFrom, and blocked-recipient simulation
 *         on outgoing transfer (to test claimFor isolation).
 */
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ── Fee-on-transfer ───────────────────────────────────────────────────────
    bool    public feeOnTransferEnabled;
    uint256 public feePercent;

    // ── Reentrancy on transferFrom (incoming) ────────────────────────────────
    address public reentrantTarget;
    bytes   public reentrantData;
    bool    private _triggerReentrantOnNextTransferFrom;

    // ── Reentrancy on outgoing transfer (transfer, not transferFrom) ──────────
    address public reentrantTargetOnTransfer;
    bytes   public reentrantDataOnTransfer;
    bool    private _triggerReentrantOnNextTransfer;

    // ── Blocked recipient (outgoing transfer only) ────────────────────────────
    // When set, any `transfer` or `transferFrom` whose `to` matches this address reverts.
    address private _blockedRecipient;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name     = name_;
        symbol   = symbol_;
        decimals = decimals_;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function mint(address to, uint256 amount) public {
        require(to != address(0), "Zero to");
        totalSupply      += amount;
        balanceOf[to]    += amount;
        emit Transfer(address(0), to, amount);
    }

    function setFeeOnTransfer(bool enabled, uint256 feePercent_) public {
        require(feePercent_ <= 100, "Fee too high");
        feeOnTransferEnabled = enabled;
        feePercent           = feePercent_;
    }

    /**
     * @notice Configure reentrancy injection on the next transferFrom (incoming deposit path).
     */
    function setReentrantTarget(address target, bytes calldata data) external {
        reentrantTarget                       = target;
        reentrantData                         = data;
        _triggerReentrantOnNextTransferFrom   = true;
    }

    /**
     * @notice Configure reentrancy injection on the next outgoing transfer() call.
     *         Used to test that claimFor and execute are protected by ReentrancyGuard.
     */
    function setReentrantTargetOnTransfer(address target, bytes calldata data) external {
        reentrantTargetOnTransfer         = target;
        reentrantDataOnTransfer           = data;
        _triggerReentrantOnNextTransfer   = true;
    }

    /**
     * @notice Block all outgoing transfers whose `to` == `recipient`.
     *         Passing address(0) clears the block.
     */
    function setBlockedRecipient(address recipient) external {
        _blockedRecipient = recipient;
    }

    // ── ERC-20 ────────────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount, false);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "Insufficient allowance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }

        _transfer(from, to, amount, true);
        return true;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount, bool isFromExternal) internal {
        require(from != address(0), "Zero from");
        require(to   != address(0), "Zero to");
        require(balanceOf[from] >= amount, "Insufficient balance");

        // Blocked-recipient check: simulates a recipient contract that always
        // reverts on receipt (e.g. a blocklisted address or a contract with no
        // fallback). This causes claimFor to revert for that participant.
        if (_blockedRecipient != address(0) && to == _blockedRecipient) {
            revert("Transfer blocked");
        }

        // Reentrancy injection on transferFrom (incoming deposit path).
        if (isFromExternal && _triggerReentrantOnNextTransferFrom && reentrantTarget != address(0)) {
            _triggerReentrantOnNextTransferFrom = false;
            (bool ok, ) = reentrantTarget.call(reentrantData);
            require(ok, "Reentrant call failed");
        }

        // Reentrancy injection on outgoing transfer() (claimFor / execute path).
        if (!isFromExternal && _triggerReentrantOnNextTransfer && reentrantTargetOnTransfer != address(0)) {
            _triggerReentrantOnNextTransfer = false;
            (bool ok, ) = reentrantTargetOnTransfer.call(reentrantDataOnTransfer);
            require(ok, "Reentrant call failed");
        }

        balanceOf[from] -= amount;

        uint256 fee = 0;
        if (feeOnTransferEnabled && feePercent > 0) {
            fee = (amount * feePercent) / 100;
        }

        uint256 received = amount - fee;
        balanceOf[to] += received;
        emit Transfer(from, to, received);

        if (fee > 0) {
            totalSupply -= fee;
            emit Transfer(from, address(0), fee);
        }
    }
}
