// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRecoveryCondition.sol";
import "./interfaces/IRecoverable.sol";

contract Recoverable is IRecoverable, Ownable {
    enum RecoveryStatus { Inactive, Active, Successful, Cancelled }

    address public pendingOwner;
    RecoveryStatus public recoveryStatus;

    IRecoveryCondition public recoveryConditionContract;
    uint256 public cooldownPeriod;
    uint256 public lastRecoveryChange;

    event RecoveryStarted(address indexed newOwner);
    event RecoveryCancelled();
    event RecoveryFinalised(address indexed newOwner);
    event RecoveryConditionUpdated(address indexed conditionContract, uint256 cooldown);

    modifier cooldownPassed() {
        require(block.timestamp >= lastRecoveryChange + cooldownPeriod, "Cooldown not passed");
        _;
    }

    modifier onlyRecoveryCondition() {
        require(msg.sender == address(recoveryConditionContract), "Only recovery condition can call this function");
        _;
    }

    constructor(address _recoveryCondition, uint256 _cooldownPeriod) Ownable(msg.sender) {
        recoveryConditionContract = IRecoveryCondition(_recoveryCondition);
        cooldownPeriod = _cooldownPeriod;
        recoveryStatus = RecoveryStatus.Inactive;
        lastRecoveryChange = block.timestamp;
    }

    function updateRecoveryCondition(address _newCondition) external onlyOwner cooldownPassed {
        recoveryConditionContract = IRecoveryCondition(_newCondition);
        lastRecoveryChange = block.timestamp;
        emit RecoveryConditionUpdated(_newCondition, cooldownPeriod);
    }

    function startRecovery(address _newOwner) external onlyRecoveryCondition cooldownPassed {
        require(recoveryStatus == RecoveryStatus.Inactive, "Recovery already active");
        pendingOwner = _newOwner;
        recoveryStatus = RecoveryStatus.Active;
        emit RecoveryStarted(_newOwner);
    }

    function cancelRecovery() external onlyOwner {
        require(recoveryStatus == RecoveryStatus.Active, "No active recovery");
        recoveryStatus = RecoveryStatus.Cancelled;
        emit RecoveryCancelled();
    }

    function finaliseRecovery() external {
        require(recoveryStatus == RecoveryStatus.Active, "Recovery not active");
        require(msg.sender == pendingOwner, "Only pending owner can finalise");

        bool allowed = recoveryConditionContract.isRecoverable();
        require(allowed, "Recovery condition not met");

        _transferOwnership(pendingOwner);
        pendingOwner = address(0);
        lastRecoveryChange = block.timestamp;
        emit RecoveryFinalised(owner());

        // reset recovery condition and status
        recoveryConditionContract.resetRecovery();
        recoveryStatus = RecoveryStatus.Inactive;
    }
}
