// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IRecoverable {
    function startRecovery(address _newOwner) external;
    function cancelRecovery() external;
}
