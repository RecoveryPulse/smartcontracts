// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IRecoveryCondition.sol";

contract SimpleRecoveryCondition is IRecoveryCondition {
    address public trustedGuardian;
    bool public recoveryTriggered;

    event RecoveryTriggered(address indexed by, address indexed contractAddress);

    constructor(address _guardian) {
        trustedGuardian = _guardian;
        recoveryTriggered = false;
    }

    function triggerRecovery(address contractAddress) external {
        require(msg.sender == trustedGuardian, "Only trusted guardian can trigger recovery");
        recoveryTriggered = true;
        emit RecoveryTriggered(msg.sender, contractAddress);
    }

    function isRecoverable(address /*contractAddress*/) external view override returns (bool) {
        return recoveryTriggered;
    }
}
