// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRecoveryCondition.sol";
import "./interfaces/IRecoverable.sol";

/**
 * @title Recoverable
 * @dev Enables ownership recovery of a contract based on customizable conditions and a cooldown period.
 *
 * ## Core Concepts:
 * - **Owner:** Standard Ownable pattern; can update recovery condition, cancel, or reset recovery.
 * - **Recovery Condition:** An external contract (IRecoveryCondition) that decides when recovery is allowed.
 * - **Cooldown Period:** Limits how frequently recovery actions (like updating conditions, starting or finalizing recovery) can occur.
 * - **Status:** Keeps track (Inactive, Active, Successful, Cancelled) of the recovery process.
 * - **Pending Owner:** New prospective owner during the recovery process.
 *
 * ## Workflow:
 * 1. **Initialize:** Owner sets recovery condition contract and cooldown period on deployment.
 * 2. **Start Recovery:** The recovery condition contract can initiate recovery for a new address, setting status to Active and pendingOwner.
 * 3. **Cancel Recovery:** The owner can cancel recovery when active.
 * 4. **Finalize Recovery:** The pendingOwner finalizes if the recovery condition contract allows, then ownership is transferred.
 * 5. **Reset:** Owner can reset all recovery state and the external recovery condition.
 */
contract Recoverable is IRecoverable, Ownable {
    // Possible stages of the recovery process
    enum RecoveryStatus { Inactive, Active, Successful, Cancelled }

    address public pendingOwner; // Address proposed to become the new owner during recovery
    RecoveryStatus public recoveryStatus; // Tracks the current recovery process state

    IRecoveryCondition public recoveryConditionContract; // Contract containing logic for recovery conditions
    uint256 public cooldownPeriod;    // Minimum seconds before recovery actions can repeat
    uint256 public lastRecoveryChange; // Last time a recovery action happened

    event RecoveryStarted(address indexed newOwner);
    event RecoveryCancelled();
    event RecoveryFinalised(address indexed newOwner);
    event RecoveryConditionUpdated(address indexed conditionContract, uint256 cooldown);

    /**
     * @dev Ensures that cooldown period has elapsed since the last recovery action.
     */
    modifier cooldownPassed() {
        require(block.timestamp >= lastRecoveryChange + cooldownPeriod, "Cooldown not passed");
        _;
    }

    /**
     * @dev Restricts function to only be callable by the recovery condition contract.
     */
    modifier onlyRecoveryCondition() {
        require(msg.sender == address(recoveryConditionContract), "Only recovery condition can call this function");
        _;
    }

    /**
     * @param _recoveryCondition Address of the contract that governs recovery permission/condition.
     * @param _cooldownPeriod Minimum time in seconds between recovery process changes.
     */
    constructor(address _recoveryCondition, uint256 _cooldownPeriod) Ownable(msg.sender) {
        recoveryConditionContract = IRecoveryCondition(_recoveryCondition);
        cooldownPeriod = _cooldownPeriod;
        recoveryStatus = RecoveryStatus.Inactive;
        lastRecoveryChange = block.timestamp;
    }

    /**
     * @dev Allows the owner to set a new recovery condition contract, but only after cooldown.
     * @param _newCondition Address of the new recovery condition contract.
     */
    function updateRecoveryCondition(address _newCondition) external onlyOwner cooldownPassed {
        recoveryConditionContract = IRecoveryCondition(_newCondition);
        lastRecoveryChange = block.timestamp;
        emit RecoveryConditionUpdated(_newCondition, cooldownPeriod);
    }

    /**
     * @dev Initiates recovery. Only the external recovery condition contract can call this.
     * @param _newOwner Proposed new owner if recovery is completed.
     */
    function startRecovery(address _newOwner) external onlyRecoveryCondition cooldownPassed {
        require(recoveryStatus == RecoveryStatus.Inactive, "Recovery already active");
        pendingOwner = _newOwner;
        recoveryStatus = RecoveryStatus.Active;
        emit RecoveryStarted(_newOwner);
    }

    /**
     * @dev Owner can cancel an in-progress recovery process.
     */
    function cancelRecovery() external onlyOwner {
        require(recoveryStatus == RecoveryStatus.Active, "No active recovery");
        recoveryStatus = RecoveryStatus.Cancelled;
        emit RecoveryCancelled();
    }

    /**
     * @dev Pending owner finalizes the recovery, if allowed by the recovery condition.
     * Transfers contract ownership and resets recovery data/state.
     */
    function finaliseRecovery() external {
        require(recoveryStatus == RecoveryStatus.Active, "Recovery not active");
        require(msg.sender == pendingOwner, "Only pending owner can finalise");

        bool allowed = recoveryConditionContract.isRecoverable();
        require(allowed, "Recovery condition not met");

        _transferOwnership(pendingOwner);
        pendingOwner = address(0);
        lastRecoveryChange = block.timestamp;
        emit RecoveryFinalised(owner());

        // Reset state and requirement in the recovery condition contract
        recoveryConditionContract.resetRecovery();
        recoveryStatus = RecoveryStatus.Inactive;
    }
    
    /**
     * @dev Owner can reset all recovery state to Inactive and also signal the condition contract to reset.
     */
    function resetRecovery() external onlyOwner {
        recoveryStatus = RecoveryStatus.Inactive;
        pendingOwner = address(0);
        lastRecoveryChange = block.timestamp;
        recoveryConditionContract.resetRecovery();
    }
}
