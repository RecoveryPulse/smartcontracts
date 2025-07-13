// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../contracts/interfaces/IRecoveryCondition.sol";

contract MockRecoveryCondition is IRecoveryCondition {
    bool public shouldReturn;

    constructor(bool _shouldReturn) {
        shouldReturn = _shouldReturn;
    }

    // Silence state variable not used warning for contractAddress parameter
    // solhint-disable-next-line no-unused-vars
    function isRecoverable(address contractAddress) external view override returns (bool) {
        return shouldReturn;
    }

    function triggerRecovery(address contractAddress) external override {
        // Mock implementation - does nothing but satisfies the interface
        // In a real implementation, this might change the state
    }

    function setShouldReturn(bool _shouldReturn) external {
        shouldReturn = _shouldReturn;
    }
} 