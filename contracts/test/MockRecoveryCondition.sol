// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IRecoveryCondition.sol";
import "../interfaces/IRecoverable.sol";

contract MockRecoveryCondition is IRecoveryCondition {
    bool public shouldReturn;
    address public recoverableContract;

    constructor(bool _shouldReturn) {
        shouldReturn = _shouldReturn;
    }

    function isRecoverable() external view override returns (bool) {
        return shouldReturn;
    }

    function canTriggerRecovery() external view override returns (bool) {
        return shouldReturn;
    }

    function triggerRecovery(address newOwner) external override {
        // Actually call startRecovery on the target contract (like real implementations do)
        require(recoverableContract != address(0), "Recoverable contract not set");
        IRecoverable(recoverableContract).startRecovery(newOwner);
    }

    function resetRecovery() external override {
        // Mock implementation - does nothing but satisfies the interface
    }

    function setShouldReturn(bool _shouldReturn) external {
        shouldReturn = _shouldReturn;
    }

    function setRecoverableContract(address _recoverableContract) external {
        recoverableContract = _recoverableContract;
    }
} 