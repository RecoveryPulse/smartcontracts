// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../Recoverable.sol";

/**
 * @title RecoverableLock
 * @dev A simple time-locked vault contract that inherits recovery functionality.
 *
 * ## Use Case:
 * Users can deposit ETH into this lock contract with a specified unlock time.
 * The owner can only withdraw funds after the unlock time has passed.
 * If the owner loses access, the recovery mechanism allows a guardian to
 * initiate ownership transfer to a new address.
 *
 * ## Features:
 * - Time-locked deposits
 * - Owner-only withdrawals (after unlock)
 * - Full recovery capability inherited from Recoverable
 *
 * ## Example Deployment:
 * 1. Deploy SimpleCondition with guardian address and zero address for recoverable
 * 2. Deploy RecoverableLock with condition address, cooldown, and unlock time
 * 3. Call setRecoverableContract on SimpleCondition with RecoverableLock address
 */
contract RecoverableLock is Recoverable {
    uint256 public unlockTime;
    uint256 public totalDeposited;

    event Deposited(address indexed depositor, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event UnlockTimeExtended(uint256 newUnlockTime);

    /**
     * @param _recoveryCondition Address of the recovery condition contract
     * @param _cooldownPeriod Minimum time between recovery actions
     * @param _unlockTime Timestamp when funds become withdrawable
     */
    constructor(
        address _recoveryCondition,
        uint256 _cooldownPeriod,
        uint256 _unlockTime
    ) Recoverable(_recoveryCondition, _cooldownPeriod) {
        require(_unlockTime > block.timestamp, "Unlock time must be in the future");
        unlockTime = _unlockTime;
    }

    /**
     * @dev Allows anyone to deposit ETH into the lock
     */
    function deposit() external payable {
        require(msg.value > 0, "Must deposit something");
        totalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @dev Allows the owner to withdraw all funds after unlock time
     */
    function withdraw() external onlyOwner {
        require(block.timestamp >= unlockTime, "Funds are still locked");
        require(address(this).balance > 0, "No funds to withdraw");

        uint256 amount = address(this).balance;
        totalDeposited = 0;

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(owner(), amount);
    }

    /**
     * @dev Allows the owner to withdraw a specific amount after unlock time
     * @param _amount The amount to withdraw
     */
    function withdrawAmount(uint256 _amount) external onlyOwner {
        require(block.timestamp >= unlockTime, "Funds are still locked");
        require(_amount > 0 && _amount <= address(this).balance, "Invalid amount");

        totalDeposited -= _amount;

        (bool success, ) = payable(owner()).call{value: _amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(owner(), _amount);
    }

    /**
     * @dev Allows the owner to extend the unlock time
     * @param _newUnlockTime New unlock timestamp (must be later than current)
     */
    function extendUnlockTime(uint256 _newUnlockTime) external onlyOwner {
        require(_newUnlockTime > unlockTime, "New unlock time must be later");
        unlockTime = _newUnlockTime;
        emit UnlockTimeExtended(_newUnlockTime);
    }

    /**
     * @dev Returns true if funds are currently locked
     */
    function isLocked() external view returns (bool) {
        return block.timestamp < unlockTime;
    }

    /**
     * @dev Returns time remaining until unlock (0 if already unlocked)
     */
    function timeUntilUnlock() external view returns (uint256) {
        if (block.timestamp >= unlockTime) {
            return 0;
        }
        return unlockTime - block.timestamp;
    }

    /**
     * @dev Returns the current balance of the lock
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Allows contract to receive ETH directly
     */
    receive() external payable {
        totalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value);
    }
}
