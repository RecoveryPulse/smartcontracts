// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IRecoveryCondition.sol";

contract MockRecoveryCondition is IRecoveryCondition {
    bool public shouldReturn;

    constructor(bool _shouldReturn) {
        shouldReturn = _shouldReturn;
    }

    function isRecoverable() external view override returns (bool) {
        return shouldReturn;
    }

    function canTriggerRecovery() external view override returns (bool) {
        return shouldReturn;
    }

    function triggerRecovery(address contractAddress, address newOwner) external override {
        // Mock implementation - does nothing but satisfies the interface
        // In a real implementation, this might change the state
    }

    function resetRecovery() external override {
        // Mock implementation - does nothing but satisfies the interface
    }

    function setShouldReturn(bool _shouldReturn) external {
        shouldReturn = _shouldReturn;
    }
} 