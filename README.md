# Arcane ERC20 token

ARC token is ERC20 token with reflection user's balances mechanism

## Main functionality

- fees:
  - `swapFee` - amount of fee what will be charged on buy/sell and add/remove liquidity actions. This variable includes liquidity and tax fees
  - `transferFee` - amount of fee what will be charged on transfer feom one wallet to another action. This variable includes liquidity and tax fees

- `initialize(address _router, address _owner)` - initialization of contract
 - `address _router` - address of router
 - `address _owner` - address of owner where all tokens will be minted and ownership of contract will be transfered

- `setThreshold(uint256 threshold)` - determine the threshold for the accumulation of the EG tokens for swapAndLiquify can be triggered. Can be called by the owner only
 - `uint256 threshold` - value of the threshold
 
- `includeInReward(address account)` - include account in reward by the owner
 - `address account` - user's address
 
- `setSwapFeePercent(uint256 liquidityFee, uint256 taxFee)` - set swap liquidity and tax fee percent by the owner
 - `uint256 liquidityFee` - value of the liquidity fee percent
 - `uint256 taxFee` - value of the tax fee percent
 
- `setTransferFeePercent(uint256 liquidityFee, uint256 taxFee)`- set swap liquidity and tax fee percent by the owner
 - `uint256 liquidityFee` - value of the liquidity fee percent
 - `uint256 taxFee` - value of the tax fee percent
 
- `setMaxTxPercent(uint256 maxTxPercent)` - set value of the max tx transfer amount 
 - `uint256 maxTxPercent` - percent of supply for max tx transfer amount
 
- `setRouter(address _router)` - set new address of the router by the owner
 - `address _router` - new address of the router

- `withdrawLeftovers()` - withdraw by the owner amount of native tokens (BNB on BscScan) that is as remainder in contract 

- `withdrawAlienToken(address token, address recipient, uint256 amount)` - withdraw alien tokens from the balance of the contract by the owner. Also allow to withdraw elongate tokens from the contract balance in case if `swapAndLiquifyEnabled` is disable (equal `false`)
 - `address token` - address of alien token
 - `address recipient` - address of account that get transfer's amount
 - `uint256 amount` - amount of token to transfer

- `excludeFromReward(address account)` - exclude account from reward by the owner
 - `address account`  - address of account

- `excludeFromFee(address account)` - exclude account from fee by the owner
 - `address account`  - address of account

- `includeInFee(address account)` - include account in fee by the owner
 - `address account`  - address of account

- `isExcludedFromFee(address account)` - return info about exclude account from fee
 - `address account`  - address of account

- `setSwapAndLiquifyEnabled(bool _enabled)` - set enable for swap and liquify by the owner
 - `bool _enabled` - bool value, true - if enable, false - if disable

- `getUnlockTime()` - return lock time

- `lock(uint256 time)` - locks the contract for the owner (set owner to zero address)

- `unlock()` - unlocks the contract for the owner. Return ownership for owner

- `isExcludedFromReward(address account)` - return info about exclude account from reward
 - `address account`  - address of account

- `totalFees()` - return value of total fees

- `transfer(address recipient, uint256 amount)` - transfer amount of tokens from sender to recipient with including taxes if some of users is included in fee


Use this pre-configured template for smart contract projects.

Features:
​
- Truffle
- Ganache
- Solidity Test Coverage 

## Setup

Requirements:
​
- Node >= v12

```
$ npm install        # Install dependencies
```

## Compiling
​
To compile contract run:
​
```
$ npm run compile
```

## Testing
​
First, make sure Ganache is running. To run rpc, run:

```
$ npm run rpc
```
Before running this command please set your infura project id into the script 'rpc' in package.json file.​

Run all tests:
​
```
$ npm run test
```
​
To run tests in a specific file, run:
​
```
$ npm run test [path/to/file]
```
​
To run tests and generate test coverage, run:
​
```
$ npm run coverage
```


## Deploying
​
To deploy contract run:
​
```
$ truffle migrate --network [name/of/specific/network]
```
​You need to choose one network what is defined in truffle-config.js file

