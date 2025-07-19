// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IRecoveryCondition {
    function isRecoverable(address contractAddress) external view returns (bool);
    function canTriggerRecovery(address contractAddress) external view returns (bool);
    function triggerRecovery(address contractAddress, address newOwner) external;
}
