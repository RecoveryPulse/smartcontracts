# Inital Draft

Design takes inspiration from how the Ownable2Step.sol Contract works. 

We have two key things:
* Recovery Address 
* Recovery Algorithm 

## Recovery Address
Address which is the backup address for the contract. In case the recovery is successful this address will get the control of the contract. This can be changed by current owner before / after the process and has cool down period before triggering the recovery once the address is changed. 

## Recovery Process
Process to sucessfully recover the contract's access.

There are two sub components of the Algorithm:
* Recovery Trigger
* Recovery Logic

### Recovery Trigger
Set of condition to kickstart the recovery process.

### Recovery Algorithm
Set of condition that needs to be fullfilled for the successful recovery process.

