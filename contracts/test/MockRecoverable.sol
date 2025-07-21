// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IRecoverable.sol";

contract MockRecoverable is IRecoverable {
    address public owner;
    
    event RecoveryStarted(address indexed newOwner);
    event RecoveryCancelled();
    
    constructor() {
        owner = msg.sender;
    }
    
    function startRecovery(address _newOwner) external {
        // Mock implementation - just emit an event
        emit RecoveryStarted(_newOwner);
    }
    
    function cancelRecovery() external {
        // Mock implementation - just emit an event
        emit RecoveryCancelled();
    }
} 