// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../node_modules/@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../node_modules/@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "../node_modules/@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Standart Flexible Staking with Role Control mechanism
contract Staking is AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    bytes32 public constant DEV_ROLE = keccak256("DEV_ROLE");

    /// @notice Stores a set of all addresses which want to get DEV_ROLE
    EnumerableSetUpgradeable.AddressSet private _candidates;

    /// @notice Staking token
    /// @return Address of staking token
    IERC20 public stakingToken;
    /// @notice Saves amount of tokens in the staking
    uint256 private _totalSupply;
    /// @notice Saves staked amount for each address
    mapping(address => uint256) private _stakedByAddress;

    /**
    * @notice Staked event is triggered whenever a user stakes tokens
    */
    event Staked(address indexed user, uint256 amount, uint256 timestamp);

    /**
    * @notice Staked event is triggered whenever a user stakes tokens
    */
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);

    /**
    * @notice Staked event is triggered whenever a user create request
    */
    event RequestCreated(address indexed user, bytes32 role, uint256 timestamp);

    /// @dev Initialization
    /// @param _stakingToken address of ERC20 token that will be used for staking
    /// @param admins array of addresses that can withdraw funds
    function initialize(address _stakingToken, address[] memory admins) external initializer {
        stakingToken = IERC20(_stakingToken);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(DEV_ROLE, msg.sender);
        
        for(uint256 i = 0; i < admins.length; i++) {
            grantRole(DEV_ROLE, admins[i]);
        }
    }

    /// @notice Stake some amount of stakingTokens
    /// @dev Transfer amount of stakingTokens from sender to this contract
    /// @param _amount the amount of tokens to stake
    function stake(uint256 _amount) external nonReentrant {
        // Simple check so that user does not stake 0 
        require(_amount > 0, "Cannot stake nothing");
        
        uint256 timestamp = block.timestamp;
        _totalSupply += _amount;
        _stakedByAddress[msg.sender] += _amount;
        stakingToken.transferFrom(msg.sender, address(this), _amount);
        // Emit Staked event
        emit Staked(msg.sender, _amount, timestamp);
    }

    /// @notice Withdraw funds from staking to sender address
    /// @dev Transfer amount of stakingTokens from this contract to sender. Can be called only by DEV_ROLE
    /// @param _amount the amount of tokens to withdraw
    function withdraw(uint256 _amount) external nonReentrant onlyRole(DEV_ROLE) {
        // Check contract balance before withdraw
        require(_amount <= stakingToken.balanceOf(address(this)), "Not enough funds to withdraw");

        uint256 timestamp = block.timestamp;
        _totalSupply -= _amount;
        stakingToken.transfer(msg.sender, _amount);
        // Emit Withdrawn event
        emit Withdrawn(msg.sender, _amount, timestamp);
    }

    /// @notice Creates a request for DEV_ROLE
    /// @dev Adds an address to the array of candidates
    function createRequest() external nonReentrant {
        _candidates.add(msg.sender);
        uint256 timestamp = block.timestamp;
        // Emit RequestCreated event
        emit RequestCreated(msg.sender, DEV_ROLE, timestamp);
    }

    /// @notice Returns amount of staked tokens
    /// @param _account address to check
    /// @return returns total amount of tokens staked by address
    function stakedByAddress(address _account) external view returns(uint256) {
        return _stakedByAddress[_account];
    }
}