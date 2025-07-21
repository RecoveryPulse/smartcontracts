// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IRecoveryCondition {
    function isRecoverable() external view returns (bool);
    function canTriggerRecovery() external view returns (bool);
    function triggerRecovery(address contractAddress, address newOwner) external;
    function resetRecovery() external;
}
