// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;
pragma abicoder v2;

import "../node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../node_modules/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUniswapV2Factory.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "../node_modules/@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

/// @title contract special for distribution tokens
contract ArcaneToken is ERC20Upgradeable, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using AddressUpgradeable for address;

    struct FeeValues {
        uint256 _liquidityFee;
        uint256 _taxFee;
    }

    uint256 private constant _MAX = type(uint256).max;
    uint256 private constant _T_Total = 600 * 10**6 * 10**18; // 600m

    IUniswapV2Router02 public uniswapV2Router;
    address public uniswapV2Pair;

    uint256 public maxTxAmount;

    FeeValues public swapFee;
    FeeValues public transferFee;

    bool public swapAndLiquifyEnabled;
    uint8 private _decimals;
    uint256 private _numTokensSellToAddToLiquidity;

    FeeValues private _previousSwapFee;
    FeeValues private _previousTransferFee;

    uint256 private _rTotal;
    uint256 private _tFeeTotal;

    address private _previousOwner;
    uint256 private _lockTime;

    address[] private _excluded;
    bool private _inSwapAndLiquify;

    mapping(address => uint256) private _rOwned;
    mapping(address => uint256) private _tOwned;
    mapping(address => bool) private _isExcludedFromFee;
    mapping(address => bool) private _isExcluded;

    event Threshold(uint256 threshold);
    event SwapAndLiquifyEnabledUpdated(bool enabled);
    event SwapAndLiquify(
        uint256 tokensSwapped,
        uint256 ethReceived,
        uint256 tokensIntoLiquidity
    );
    event Deliver(
        address indexed sender,
        uint256 rAmount,
        uint256 rTotal,
        uint256 tFeeTotal
    );
    event ExcludeFromReward(address indexed account, uint256 tOwned);
    event IncludeInReward(address indexed account, uint256 tOwned);
    event TransferFromSender(
        address indexed sender,
        uint256 tOwned,
        uint256 rOwned
    );
    event TransferToRecipient(
        address indexed recipient,
        uint256 tOwned,
        uint256 rOwned
    );
    event ExcludeFromFee(address indexed account, bool isExcludedFromFee);
    event IncludeInFee(address indexed account, bool isExcludedFromFee);
    event TranferFeePercents(uint256 liquidityFee, uint256 taxFee);
    event SwapFeePercents(uint256 liquidityFee, uint256 taxFee);

    event MaxTxPercent(uint256 maxTxAmount);
    event ReflectFee(uint256 rTotal, uint256 tFeeTotal);
    event TakeLiquidity(uint256 rOwned, uint256 tOwned);
    event RemoveAllFee(
        FeeValues previousSwapFee,
        FeeValues previousTransferFee,
        FeeValues swapFee,
        FeeValues transferFee
    );
    event RestoreAllFee(FeeValues swapFee, FeeValues transferFee);
    event TransferStandard(
        address indexed sender,
        address indexed recipient,
        uint256 rOwnedSender,
        uint256 rOwnedRecipient
    );
    event TransferToExcluded(
        address indexed sender,
        address indexed recipient,
        uint256 rOwnedSender,
        uint256 tOwnedRecipient,
        uint256 rOwnedRecipient
    );
    event TransferFromExcluded(
        address indexed sender,
        address indexed recipient,
        uint256 tOwnedSender,
        uint256 rOwnedSender,
        uint256 rOwnedRecipient
    );
    event WithdrawLeftovers(address indexed recipient, uint256 amount);
    event WithdrawAlienToken(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event ChangeRouter(address indexed router);
    event AddLiquidity(
        uint256 amountToken,
        uint256 amountETH,
        uint256 liquidity
    );

    modifier lockTheSwap() {
        _inSwapAndLiquify = true;
        _;
        _inSwapAndLiquify = false;
    }

    modifier checkZeroAddress(address account) {
        require(account != address(0), "Address can not be zero's");
        _;
    }

    /// @notice Receive BNB
    /// @dev Receive BNB from UniswapV2Router when swapping
    receive() external payable {}

    /// @notice Initialization
    /// @dev Set address of router, create a uniswap pair
    /// and exclude from fee owner and ArcaneToken contract addresses.
    /// Set default Buy/Sell and any router interactions fee as _liquidityFee = 5%, _taxfee = 0%
    /// Set default Transfer fee as _liquidityFee = 5%, _taxfee = 0%
    /// @param _router Address of router for initialize
    /// @param _owner Address of owner. This address will receive all tokens and ownership
    function initialize(address _router, address _owner)
        external
        initializer
        checkZeroAddress(_router)
        checkZeroAddress(_owner)
    {
        _decimals = 18;
        maxTxAmount = _T_Total; // 600m
        _numTokensSellToAddToLiquidity = 5 * 10**5 * 10**18; // 500k
        swapFee._liquidityFee = 5;
        transferFee._liquidityFee = 2;
        swapAndLiquifyEnabled = true;
        _previousSwapFee._liquidityFee = swapFee._liquidityFee;
        _previousTransferFee._liquidityFee = transferFee._liquidityFee;
        _rTotal = (_MAX - (_MAX % _T_Total));
        _rOwned[_owner] = _rTotal;
        __ERC20_init("Arcane Token", "Arcane");
        __Ownable_init();
        IUniswapV2Router02 _uniswapV2Router = IUniswapV2Router02(_router);
        uniswapV2Pair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), _uniswapV2Router.WETH());
        uniswapV2Router = _uniswapV2Router;
        _isExcludedFromFee[_owner] = true;
        _isExcludedFromFee[address(this)] = true;
        _transferOwnership(_owner);
        emit Transfer(address(0), _owner, _T_Total);
    }

    /// @notice Determine the threshold for the accumulation
    /// @dev Set the threshold by owner
    /// @param threshold Value of threshold
    function setThreshold(uint256 threshold) external onlyOwner {
        _numTokensSellToAddToLiquidity = threshold;
        emit Threshold(_numTokensSellToAddToLiquidity);
    }

    /// @notice Include account in reward
    /// @dev Set address of account in reward and check exclude
    /// @param account Address for exclude and include in reward
    function includeInReward(address account) external onlyOwner {
        require(_isExcluded[account], "Account is already excluded");
        for (uint256 i = 0; i < _excluded.length; i++) {
            if (_excluded[i] == account) {
                _excluded[i] = _excluded[_excluded.length - 1];
                _tOwned[account] = 0;
                _isExcluded[account] = false;
                _excluded.pop();
                emit IncludeInReward(account, _tOwned[account]);
                break;
            }
        }
    }

    /// @notice Set swap liquidity and tax fee percent
    /// @param liquidityFee Value of fee
    /// @param taxFee Value of fee
    function setSwapFeePercent(uint256 liquidityFee, uint256 taxFee)
        external
        onlyOwner
    {
        require(
            liquidityFee <= 100 && taxFee <= 100,
            "Fees can't exceeds 100%"
        );
        swapFee._liquidityFee = liquidityFee;
        swapFee._taxFee = taxFee;
        emit SwapFeePercents(liquidityFee, taxFee);
    }

    /// @notice Set transfer liquidity and tax fee percent
    /// @param liquidityFee Value of fee
    /// @param taxFee Value of fee
    function setTransferFeePercent(uint256 liquidityFee, uint256 taxFee)
        external
        onlyOwner
    {
        require(
            liquidityFee <= 100 && taxFee <= 100,
            "Fees can't exceeds 100%"
        );
        transferFee._liquidityFee = liquidityFee;
        transferFee._taxFee = taxFee;
        emit TranferFeePercents(liquidityFee, taxFee);
    }

    /// @notice Set max tx percent
    /// @dev Set max tx percent with the previous calculation
    /// @param maxTxPercent Value for max tx percent
    function setMaxTxPercent(uint256 maxTxPercent) external onlyOwner {
        require(maxTxPercent <= 100, "maxTxPercent can't exceeds 100%");
        maxTxAmount = _T_Total.mul(maxTxPercent).div(10**2);
        emit MaxTxPercent(maxTxAmount);
    }

    /// @notice Set router
    /// @dev Set address of router with the previous check address
    /// @param _router Address of router
    function setRouter(address _router)
        external
        onlyOwner
        checkZeroAddress(_router)
    {
        uniswapV2Router = IUniswapV2Router02(_router);
        emit ChangeRouter(address(uniswapV2Router));
    }

    /// @notice Withdraw the balance of the contract
    /// @dev Withdraw amount of BNB that is as remainder in contract
    function withdrawLeftovers() external onlyOwner {
        uint256 leftovers = address(this).balance;
        payable(owner()).transfer(leftovers);
        emit WithdrawLeftovers(owner(), leftovers);
    }

    /// @notice Withdraw alien tokens from the balance of the contract
    /// @dev Withdraw alien tokens that may have been mistakenly sent to the contract.
    /// Or withdraw of ArcaneToken tokens in case if swapAndLiquifyEnabled is disable
    /// @param token Address of alien token
    /// @param recipient Address of account that get transfer's amount
    /// @param amount Amount for transfer
    function withdrawAlienToken(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        if (swapAndLiquifyEnabled) {
            require(token != address(this), "Token can not be ARC");
        }
        require(amount != 0, "Amount can not be zero");
        require(
            IERC20(token).balanceOf(address(this)) >= amount,
            "Insufficient tokens balance"
        );
        IERC20(token).transfer(recipient, amount);
        emit WithdrawAlienToken(token, recipient, amount);
    }

    /// @notice Set value of a few variables depending on tAmount
    /// @dev Set new value depending on tAmount and check account's exclude
    /// @param tAmount Value of amount for set new values for a few variables
    function deliver(uint256 tAmount) external {
        address sender = _msgSender();
        require(
            !_isExcluded[sender],
            "Excluded addresses cannot call this function"
        );
        (uint256 rAmount, , , , , ) = _getValues(tAmount, transferFee);
        _rOwned[sender] = _rOwned[sender].sub(rAmount);
        _rTotal = _rTotal.sub(rAmount);
        _tFeeTotal = _tFeeTotal.add(tAmount);
        emit Deliver(sender, _rOwned[sender], _rTotal, _tFeeTotal);
    }

    /// @notice Exclude account from reward
    /// @dev Change value of _isExcluded, _tOwned (if need) and push account
    /// @param account Address of account
    function excludeFromReward(address account) external onlyOwner {
        require(!_isExcluded[account], "Account is not excluded");
        if (_rOwned[account] > 0) {
            _tOwned[account] = tokenFromReflection(_rOwned[account]);
        }
        _isExcluded[account] = true;
        _excluded.push(account);
        emit ExcludeFromReward(account, _tOwned[account]);
    }

    /// @notice Exclude account from fee
    /// @dev Change value of _isExcludedFromFee for this account
    /// @param account Address of account
    function excludeFromFee(address account) external onlyOwner {
        _isExcludedFromFee[account] = true;
        emit ExcludeFromFee(account, _isExcludedFromFee[account]);
    }

    /// @notice Include account in fee
    /// @dev Change value of _isExcludedFromFee for this account
    /// @param account Address of account
    function includeInFee(address account) external onlyOwner {
        _isExcludedFromFee[account] = false;
        emit IncludeInFee(account, _isExcludedFromFee[account]);
    }

    /// @notice Set enable for swap and liquify
    /// @dev Set value of swapAndLiquifyEnabled
    /// @param _enabled Set whether _swapAndLiquify function is enables.
    /// True - if enable, false - if disable
    function setSwapAndLiquifyEnabled(bool _enabled) external onlyOwner {
        swapAndLiquifyEnabled = _enabled;
        emit SwapAndLiquifyEnabledUpdated(_enabled);
    }

    /// @notice Locks the contract for owner
    /// @dev Locks the contract for owner for the amount of time provided
    /// @param time Value for set time for lock
    function lock(uint256 time) external onlyOwner {
        _previousOwner = owner();
        _transferOwnership(address(0));
        _lockTime = block.timestamp + time;
    }

    /// @notice Unlock the contract for owner
    /// @dev Unlocks the contract for owner when _lockTime is exceeds
    function unlock() external {
        require(
            _previousOwner == _msgSender(),
            "You don't have permission to unlock"
        );
        require(block.timestamp > _lockTime, "Contract is locked");
        _transferOwnership(_previousOwner);
    }

    /// @notice Return info about exclude account from fee
    /// @param account Address of account
    /// @return Bool value of _isExcludedFromFee
    function isExcludedFromFee(address account) external view returns (bool) {
        return _isExcludedFromFee[account];
    }

    /// @notice Return setted lock time
    /// @return Value of variable _lockTime
    function getUnlockTime() external view returns (uint256) {
        return _lockTime;
    }

    /// @notice Return info about exclude account from reward
    /// @dev Return value of variable for save info about exclude account
    /// @param account Address of account
    /// @return Bool value about exclude account
    function isExcludedFromReward(address account)
        external
        view
        returns (bool)
    {
        return _isExcluded[account];
    }

    /// @notice Return value of total fees
    /// @return Value of variable _tFeeTotal
    function totalFees() external view returns (uint256) {
        return _tFeeTotal;
    }

    /// @notice Return reflection from token
    /// @dev Return reflection from token depending on value of deductTransferFee
    /// @param tAmount Value of amount for get values of a few variables
    /// @param deductTransferFee Bool value for get special result
    /// @return Value of rAmount or rTransferAmount depending on deductTransferFee
    function reflectionFromToken(uint256 tAmount, bool deductTransferFee)
        external
        view
        returns (uint256)
    {
        require(tAmount <= _T_Total, "Amount must be less than supply");
        if (!deductTransferFee) {
            (uint256 rAmount, , , , , ) = _getValues(tAmount, transferFee);
            return rAmount;
        } else {
            (, uint256 rTransferAmount, , , , ) = _getValues(
                tAmount,
                transferFee
            );
            return rTransferAmount;
        }
    }

    /// @notice Return balance of account
    /// @dev Return account's balance depending on account's exclude
    /// @param account Address of account
    /// @return Balance of account
    function balanceOf(address account) public view override returns (uint256) {
        if (_isExcluded[account]) return _tOwned[account];
        return tokenFromReflection(_rOwned[account]);
    }

    /// @notice Return value of decimals
    /// @return Value of variable _decimals
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Return token from reflection
    /// @dev Return token from reflection as result of calculation
    /// @param rAmount Value of amount for calculation
    /// @return Result of calculation
    function tokenFromReflection(uint256 rAmount)
        public
        view
        returns (uint256)
    {
        require(
            rAmount <= _rTotal,
            "Amount must be less than total reflections"
        );
        uint256 currentRate = _getRate();
        return rAmount.div(currentRate);
    }

    /// @notice Return value of total supply
    /// @return Value of variable _T_TOTAL
    function totalSupply() public pure override returns (uint256) {
        return _T_Total;
    }

    /// @notice Transfer amount, add liquidity
    /// @dev Check amount and accounts, transfer will take fee, add liquidity
    /// @param from Address of account that transfer amount
    /// @param to Address of account that get transfer's amount
    /// @param amount Value of amount for transfer
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(amount > 0, "Transfer amount must be greater than zero");
        if (from != owner() && to != owner())
            require(
                amount <= maxTxAmount,
                "Transfer amount exceeds the maxTxAmount."
            );

        uint256 contractTokenBalance = balanceOf(address(this));
        if (contractTokenBalance >= maxTxAmount) {
            contractTokenBalance = maxTxAmount;
        }
        bool overMinTokenBalance = contractTokenBalance >=
            _numTokensSellToAddToLiquidity;
        if (
            overMinTokenBalance &&
            !_inSwapAndLiquify &&
            from != uniswapV2Pair &&
            swapAndLiquifyEnabled
        ) {
            contractTokenBalance = _numTokensSellToAddToLiquidity;
            _swapAndLiquify(contractTokenBalance);
        }
        bool takeFee = true;
        if (_isExcludedFromFee[from] || _isExcludedFromFee[to]) {
            takeFee = false;
        }
        _tokenTransfer(from, to, amount, takeFee);
    }

    /// @notice Reflect fee
    /// @dev Change values of _rTotal and _tFeeTotal
    /// @param rFee Value for subtract from _rTotal
    /// @param tFee Value for add to _tFeeTotal
    function _reflectFee(uint256 rFee, uint256 tFee) private {
        _rTotal = _rTotal.sub(rFee);
        _tFeeTotal = _tFeeTotal.add(tFee);
        emit ReflectFee(_rTotal, _tFeeTotal);
    }

    /// @notice Should take liquidity
    /// @dev Change values of _rOwned and _tOwned depending on tLiquidity
    /// @param tLiquidity Value for correct change values of variables
    function _takeLiquidity(uint256 tLiquidity) private {
        uint256 currentRate = _getRate();
        uint256 rLiquidity = tLiquidity.mul(currentRate);
        _rOwned[address(this)] = _rOwned[address(this)].add(rLiquidity);
        if (_isExcluded[address(this)])
            _tOwned[address(this)] = _tOwned[address(this)].add(tLiquidity);
        emit TakeLiquidity(_rOwned[address(this)], _tOwned[address(this)]);
    }

    /// @notice Remove all fee
    /// @dev Change values of variables relationed swap and transfer fee
    function _removeAllFee() private {
        FeeValues memory empty = FeeValues(0, 0);

        _previousSwapFee = swapFee;
        _previousTransferFee = transferFee;

        swapFee = empty;
        transferFee = empty;

        emit RemoveAllFee(
            _previousSwapFee,
            _previousTransferFee,
            swapFee,
            transferFee
        );
    }

    /// @notice Restore all fee
    /// @dev Change values of variables relationed swap and transfer fee
    function _restoreAllFee() private {
        swapFee = _previousSwapFee;
        transferFee = _previousTransferFee;
        emit RestoreAllFee(swapFee, transferFee);
    }

    /// @notice Should swap tokens and liquify
    /// @dev Split the balance, exchange tokens for BNB and add liquidity
    /// @param contractTokenBalance Contract's balance
    function _swapAndLiquify(uint256 contractTokenBalance) private lockTheSwap {
        uint256 half = contractTokenBalance.div(2);
        uint256 otherHalf = contractTokenBalance.sub(half);
        uint256 initialBalance = address(this).balance;
        _swapTokensForMATIC(half);
        uint256 newBalance = address(this).balance.sub(initialBalance);
        _addLiquidity(otherHalf, newBalance);
        emit SwapAndLiquify(half, newBalance, otherHalf);
    }

    /// @notice Should swap tokens for chain's native token
    /// @dev Add approve, generate uniswap pair and swap
    /// @param tokenAmount Amount of tokens for swap
    function _swapTokensForMATIC(uint256 tokenAmount) private {
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = uniswapV2Router.WETH();
        _approve(address(this), address(uniswapV2Router), tokenAmount);
        uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
    }

    /// @notice Should add liquidity
    /// @dev Add approve and liquidity in BNB tokens
    /// @param tokenAmount Amount of tokens for approve and liquidity
    /// @param maticAmount Amount of BNB for call functions for add liquidity
    function _addLiquidity(uint256 tokenAmount, uint256 maticAmount) private {
        _approve(address(this), address(uniswapV2Router), tokenAmount);
        (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        ) = uniswapV2Router.addLiquidityETH{value: maticAmount}(
                address(this),
                tokenAmount,
                0,
                0,
                owner(),
                block.timestamp
            );
        emit AddLiquidity(amountToken, amountETH, liquidity);
    }

    /// @notice Should transfer tokens
    /// @dev This method is responsible for taking all fee, if takeFee is true
    /// @param sender Address of account that transfer amount
    /// @param recipient Address of account that get transfer's amount
    /// @param amount Value of amount for transfer
    /// @param takeFee Value that indicates the possibility of deducting fee
    function _tokenTransfer(
        address sender,
        address recipient,
        uint256 amount,
        bool takeFee
    ) private {
        if (!takeFee) _removeAllFee();
        if (_isExcluded[sender] && !_isExcluded[recipient]) {
            _transferFromExcluded(sender, recipient, amount);
        } else if (!_isExcluded[sender] && _isExcluded[recipient]) {
            _transferToExcluded(sender, recipient, amount);
        } else if (_isExcluded[sender] && _isExcluded[recipient]) {
            _transferBothExcluded(sender, recipient, amount);
        } else {
            _transferStandard(sender, recipient, amount);
        }
        if (!takeFee) _restoreAllFee();
    }

    /// @notice Standard transfer amount
    /// @dev Change values of a few variables, reflect fee and take liquidity
    /// @param sender Address of account that transfer amount
    /// @param recipient Address of account that get transfer's amount
    /// @param tAmount Value of amount for transfer
    function _transferStandard(
        address sender,
        address recipient,
        uint256 tAmount
    ) private {
        FeeValues memory fees = _getFeeAmountBasedOnTransferType(
            sender,
            recipient
        );
        (
            uint256 rAmount,
            uint256 rTransferAmount,
            uint256 rFee,
            uint256 tTransferAmount,
            uint256 tFee,
            uint256 tLiquidity
        ) = _getValues(tAmount, fees);
        _rOwned[sender] = _rOwned[sender].sub(rAmount);
        _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
        _takeLiquidity(tLiquidity);
        _reflectFee(rFee, tFee);
        emit Transfer(sender, recipient, tTransferAmount);
        emit TransferStandard(
            sender,
            recipient,
            _rOwned[sender],
            _rOwned[recipient]
        );
    }

    /// @notice Transfer amount if recipient include in reward
    /// @dev Change values of a few variables, reflect fee and take liquidity
    /// @param sender Address of account that transfer amount
    /// @param recipient Address of account that get transfer's amount
    /// @param tAmount Value of amount for transfer
    function _transferToExcluded(
        address sender,
        address recipient,
        uint256 tAmount
    ) private {
        FeeValues memory fees = _getFeeAmountBasedOnTransferType(
            sender,
            recipient
        );
        (
            uint256 rAmount,
            uint256 rTransferAmount,
            uint256 rFee,
            uint256 tTransferAmount,
            uint256 tFee,
            uint256 tLiquidity
        ) = _getValues(tAmount, fees);
        _rOwned[sender] = _rOwned[sender].sub(rAmount);
        _tOwned[recipient] = _tOwned[recipient].add(tTransferAmount);
        _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
        _takeLiquidity(tLiquidity);
        _reflectFee(rFee, tFee);
        emit Transfer(sender, recipient, tTransferAmount);
        emit TransferToExcluded(
            sender,
            recipient,
            _rOwned[sender],
            _tOwned[recipient],
            _rOwned[recipient]
        );
    }

    /// @notice Transfer amount if sender include in reward
    /// @dev Change values of a few variables, reflect fee and take liquidity
    /// @param sender Address of account that transfer amount
    /// @param recipient Address of account that get transfer's amount
    /// @param tAmount Value of amount for transfer
    function _transferFromExcluded(
        address sender,
        address recipient,
        uint256 tAmount
    ) private {
        FeeValues memory fees = _getFeeAmountBasedOnTransferType(
            sender,
            recipient
        );
        (
            uint256 rAmount,
            uint256 rTransferAmount,
            uint256 rFee,
            uint256 tTransferAmount,
            uint256 tFee,
            uint256 tLiquidity
        ) = _getValues(tAmount, fees);
        _tOwned[sender] = _tOwned[sender].sub(tAmount);
        _rOwned[sender] = _rOwned[sender].sub(rAmount);
        _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
        _takeLiquidity(tLiquidity);
        _reflectFee(rFee, tFee);
        emit Transfer(sender, recipient, tTransferAmount);
        emit TransferFromExcluded(
            sender,
            recipient,
            _tOwned[sender],
            _rOwned[sender],
            _rOwned[recipient]
        );
    }

    /// @notice Transfer amount if both accounts excluded from reward
    /// @dev Change values of a few variables, reflect fee and take liquidity
    /// @param sender Address of account that transfer amount
    /// @param recipient Address of account that get transfer's amount
    /// @param tAmount Value of amount for transfer
    function _transferBothExcluded(
        address sender,
        address recipient,
        uint256 tAmount
    ) private {
        FeeValues memory fees = _getFeeAmountBasedOnTransferType(
            sender,
            recipient
        );
        (
            uint256 rAmount,
            uint256 rTransferAmount,
            uint256 rFee,
            uint256 tTransferAmount,
            uint256 tFee,
            uint256 tLiquidity
        ) = _getValues(tAmount, fees);
        _tOwned[sender] = _tOwned[sender].sub(tAmount);
        _rOwned[sender] = _rOwned[sender].sub(rAmount);
        _tOwned[recipient] = _tOwned[recipient].add(tTransferAmount);
        _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);_swapAndLiquify
        _takeLiquidity(tLiquidity);
        _reflectFee(rFee, tFee);
        emit Transfer(sender, recipient, tTransferAmount);
        emit TransferFromSender(sender, _tOwned[sender], _rOwned[sender]);
        emit TransferToRecipient(
            recipient,
            _tOwned[recipient],
            _rOwned[recipient]
        );
    }
  
    /// @notice Return tValues and rValues
    /// @dev Return values depending on tAmount
    /// @param tAmount Value for calculate return values
    /// @return rAmount Value as result of calculating tAmount and rate
    /// @return rTransferAmount Value as result of calculating rAmount, rFee and rLiquidity
    /// @return rFee Value as result of calculating tFee and rate
    /// @return tTransferAmount Value as result of calculating tAmount, tFee and tLiquidity
    /// @return tFee Value as result of calculating _taxFee and tAmount
    /// @return tLiquidity Value as result of calculating _liquidityFee and tAmount
    function _getValues(uint256 tAmount, FeeValues memory fees)
        private
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        (
            uint256 tTransferAmount,
            uint256 tFee,
            uint256 tLiquidity
        ) = _getTValues(tAmount, fees);
        (uint256 rAmount, uint256 rTransferAmount, uint256 rFee) = _getRValues(
            tAmount,
            tFee,
            tLiquidity,
            _getRate()
        );
        return (
            rAmount,
            rTransferAmount,
            rFee,
            tTransferAmount,
            tFee,
            tLiquidity
        );
    }

    /// @notice Return rate
    /// @dev Return values depending on r and t values
    /// @return Value as result of calculating rSupply and tSupply
    function _getRate() private view returns (uint256) {
        (uint256 rSupply, uint256 tSupply) = _getCurrentSupply();
        return rSupply.div(tSupply);
    }

    /// @notice Return current supply
    /// @dev Return values depending on r and t values
    /// @return r and t values depending on condition
    function _getCurrentSupply() private view returns (uint256, uint256) {
        uint256 rSupply = _rTotal;
        uint256 tSupply = _T_Total;
        for (uint256 i = 0; i < _excluded.length; i++) {
            if (
                _rOwned[_excluded[i]] > rSupply ||
                _tOwned[_excluded[i]] > tSupply
            ) return (_rTotal, _T_Total);
            rSupply = rSupply.sub(_rOwned[_excluded[i]]);
            tSupply = tSupply.sub(_tOwned[_excluded[i]]);
        }
        if (rSupply < _rTotal.div(_T_Total)) return (_rTotal, _T_Total);
        return (rSupply, tSupply);
    }

    /// @notice Return fee based on the transfer type
    /// @dev Return value depending on transfer type
    /// @param sender Address of the sender account
    /// @param recipient Address of the recipient account
    /// @return fee value
    function _getFeeAmountBasedOnTransferType(address sender, address recipient)
        private
        view
        returns (FeeValues memory)
    {
        if (
            sender == address(uniswapV2Pair) ||
            recipient == address(uniswapV2Pair)
        ) {
            // buy/sell add/remove liquidity action
            return swapFee;
        } else {
            // simple transfer action
            return transferFee;
        }
    }

    /// @notice Calculate amount of fee
    /// @param _amount Amount to take fee from
    /// @param _fee Percents of fee
    /// @return Value of fee
    function _calculateFee(uint256 _amount, uint256 _fee)
        private
        pure
        returns (uint256)
    {
        return _amount.mul(_fee).div(10**2);
    }

    /// @notice Return tValues
    /// @dev Return values depending on tAmount
    /// @param tAmount Value for calculate return values
    /// @return tTransferAmount Value as result of calculating tAmount, tFee and tLiquidity
    /// @return tFee Value as result of calculating _taxFee and tAmount
    /// @return tLiquidity Value as result of calculating _liquidityFee and tAmount
    function _getTValues(uint256 tAmount, FeeValues memory fees)
        private
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 tFee = _calculateFee(tAmount, fees._taxFee);
        uint256 tLiquidity = _calculateFee(tAmount, fees._liquidityFee);
        uint256 tTransferAmount = tAmount.sub(tFee).sub(tLiquidity);
        return (tTransferAmount, tFee, tLiquidity);
    }

    /// @notice Return rValues
    /// @dev Return values depending on values of parameters
    /// @param tAmount Value of transfer amount to calculate rAmount
    /// @param tFee Value of taxFee to calculate rFee
    /// @param tLiquidity Value liquidityFee to calculate rLiquidity
    /// @param currentRate Value of currentRate to calculate return's values
    /// @return rAmount Value as result of calculating tAmount and currentRate
    /// @return rTransferAmount Value as result of calculating rAmount, rFee and rLiquidity
    /// @return rFee Value as result of calculating tFee and currentRate
    function _getRValues(
        uint256 tAmount,
        uint256 tFee,
        uint256 tLiquidity,
        uint256 currentRate
    )
        private
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 rAmount = tAmount.mul(currentRate);
        uint256 rFee = tFee.mul(currentRate);
        uint256 rLiquidity = tLiquidity.mul(currentRate);
        uint256 rTransferAmount = rAmount.sub(rFee).sub(rLiquidity);
        return (rAmount, rTransferAmount, rFee);
    }

}
