// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IRecoveryCondition.sol";
import "../interfaces/IRecoverable.sol";

contract SimpleCondition is IRecoveryCondition {
    address public trustedGuardian;
    bool public recoveryTriggered;

    event RecoveryTriggered(address indexed by, address indexed contractAddress);

    constructor(address _guardian) {
        trustedGuardian = _guardian;
        recoveryTriggered = false;
    }

    function triggerRecovery(address contractAddress, address newOwner) external onlyGuardian {
        IRecoverable(contractAddress).startRecovery(newOwner);
        recoveryTriggered = true;
        emit RecoveryTriggered(msg.sender, contractAddress);
    }

    function resetRecovery() external onlyGuardian {
        recoveryTriggered = false;
    }

    function isRecoverable(address contractAddress) external view override returns (bool) {
        return recoveryTriggered;
    }

    modifier onlyGuardian() {
        require(msg.sender == trustedGuardian, "Only trusted guardian can call this function");
        _;
    }
}
