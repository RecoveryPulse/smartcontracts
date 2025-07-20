// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IRecoveryCondition.sol";
import "../interfaces/IRecoverable.sol";

contract RecoveryPulseCondition is IRecoveryCondition {
    // optional and can be 0x0000000000000000000000000000000000000000 for allowing anyone to trigger recovery
    address public trustedGuardian;
    address public maintainer;
    uint256 public lastUpdateTime;
    uint256 public recoveryTimeout;
    uint256 public pulse;
    bool public recoveryTriggered;
    address public recoverableContract;

    event PulseUpdated(address indexed by, uint256 newPulse, uint256 timestamp);
    event RecoveryTriggered(address indexed by, address indexed contractAddress, address indexed newOwner, uint256 timeSinceLastUpdate);
    event RecoveryTimeoutUpdated(uint256 newTimeout);

    modifier onlyGuardian() {
        require(msg.sender == trustedGuardian, "Only trusted guardian can call this function");
        _;
    }

    modifier onlyMaintainer() {
        require(msg.sender == maintainer, "Only maintainer can call this function");
        _;
    }

    modifier onlyRecoverableContract() {
        require(msg.sender == recoverableContract, "Only recoverable contract can call this function");
        _;
    }

    constructor(
        address _guardian,
        address _maintainer,
        address _recoverableContract,
        uint256 _recoveryTimeout
    ) {
        trustedGuardian = _guardian;
        maintainer = _maintainer;
        recoverableContract = _recoverableContract;
        recoveryTimeout = _recoveryTimeout;
        pulse = 0;
        lastUpdateTime = block.timestamp;
        recoveryTriggered = false;
    }

    function _resetRecovery() internal {
        recoveryTriggered = false;
        lastUpdateTime = block.timestamp;
        pulse = 0;
    }

    /**
     * @dev Updates the pulse and resets the last update time
     * @param _newPulse The new pulse value
     * @notice The pulse is a value that is used to determine if the contract is recoverable.
     * @notice The pulse is updated by the maintainer or a smart account module that updates the pulse based of account activity.
     * @notice The pulse is used to determine if the contract is recoverable.
     */
    function updatePulse(uint256 _newPulse) external onlyMaintainer {
        pulse = _newPulse;
        lastUpdateTime = block.timestamp;
        recoveryTriggered = false;
        emit PulseUpdated(msg.sender, _newPulse, block.timestamp);
    }

    /**
     * @dev Allows guardian to trigger recovery if timeout has passed since last update
     * @param contractAddress The address of the contract to recover
     * @param newOwner The new owner address (unused in this implementation)
     */
    function triggerRecovery(address contractAddress, address newOwner) external onlyGuardian {
        require(!recoveryTriggered && isTimeoutExceeded(), "Cannot trigger recovery");
        IRecoverable(contractAddress).startRecovery(newOwner);
        recoveryTriggered = true;
        emit RecoveryTriggered(msg.sender, contractAddress, newOwner, getTimeSinceLastUpdate());
    }

    /**
     * @dev Updates the recovery timeout period
     * @param _newTimeout The new timeout period in seconds
     */
    function updateRecoveryTimeout(uint256 _newTimeout) external onlyMaintainer {
        recoveryTimeout = _newTimeout;
        _resetRecovery();
        emit RecoveryTimeoutUpdated(_newTimeout);
    }

    /**
     * @dev Updates the guardian address
     * @param _newGuardian The new guardian address
     */
    function updateGuardian(address _newGuardian) external onlyMaintainer {
        trustedGuardian = _newGuardian;
        _resetRecovery();
    }

    /**
     * @dev Updates the maintainer address
     * @param _newMaintainer The new maintainer address
     */
    function updateMaintainer(address _newMaintainer) external onlyMaintainer {
        require(_newMaintainer != address(0), "Maintainer cannot be zero address");
        maintainer = _newMaintainer;
        _resetRecovery();
    }

    /**
     * @dev Checks if recovery is allowed
     * @return bool True if recovery is allowed
     */
    function canTriggerRecovery() external view override returns (bool) {
        return !recoveryTriggered && isTimeoutExceeded();
    }

    function isRecoverable() external view override returns (bool) {
        return recoveryTriggered;
    }

    /**
     * @dev Checks if the timeout period has been exceeded since last update
     * @return bool True if timeout is exceeded
     */
    function isTimeoutExceeded() public view returns (bool) {
        return getTimeSinceLastUpdate() >= recoveryTimeout;
    }

    /**
     * @dev Gets the time elapsed since last counter update
     * @return uint256 Time elapsed in seconds
     */
    function getTimeSinceLastUpdate() public view returns (uint256) {
        return block.timestamp - lastUpdateTime;
    }

    /**
     * @dev Gets the time remaining until recovery can be triggered
     * @return uint256 Time remaining in seconds, 0 if timeout already exceeded
     */
    function getTimeUntilRecovery() external view returns (uint256) {
        if (isTimeoutExceeded()) {
            return 0;
        }
        return recoveryTimeout - getTimeSinceLastUpdate();
    }

    /**
     * @dev Resets the recovery state (useful for testing or after successful recovery)
     */
    function resetRecovery() external override onlyRecoverableContract {
        _resetRecovery();
    }
} 