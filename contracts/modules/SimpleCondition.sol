// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IRecoveryCondition.sol";
import "../interfaces/IRecoverable.sol";

contract SimpleCondition is IRecoveryCondition {
    address public trustedGuardian;
    address public recoverableContract;
    bool public recoveryTriggered;

    event RecoveryTriggered(address indexed contractAddress, address indexed newOwner, address indexed guardian);
    event RecoveryReset(address indexed caller);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event RecoverableContractSet(address indexed recoverableContract);

    constructor(address _guardian, address _recoverableContract) {
        require(_guardian != address(0), "Guardian cannot be zero address");
        trustedGuardian = _guardian;
        recoverableContract = _recoverableContract;
        recoveryTriggered = false;
    }

    function triggerRecovery(address newOwner) external onlyGuardian {
        require(!recoveryTriggered, "Recovery already triggered");
        IRecoverable(recoverableContract).startRecovery(newOwner);
        recoveryTriggered = true;
        emit RecoveryTriggered(recoverableContract, newOwner, msg.sender);
    }

    function resetRecovery() external override onlyRecoverableContract {
        recoveryTriggered = false;
        emit RecoveryReset(msg.sender);
    }

    function setRecoverableContract(address _recoverableContract) external onlyGuardian {
        require(recoverableContract == address(0), "Recoverable contract already set");
        require(_recoverableContract != address(0), "Recoverable contract cannot be zero address");
        recoverableContract = _recoverableContract;
        emit RecoverableContractSet(_recoverableContract);
    }

    function isRecoverable() external view override returns (bool) {
        return recoveryTriggered;
    }

    function canTriggerRecovery() external view override returns (bool) {
        return !recoveryTriggered;
    }

    function updateGuardian(address _newGuardian) external onlyGuardian {
        require(_newGuardian != address(0), "Guardian cannot be zero address");
        address oldGuardian = trustedGuardian;
        trustedGuardian = _newGuardian;
        emit GuardianUpdated(oldGuardian, _newGuardian);
    }

    modifier onlyGuardian() {
        require(msg.sender == trustedGuardian, "Only trusted guardian can call this function");
        _;
    }

    modifier onlyRecoverableContract() {
        require(msg.sender == recoverableContract, "Only recoverable contract can call this function");
        _;
    }
}
