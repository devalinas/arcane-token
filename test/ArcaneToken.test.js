const { deployProxy } = require('@openzeppelin/truffle-upgrades');
const {
    expectEvent,
    constants,
    expectRevert,
    time,
    balance,
    snapshot,
    ether
} = require("@openzeppelin/test-helpers");

const BN = require("bn.js");

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn")(BN))
    .should();

const ArcaneToken = artifacts.require("ArcaneToken");
const IUniswapV2Router02 = artifacts.require("IUniswapV2Router02");
const IWETH = artifacts.require("IWETH");
const MockERC20 = artifacts.require("MockERC20");

contract("ArcaneToken", function (accounts) {
    [owner, user1, user2] = accounts;

    const router = "0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F";
    const ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    const DAY = 86400;
    const _tTotal = new BN("600").mul(new BN("10").pow(new BN("6"))).mul(new BN("10").pow(new BN("18")));
    const maxUINT256 = new BN("2").pow(new BN("256")).sub(new BN("1"));
    _rTotal = maxUINT256.sub(maxUINT256.mod(_tTotal));

    before(async function () {
        arcane = await deployProxy(ArcaneToken, [ROUTER_ADDRESS, owner], { initializer: 'initialize' });
        snapshotA = await snapshot();
    });

    afterEach(async function () {
        await snapshotA.restore();
    });

    describe("ArcaneToken Initializing Phase Test Cases", function () {
        it("should set router correctly", async () => {
            (await arcane.uniswapV2Router()).should.be.equal(ROUTER_ADDRESS);
        });

        it("should get balance of owner correctly", async () => {
            let currentRate = _rTotal.div(_tTotal);
            let balanceOwner = _rTotal.div(currentRate);
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceOwner);
        });

        it("should exclude from fee correctly", async () => {
            (await arcane.isExcludedFromFee(owner)).should.be.equal(true);
            (await arcane.isExcludedFromFee(arcane.address)).should.be.equal(true);
        });

        it("should set _maxTxAmount correctly", async () => {
            (await arcane.maxTxAmount()).should.be.bignumber.equal(_tTotal);
        });

        it("should set swap fee correctly", async () => {
            ((await arcane.swapFee())._liquidityFee).should.be.bignumber.equal(new BN("5"));
            ((await arcane.swapFee())._taxFee).should.be.bignumber.equal(new BN("0"));
        });

        it("should set transfer fee correctly", async () => {
            ((await arcane.transferFee())._liquidityFee).should.be.bignumber.equal(new BN("2"));
            ((await arcane.transferFee())._taxFee).should.be.bignumber.equal(new BN("0"));
        });

        it("should set swapAndLiquifyEnabled correctly", async () => {
            (await arcane.swapAndLiquifyEnabled()).should.be.equal(true);
        });

        it("should set token's name correctly", async () => {
            (await arcane.name()).should.be.equal("Arcane Token");
        });

        it("should set token's symbol correctly", async () => {
            (await arcane.symbol()).should.be.equal("Arcane");
        });

        it("should set total supply correctly", async () => {
            (await arcane.totalSupply()).should.be.bignumber.equal(_tTotal);
        });

        it("should set decimals correctly", async () => {
            (await arcane.decimals()).should.be.bignumber.equal(new BN("18"));
        });
    });

    describe("ArcaneToken Get/Set Functions Phase Test Cases", function () {
        it("should set threshold correctly", async () => {
            let result = await arcane.setThreshold(5000);
            expectEvent(
                result,
                "Threshold",
                { threshold: new BN("5000") }
            );
        });

        it("should deliver correctly", async () => {
            let tAmount = ether("4");
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = tAmount.mul(currentRate);
            let _rOwned = _rTotal.sub(rAmount);
            currentRate = _rOwned.div(_tTotal);
            let balanceOwner = _rOwned.div(currentRate);
            let result = await arcane.deliver(tAmount);
            expectEvent(
                result,
                "Deliver",
                {
                    sender: owner,
                    rAmount: _rOwned,
                    rTotal: _rOwned,
                    tFeeTotal: tAmount
                }
            );
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceOwner);
            (await arcane.totalFees()).should.be.bignumber.equal(tAmount);
        });

        it("shouldn't deliver if account isn't excluded", async () => {
            await arcane.excludeFromReward(owner);
            await expectRevert(
                arcane.deliver(ether("4")),
                "Excluded addresses cannot call this function"
            );
        });

        it("should exclude account from reward without _rOwned correctly", async () => {
            let result = await arcane.excludeFromReward(user1);
            expectEvent(
                result,
                "ExcludeFromReward",
                { account: user1, tOwned: new BN("0") }
            );
            (await arcane.isExcludedFromReward(user1)).should.be.equal(true);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(new BN("0"));
        });

        it("should exclude account from reward with _rOwned correctly", async () => {
            let tAmount = ether("10");
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = tAmount.mul(currentRate);
            let _rOwned = _rTotal.sub(rAmount);
            currentRate = _rOwned.div(_tTotal);
            let balanceOwner = _rOwned.div(currentRate);
            await arcane.deliver(tAmount);
            let result = await arcane.excludeFromReward(owner);
            expectEvent(
                result,
                "ExcludeFromReward",
                { account: owner, tOwned: balanceOwner }
            );
            (await arcane.isExcludedFromReward(owner)).should.be.equal(true);
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceOwner);
        });

        it("shouldn't exclude account from reward if account isn't excluded", async () => {
            await arcane.excludeFromReward(user1);
            await expectRevert(
                arcane.excludeFromReward(user1),
                "Account is not excluded"
            );
        });

        it("should include account in reward correctly", async () => {
            await arcane.excludeFromReward(user1);
            await arcane.excludeFromReward(owner);
            let result = await arcane.includeInReward(owner);
            expectEvent(
                result,
                "IncludeInReward",
                { account: owner, tOwned: new BN("0") }
            );
            (await arcane.isExcludedFromReward(owner)).should.be.equal(false);
        });

        it("shouldn't include account in reward if account is already excluded", async () => {
            await expectRevert(
                arcane.includeInReward(owner),
                "Account is already excluded"
            );
        });

        it("should set transfer fee percent correctly", async () => {
            let result = await arcane.setTransferFeePercent(5, 10);
            expectEvent(
                result,
                "TranferFeePercents",
                {
                    liquidityFee: new BN("5"),
                    taxFee: new BN("10")
                }
            );
            ((await arcane.transferFee())._liquidityFee).should.be.bignumber.equal(new BN("5"));
            ((await arcane.transferFee())._taxFee).should.be.bignumber.equal(new BN("10"));
        });

        it("shouldn't set tax fee percent if value more than 100", async () => {
            await expectRevert(
                arcane.setTransferFeePercent(101, 1),
                "Fees can't exceeds 100%"
            );

            await expectRevert(
                arcane.setTransferFeePercent(1, 1111),
                "Fees can't exceeds 100%"
            );
        });

        it("shouldn't set tax fee percent if caller isn't owner", async () => {
            await expectRevert(
                arcane.setTransferFeePercent(10, 0, { from: user1 }),
                "Ownable: caller is not the owner"
            );
        });

        it("should set swap fee percent correctly", async () => {
            let result = await arcane.setSwapFeePercent(10, 9);
            expectEvent(
                result,
                "SwapFeePercents",
                {
                    liquidityFee: new BN("10"),
                    taxFee: new BN("9")
                }
            );
            ((await arcane.swapFee())._liquidityFee).should.be.bignumber.equal(new BN("10"));
            ((await arcane.swapFee())._taxFee).should.be.bignumber.equal(new BN("9"));
        });

        it("shouldn't set liquidity fee percent if value more than 100", async () => {
            await expectRevert(
                arcane.setSwapFeePercent(101, 1),
                "Fees can't exceeds 100%"
            );

            await expectRevert(
                arcane.setSwapFeePercent(11, 991),
                "Fees can't exceeds 100%"
            );
        });

        it("should set max tx percent correctly", async () => {
            let maxTx = new BN("10");
            let maxTxAmount = _tTotal.mul(maxTx).div(new BN("100"));
            let result = await arcane.setMaxTxPercent(maxTx);
            expectEvent(
                result,
                "MaxTxPercent",
                { maxTxAmount }
            );
            (await arcane.maxTxAmount()).should.be.bignumber.equal(maxTxAmount);
        });

        it("shouldn't set max tx percent if value more than 100", async () => {
            await expectRevert(
                arcane.setMaxTxPercent(101),
                "maxTxPercent can't exceeds 100%"
            );
        });

        it("should update router correctly", async () => {
            let result = await arcane.setRouter(router);
            expectEvent(
                result,
                "ChangeRouter",
                { router: router }
            );
            (await arcane.uniswapV2Router()).should.be.equal(router);
        });

        it("shouldn't update router if zero's address", async () => {
            await expectRevert(
                arcane.setRouter(constants.ZERO_ADDRESS),
                "Address can not be zero's"
            );
        });

        it("should exclude account from fee correctly", async () => {
            let result = await arcane.excludeFromFee(user1);
            expectEvent(
                result,
                "ExcludeFromFee",
                { account: user1, isExcludedFromFee: true }
            );
            (await arcane.isExcludedFromFee(user1)).should.be.equal(true);
        });

        it("should include account in fee correctly", async () => {
            let result = await arcane.includeInFee(user1);
            expectEvent(
                result,
                "IncludeInFee",
                { account: user1, isExcludedFromFee: false }
            );
            (await arcane.isExcludedFromFee(user1)).should.be.equal(false);
        });

        it("should set enable for swap and liquify correctly", async () => {
            let result = await arcane.setSwapAndLiquifyEnabled(true);
            expectEvent(
                result,
                "SwapAndLiquifyEnabledUpdated",
                { enabled: true }
            );
            (await arcane.swapAndLiquifyEnabled()).should.be.equal(true);
        });

        it("should lock correctly", async () => {
            await arcane.lock(DAY);
            let period = (await time.latest()).add(new BN(DAY));
            (await arcane.owner()).should.be.equal(constants.ZERO_ADDRESS);
            (await arcane.getUnlockTime()).should.be.bignumber.equal(period);
        });

        it("should unlock correctly", async () => {
            await arcane.lock(1);
            await time.increase(DAY);
            await arcane.unlock();
            (await arcane.owner()).should.be.equal(owner);
        });

        it("shouldn't unlock if caller haven't permission", async () => {
            await expectRevert(
                arcane.unlock(),
                "You don't have permission to unlock"
            );
        });

        it("shouldn't unlock if _lockTime isn't exceeds", async () => {
            await arcane.lock(DAY);
            await expectRevert(
                arcane.unlock(),
                "Contract is locked"
            );
        });

        it("should return reflection from token correctly", async () => {
            const taxFee = new BN("0");
            const liquidityFee = new BN("2");
            const tAmount = ether("5");

            let tFee = tAmount.mul(taxFee).div(new BN("100"));
            let tLiquidity = tAmount.mul(liquidityFee).div(new BN("100"));
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = tAmount.mul(currentRate);
            let rFee = tFee.mul(currentRate);
            let rLiquidity = tLiquidity.mul(currentRate);
            let rTransferAmount = rAmount.sub(rFee).sub(rLiquidity);
            (await arcane.reflectionFromToken(tAmount, true)).should.be.bignumber.equal(rTransferAmount);
            (await arcane.reflectionFromToken(tAmount, false)).should.be.bignumber.equal(rAmount);
        });

        it("shouldn't return reflection from token if amount more than supply", async () => {
            const tAmount = _tTotal.add(new BN("10"));
            await expectRevert(
                arcane.reflectionFromToken(tAmount, true),
                "Amount must be less than supply"
            );
        });

    });

    describe("ArcaneToken Transfer Functions Phase Test Cases", function () {

        it("shouldn't transfer amount of tokens if insufficient allowance", async () => {
            await expectRevert(
                arcane.transferFrom(constants.ZERO_ADDRESS, user1, ether("1")),
                "ERC20: insufficient allowance"
            );
        });

        it("shouldn't transfer amount of tokens if zero's 'to' address", async () => {
            await expectRevert(
                arcane.transfer(constants.ZERO_ADDRESS, ether("1")),
                "ERC20: transfer to the zero address"
            );
        });

        it("shouldn't transfer amount of tokens if amount is zero", async () => {
            await expectRevert(
                arcane.transfer(user1, 0),
                "Transfer amount must be greater than zero"
            );
        });

        it("shouldn't transfer amount of tokens if amount exceeds the maxTxAmount", async () => {
            await arcane.setMaxTxPercent(0);
            await expectRevert(
                arcane.transfer(user1, ether("1"), { from: user2 }),
                "Transfer amount exceeds the maxTxAmount."
            );
        });

        it("should transfer amount of tokens from excluded account correctly", async () => {
            const fee = new BN("0");
            const amount = ether("10");
            let tFee = amount.mul(fee).div(new BN("100"));
            let tLiquidity = amount.mul(fee).div(new BN("100"));
            let tTransferAmount = amount.sub(tFee).sub(tLiquidity);
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = amount.mul(currentRate);
            let rFee = tFee.mul(currentRate);
            let rLiquidity = tLiquidity.mul(currentRate);
            let rTransferAmount = rAmount.sub(rFee).sub(rLiquidity);
            let tOwnedS = _rTotal.div(currentRate);
            let tOwnedSNew = tOwnedS.sub(amount);
            let rOwnedS = _rTotal.sub(rAmount);
            let rOwnedR = rTransferAmount;
            let balanceSender = rOwnedS.div(currentRate);
            let balanceRecipient = rOwnedR.div(currentRate);
            await arcane.setMaxTxPercent(0);
            await arcane.excludeFromReward(owner);
            let result = await arcane.transfer(user1, amount);
            expectEvent(result, "Transfer", { from: owner, to: user1, value: tTransferAmount });
            expectEvent(
                result,
                "TransferFromExcluded",
                {
                    sender: owner,
                    recipient: user1,
                    tOwnedSender: tOwnedSNew,
                    rOwnedSender: rOwnedS,
                    rOwnedRecipient: rOwnedR
                }
            );
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceSender);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceRecipient);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(new BN("0"));
        });

        it("should transfer amount of tokens from excluded account correctly if contract's address is excluded", async () => {
            const fee = new BN("0");
            const amount = ether("10");
            let tFee = amount.mul(fee).div(new BN("100"));
            let tLiquidity = amount.mul(fee).div(new BN("100"));
            let tTransferAmount = amount.sub(tFee).sub(tLiquidity);
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = amount.mul(currentRate);
            let rFee = tFee.mul(currentRate);
            let rLiquidity = tLiquidity.mul(currentRate);
            let rTransferAmount = rAmount.sub(rFee).sub(rLiquidity);
            let rOwnedS = _rTotal.sub(rAmount);
            let rOwnedR = rTransferAmount;
            let rOwnedC = tLiquidity.mul(currentRate);
            _rTotal = _rTotal.sub(rFee);
            currentRate = _rTotal.div(_tTotal);
            let balanceSender = rOwnedS.div(currentRate);
            let balanceRecipient = rOwnedR.div(currentRate);
            let balanceContract = rOwnedC.div(currentRate);
            await arcane.excludeFromReward(owner);
            await arcane.excludeFromReward(arcane.address);
            await arcane.transfer(user1, amount);
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceSender);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceRecipient);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContract);
        });

        it("should transfer amount of tokens to excluded account correctly", async () => {
            const fee = new BN("0");
            const amount = ether("10");
            let tFee = amount.mul(fee).div(new BN("100"));
            let tLiquidity = amount.mul(fee).div(new BN("100"));
            let tTransferAmount = amount.sub(tFee).sub(tLiquidity);
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = amount.mul(currentRate);
            let rFee = tFee.mul(currentRate);
            let rLiquidity = tLiquidity.mul(currentRate);
            let rTransferAmount = rAmount.sub(rFee).sub(rLiquidity);
            let rOwnedS = _rTotal.sub(rAmount);
            let tOwnedRNew = tTransferAmount;
            let rOwnedR = rTransferAmount;
            let balanceSender = rOwnedS.div(currentRate);
            let balanceRecipient = rOwnedR.div(currentRate);
            await arcane.excludeFromReward(user1);
            let result = await arcane.transfer(user1, amount);
            expectEvent(result, "Transfer", { from: owner, to: user1, value: tTransferAmount });
            expectEvent(
                result,
                "TransferToExcluded",
                {
                    sender: owner,
                    recipient: user1,
                    rOwnedSender: rOwnedS,
                    tOwnedRecipient: tOwnedRNew,
                    rOwnedRecipient: rOwnedR
                }
            );
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceSender);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceRecipient);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(new BN("0"));
        });

        it("should transfer amount of tokens correctly if both accounts is excluded", async () => {
            const fee = new BN("0");
            const amount = ether("10");
            let tFee = amount.mul(fee).div(new BN("100"));
            let tLiquidity = amount.mul(fee).div(new BN("100"));
            let tTransferAmount = amount.sub(tFee).sub(tLiquidity);
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = amount.mul(currentRate);
            let rFee = tFee.mul(currentRate);
            let rLiquidity = tLiquidity.mul(currentRate);
            let rTransferAmount = rAmount.sub(rFee).sub(rLiquidity);
            let tOwnedS = _rTotal.div(currentRate);
            let tOwnedSNew = tOwnedS.sub(amount);
            let rOwnedS = _rTotal.sub(rAmount);
            let tOwnedRNew = tTransferAmount;
            let rOwnedR = rTransferAmount;
            let balanceSender = rOwnedS.div(currentRate);
            let balanceRecipient = rOwnedR.div(currentRate);
            await arcane.excludeFromReward(owner);
            await arcane.excludeFromReward(user1);
            let result = await arcane.transfer(user1, amount);
            expectEvent(result, "Transfer", { from: owner, to: user1, value: tTransferAmount });
            expectEvent(result, "TransferFromSender", { sender: owner, tOwned: tOwnedSNew, rOwned: rOwnedS });
            expectEvent(result, "TransferToRecipient", { recipient: user1, tOwned: tOwnedRNew, rOwned: rOwnedR });
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceSender);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceRecipient);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(new BN("0"));
        });

        it("should standard transfer amount of tokens correctly if not satisfying the threshold", async () => {
            const taxFee = new BN("0");
            const liquidityFee = new BN("0");
            const amount = ether("10");
            let tFee = amount.mul(taxFee).div(new BN("100"));
            let tLiquidity = amount.mul(liquidityFee).div(new BN("100"));
            let tTransferAmount = amount.sub(tFee).sub(tLiquidity);
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = amount.mul(currentRate);
            let rFee = tFee.mul(currentRate);
            let rLiquidity = tLiquidity.mul(currentRate);
            let rTransferAmount = rAmount.sub(rFee).sub(rLiquidity);
            let rOwnedS = _rTotal.sub(rAmount);
            let rOwnedR = rTransferAmount;
            let balanceSender = rOwnedS.div(currentRate);
            let balanceRecipient = rOwnedR.div(currentRate);
            let rTotal = _rTotal.sub(rFee);
            let result = await arcane.transfer(user1, amount);
            expectEvent(result, "Transfer", { from: owner, to: user1, value: tTransferAmount });
            expectEvent(result, "ReflectFee", { rTotal, tFeeTotal: tFee });
            expectEvent(result, "TakeLiquidity", { rOwned: new BN("0"), tOwned: new BN("0") });
            // expectEvent(result, "RemoveAllFee", {previousTaxFee: new BN("0"), previousLiquidityFee: new BN("5"), taxFee, liquidityFee});
            // expectEvent(result, "RestoreAllFee", {taxFee: new BN("0"), liquidityFee: new BN("5")});
            expectEvent(
                result,
                "TransferStandard",
                {
                    sender: owner,
                    recipient: user1,
                    rOwnedSender: rOwnedS,
                    rOwnedRecipient: rOwnedR
                }
            );
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceSender);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceRecipient);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(new BN("0"));
        });

        it("should standard transfer amount of tokens correctly without fee", async () => {
            const fee = new BN("0");
            const amount = ether("10");
            let currentRate = _rTotal.div(_tTotal);
            let tFeeT1 = amount.mul(fee).div(new BN("100"));
            let tLiquidityT1 = amount.mul(fee).div(new BN("100"));
            let rAmountT1 = amount.mul(currentRate);
            let rFeeT1 = tFeeT1.mul(currentRate);
            let rLiquidityT1 = tLiquidityT1.mul(currentRate);
            let rTransferAmountT1 = rAmountT1.sub(rFeeT1).sub(rLiquidityT1);
            let rOwnedRT1 = rTransferAmountT1;
            let rOwnedCT1 = tLiquidityT1.mul(currentRate);
            _rTotal = _rTotal.sub(rFeeT1);
            currentRate = _rTotal.div(_tTotal);
            let tFeeT2 = amount.mul(fee).div(new BN("100")); // 5
            let tLiquidityT2 = amount.mul(fee).div(new BN("100"));
            let rAmountT2 = amount.mul(currentRate);
            let rFeeT2 = tFeeT2.mul(currentRate);
            let rLiquidityT2 = tLiquidityT2.mul(currentRate);
            let rTransferAmountT2 = rAmountT2.sub(rFeeT2).sub(rLiquidityT2);
            let rOwnedST2 = rOwnedRT1.sub(rAmountT2);
            let rOwnedRT2 = rTransferAmountT2;
            let rOwnedCT2 = rOwnedCT1.add(tLiquidityT2.mul(currentRate));
            _rTotal = _rTotal.sub(rFeeT2);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser1T2 = rOwnedST2.div(currentRate);
            let balanceUser2T2 = rOwnedRT2.div(currentRate);
            let balanceContractT2 = rOwnedCT2.div(currentRate);
            await arcane.setTransferFeePercent(fee, fee);
            await arcane.transfer(user1, amount);
            await arcane.transfer(user2, amount, { from: user1 });
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T2);
            (await arcane.balanceOf(user2)).should.be.bignumber.equal(balanceUser2T2);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContractT2);
        });

        it("should standard transfer amount of tokens correctly if not satisfying the threshold and with fee", async () => {
            const fee = new BN("50");
            const amount = ether("10");
            let tFee = amount.mul(fee).div(new BN("100"));
            let tLiquidity = amount.mul(fee).div(new BN("100"));
            let currentRate = _rTotal.div(_tTotal);
            let rAmount = amount.mul(currentRate);
            let rFee = tFee.mul(currentRate);
            let rLiquidity = tLiquidity.mul(currentRate);
            let rTransferAmount = rAmount.sub(rFee).sub(rLiquidity);
            let rOwnedS = _rTotal.sub(rAmount);
            let rOwnedR = rTransferAmount;
            let rOwnedC = tLiquidity.mul(currentRate);
            _rTotal = _rTotal.sub(rFee);
            let newCurrRate = _rTotal.div(_tTotal);
            let balanceSender = rOwnedS.div(newCurrRate);
            let balanceRecipient = rOwnedR.div(newCurrRate);
            let balanceContract = rOwnedC.div(newCurrRate);
            await arcane.includeInFee(owner);
            await arcane.setTransferFeePercent(fee, fee);
            await arcane.transfer(user1, amount);
            (await arcane.totalFees()).should.be.bignumber.equal(tFee);
            (await arcane.balanceOf(owner)).should.be.bignumber.equal(balanceSender);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceRecipient);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContract);
        });

        it("should standard transfer amount of tokens correctly if satisfying the threshold", async () => {
            const amountPairE = ether("10000");
            const amountPairW = ether("10");
            const amountT1 = ether("1000");
            const amountT2 = ether("100");
            const amountT3 = ether("10");
            const fee = new BN("0");
            const feeT = new BN("0");
            const deadline = (await time.latest()).add(new BN("100000"));
            const newRouter = await IUniswapV2Router02.at(ROUTER_ADDRESS);
            const weth = await newRouter.WETH();
            const newWeth = await IWETH.at(weth);
            const pair = await arcane.uniswapV2Pair();

            let currentRate = _rTotal.div(_tTotal);
            let tFeeEP = amountPairE.mul(fee).div(new BN("100"));
            let tLiquidityEP = amountPairE.mul(fee).div(new BN("100"));
            let rAmountEP = amountPairE.mul(currentRate);
            let rFeeEP = tFeeEP.mul(currentRate);
            let rLiquidityEP = tLiquidityEP.mul(currentRate);
            let rTransferAmountEP = rAmountEP.sub(rFeeEP).sub(rLiquidityEP);
            let balancePairEP = rTransferAmountEP.div(currentRate);

            _rTotal = _rTotal.sub(rFeeEP);
            currentRate = _rTotal.div(_tTotal);
            let tFeeT1 = amountT1.mul(fee).div(new BN("100"));
            let tLiquidityT1 = amountT1.mul(fee).div(new BN("100"));
            let rAmountT1 = amountT1.mul(currentRate);
            let rFeeT1 = tFeeT1.mul(currentRate);
            let rLiquidityT1 = tLiquidityT1.mul(currentRate);
            let rTransferAmountT1 = rAmountT1.sub(rFeeT1).sub(rLiquidityT1);
            let rOwnedRT1 = rTransferAmountT1;
            let rOwnedCT1 = tLiquidityT1.mul(currentRate);
            _rTotal = _rTotal.sub(rFeeT1);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser1T1 = rOwnedRT1.div(currentRate);
            let balanceContractT1 = rOwnedCT1.div(currentRate);

            let tFeeT2 = amountT2.mul(feeT).div(new BN("100"));
            let tLiquidityT2 = amountT2.mul(feeT).div(new BN("100"));
            let rAmountT2 = amountT2.mul(currentRate);
            let rFeeT2 = tFeeT2.mul(currentRate);
            let rLiquidityT2 = tLiquidityT2.mul(currentRate);
            let rTransferAmountT2 = rAmountT2.sub(rFeeT2).sub(rLiquidityT2);
            let rOwnedST2 = rOwnedRT1.sub(rAmountT2);
            let rOwnedRT2 = rTransferAmountT2;
            let rOwnedCT2 = rOwnedCT1.add(tLiquidityT2.mul(currentRate));
            _rTotal = _rTotal.sub(rFeeT2);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser1T2 = rOwnedST2.div(currentRate);
            let balanceUser2T2 = rOwnedRT2.div(currentRate);
            let balanceContractT2 = rOwnedCT2.div(currentRate);

            let tFeeT3 = amountT3.mul(feeT).div(new BN("100"));
            let tLiquidityT3 = amountT3.mul(feeT).div(new BN("100"));
            let rAmountT3 = amountT3.mul(currentRate);
            let rFeeT3 = tFeeT3.mul(currentRate);
            let rLiquidityT3 = tLiquidityT3.mul(currentRate);
            let rTransferAmountT3 = rAmountT3.sub(rFeeT3).sub(rLiquidityT3);
            let rOwnedST3 = rOwnedRT2.sub(rAmountT3);
            let rOwnedRT3 = rOwnedST2.add(rTransferAmountT3);
            _rTotal = _rTotal.sub(rFeeT3);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser2T3 = rOwnedST3.div(currentRate);
            let balanceUser1T3 = rOwnedRT3.div(currentRate);
            await arcane.setTransferFeePercent(fee, fee);
            await newWeth.deposit({ value: amountPairW, gas: 5500000 });
            await newWeth.approve(newRouter.address, amountPairW);
            await arcane.approve(newRouter.address, amountPairE);
            await arcane.setThreshold(ether("0.01"));
            await newRouter.addLiquidity(arcane.address, newWeth.address, amountPairE, amountPairW, 0, 0, owner, deadline);
            (await arcane.balanceOf(pair)).should.be.bignumber.equal(balancePairEP);

            await arcane.transfer(user1, amountT1);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T1);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContractT1);

            await arcane.transfer(user2, amountT2, { from: user1 });
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T2);
            (await arcane.balanceOf(user2)).should.be.bignumber.equal(balanceUser2T2);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContractT2);

            await arcane.transfer(user1, amountT3, { from: user2 });
            (await arcane.balanceOf(user2)).should.be.bignumber.equal(balanceUser2T3);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T3);
        });

    });

    describe("ArcaneToken Withdraw Functions Phase Test Cases", function () {

        it("should withdraw leftovers correctly", async () => {
            const amountPairE = ether("10000");
            const amountPairW = ether("10");
            const amountT1 = ether("1000");
            const amountT2 = ether("100");
            const amountT3 = ether("10");
            const fee = new BN("0");
            const feeT = new BN("0");
            const deadline = (await time.latest()).add(new BN("100000"));
            const newRouter = await IUniswapV2Router02.at(ROUTER_ADDRESS);
            const weth = await newRouter.WETH();
            const newWeth = await IWETH.at(weth);

            let currentRate = _rTotal.div(_tTotal);
            let tFeeT1 = amountT1.mul(fee).div(new BN("100"));
            let tLiquidityT1 = amountT1.mul(fee).div(new BN("100"));
            let rAmountT1 = amountT1.mul(currentRate);
            let rFeeT1 = tFeeT1.mul(currentRate);
            let rLiquidityT1 = tLiquidityT1.mul(currentRate);
            let rTransferAmountT1 = rAmountT1.sub(rFeeT1).sub(rLiquidityT1);
            let rOwnedRT1 = rTransferAmountT1;
            _rTotal = _rTotal.sub(rFeeT1);
            currentRate = _rTotal.div(_tTotal);

            let tFeeT2 = amountT2.mul(feeT).div(new BN("100"));
            let tLiquidityT2 = amountT2.mul(feeT).div(new BN("100"));
            let rAmountT2 = amountT2.mul(currentRate);
            let rFeeT2 = tFeeT2.mul(currentRate);
            let rLiquidityT2 = tLiquidityT2.mul(currentRate);
            let rTransferAmountT2 = rAmountT2.sub(rFeeT2).sub(rLiquidityT2);
            let rOwnedST2 = rOwnedRT1.sub(rAmountT2);
            let rOwnedRT2 = rTransferAmountT2;
            _rTotal = _rTotal.sub(rFeeT2);
            currentRate = _rTotal.div(_tTotal);

            let tFeeT3 = amountT3.mul(feeT).div(new BN("100"));
            let tLiquidityT3 = amountT3.mul(feeT).div(new BN("100"));
            let rAmountT3 = amountT3.mul(currentRate);
            let rFeeT3 = tFeeT3.mul(currentRate);
            let rLiquidityT3 = tLiquidityT3.mul(currentRate);
            let rTransferAmountT3 = rAmountT3.sub(rFeeT3).sub(rLiquidityT3);
            let rOwnedST3 = rOwnedRT2.sub(rAmountT3);
            let rOwnedRT3 = rOwnedST2.add(rTransferAmountT3);
            _rTotal = _rTotal.sub(rFeeT3);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser2T3 = rOwnedST3.div(currentRate);
            let balanceUser1T3 = rOwnedRT3.div(currentRate);
            await arcane.setTransferFeePercent(fee, fee);
            await newWeth.deposit({ value: amountPairW, gas: 5500000 });
            await newWeth.approve(newRouter.address, amountPairW);
            await arcane.approve(newRouter.address, amountPairE);
            await arcane.setThreshold(ether("0.01"));
            await newRouter.addLiquidity(arcane.address, newWeth.address, amountPairE, amountPairW, 0, 0, owner, deadline);
            await arcane.transfer(user1, amountT1);
            await arcane.transfer(user2, amountT2, { from: user1 });
            await arcane.transfer(user1, amountT3, { from: user2 });
            (await arcane.balanceOf(user2)).should.be.bignumber.equal(balanceUser2T3);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T3);
            let beforeBalanceC = await balance.current(arcane.address);
            let result = await arcane.withdrawLeftovers();
            expectEvent(
                result,
                "WithdrawLeftovers",
                { recipient: owner, amount: beforeBalanceC }
            );
            (await balance.current(arcane.address)).should.be.bignumber.equal(new BN("0"));
        });

        it("should withdraw alien tokens correctly", async () => {
            const mockToken = await MockERC20.new(ether("100"));
            await mockToken.mint(arcane.address, ether("100"));
            let result = await arcane.withdrawAlienToken(mockToken.address, user1, ether("20"));
            expectEvent(
                result,
                "WithdrawAlienToken",
                { token: mockToken.address, recipient: user1, amount: ether("20") }
            );
            (await mockToken.balanceOf(user1)).should.be.bignumber.equal(ether("20"));
        });

        it("shouldn't withdraw alien tokens if token's address is arcane and swap&liquify if enabled", async () => {
            await expectRevert(
                arcane.withdrawAlienToken(arcane.address, user1, ether("20")),
                "Token can not be ARC"
            );
        });

        it("should withdraw alien tokens by the owner if token's address is arcane and swap&liquify if disabled", async () => {
            const amount = ether("1")
            await arcane.transfer(arcane.address, amount);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(amount);
            await arcane.setSwapAndLiquifyEnabled(false);
            await arcane.withdrawAlienToken(arcane.address, user1, amount);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal("0");
        });

        it("shouldn't withdraw alien tokens by not the owner if token's address is arcane and swap&liquify if disabled", async () => {
            const amount = ether("1")
            await arcane.transfer(arcane.address, amount);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(amount);
            await arcane.setSwapAndLiquifyEnabled(false);
            await expectRevert(
                arcane.withdrawAlienToken(arcane.address, user1, ether("1"), { from: user1 }),
                "Ownable: caller is not the owner"
            );
        });

        it("shouldn't withdraw alien tokens if amount is zero", async () => {
            const mockToken = await MockERC20.new(ether("100"));
            await mockToken.mint(arcane.address, ether("100"));
            await expectRevert(
                arcane.withdrawAlienToken(mockToken.address, user1, 0),
                "Amount can not be zero"
            );
        });

        it("shouldn't withdraw alien tokens if amount is zero", async () => {
            const mockToken = await MockERC20.new(ether("100"));
            await mockToken.mint(arcane.address, ether("10"));
            await expectRevert(
                arcane.withdrawAlienToken(mockToken.address, user1, ether("13")),
                "Insufficient tokens balance"
            );
        });

    });

    describe("ArcaneToken Fee Phase Test Cases", () => {
        it("should transfer tokens depending on transfer fee correctly taxFee = 0, liquidityFee = 2", async () => {
            const _taxFee = new BN("0");
            const _liquidityFee = new BN("2");
            const feeH = new BN("0");
            const amount = ether("4");

            // here fee zero as owner is exluded from fee 
            let currentRate = _rTotal.div(_tTotal);
            let tFeeT1 = amount.mul(feeH).div(new BN("100"));
            let tLiquidityT1 = amount.mul(feeH).div(new BN("100"));
            let tTransferAmountT1 = amount.sub(tFeeT1).sub(tLiquidityT1);
            let rAmountT1 = amount.mul(currentRate);
            let rFeeT1 = tFeeT1.mul(currentRate);
            let rLiquidityT1 = tLiquidityT1.mul(currentRate);
            let rTransferAmountT1 = rAmountT1.sub(rFeeT1).sub(rLiquidityT1);
            let rOwnedRT1 = rTransferAmountT1;
            let rOwnedCT1 = tLiquidityT1.mul(currentRate);

            let tFeeT2 = amount.mul(_taxFee).div(new BN("100"));
            let tLiquidityT2 = amount.mul(_liquidityFee).div(new BN("100"));
            let tTransferAmountT2 = amount.sub(tFeeT2).sub(tLiquidityT2);
            let rAmountT2 = amount.mul(currentRate);
            let rFeeT2 = tFeeT2.mul(currentRate);
            let rLiquidityT2 = tLiquidityT2.mul(currentRate);
            let rTransferAmountT2 = rAmountT2.sub(rFeeT2).sub(rLiquidityT2);
            let rOwnedST2 = rOwnedRT1.sub(rAmountT2);
            let rOwnedRT2 = rTransferAmountT2;
            let rOwnedCT2 = rOwnedCT1.add(tLiquidityT2.mul(currentRate));
            _rTotal = _rTotal.sub(rFeeT2);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser1T2 = rOwnedST2.div(currentRate);
            let balanceUser2T2 = rOwnedRT2.div(currentRate);
            let balanceContractT2 = rOwnedCT2.div(currentRate);
            let result1 = await arcane.transfer(user1, amount);
            expectEvent(result1, "Transfer", { from: owner, to: user1, value: tTransferAmountT1 });
            let result2 = await arcane.transfer(user2, amount, { from: user1 });
            expectEvent(result2, "Transfer", { from: user1, to: user2, value: tTransferAmountT2 });
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T2);
            (await arcane.balanceOf(user2)).should.be.bignumber.equal(balanceUser2T2);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContractT2);
        });

        it("should transfer tokens depending on fee correctly taxFee = 50, liquidityFee = 0", async () => {
            const _taxFee = new BN("50");
            const _liquidityFee = new BN("0");
            const feeH = new BN("0");
            const amount = ether("4");

            // here fee zero as owner is exluded from fee 
            let currentRate = _rTotal.div(_tTotal);
            let tFeeT1 = amount.mul(feeH).div(new BN("100"));
            let tLiquidityT1 = amount.mul(feeH).div(new BN("100"));
            let tTransferAmountT1 = amount.sub(tFeeT1).sub(tLiquidityT1);
            let rAmountT1 = amount.mul(currentRate);
            let rFeeT1 = tFeeT1.mul(currentRate);
            let rLiquidityT1 = tLiquidityT1.mul(currentRate);
            let rTransferAmountT1 = rAmountT1.sub(rFeeT1).sub(rLiquidityT1);
            let rOwnedRT1 = rTransferAmountT1;
            let rOwnedCT1 = tLiquidityT1.mul(currentRate);

            let tFeeT2 = amount.mul(_taxFee).div(new BN("100"));
            let tLiquidityT2 = amount.mul(_liquidityFee).div(new BN("100"));
            let tTransferAmountT2 = amount.sub(tFeeT2).sub(tLiquidityT2);
            let rAmountT2 = amount.mul(currentRate);
            let rFeeT2 = tFeeT2.mul(currentRate);
            let rLiquidityT2 = tLiquidityT2.mul(currentRate);
            let rTransferAmountT2 = rAmountT2.sub(rFeeT2).sub(rLiquidityT2);
            let rOwnedST2 = rOwnedRT1.sub(rAmountT2);
            let rOwnedRT2 = rTransferAmountT2;
            let rOwnedCT2 = rOwnedCT1.add(tLiquidityT2.mul(currentRate));
            _rTotal = _rTotal.sub(rFeeT2);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser1T2 = rOwnedST2.div(currentRate);
            let balanceUser2T2 = rOwnedRT2.div(currentRate);
            let balanceContractT2 = rOwnedCT2.div(currentRate);

            await arcane.setTransferFeePercent(_liquidityFee, _taxFee);

            let result1 = await arcane.transfer(user1, amount);
            expectEvent(result1, "Transfer", { from: owner, to: user1, value: tTransferAmountT1 });
            let result2 = await arcane.transfer(user2, amount, { from: user1 });
            expectEvent(result2, "Transfer", { from: user1, to: user2, value: tTransferAmountT2 });
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T2);
            (await arcane.balanceOf(user2)).should.be.bignumber.equal(balanceUser2T2);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContractT2);
        });

        it("should transfer tokens depending on the buy fee correctly", async () => {
            // liquidity fee 5%
            // tax fee 0%
            const amount = ether("1");
            const _taxFee = new BN("0");
            const buyLiquidityFee = new BN("5");
            const transferLiquidityFee = new BN("2");

            const amountPairE = ether("10");
            const amountPairW = ether("10");
            const deadline = (await time.latest()).add(new BN("100000"));
            const newRouter = await IUniswapV2Router02.at(ROUTER_ADDRESS);
            const weth = await newRouter.WETH();
            const newWeth = await IWETH.at(weth);


            let currentRate = _rTotal.div(_tTotal);
            let tFeeEP = amountPairE.mul(_taxFee).div(new BN("100"));
            let rFeeEP = tFeeEP.mul(currentRate);

            _rTotal = _rTotal.sub(rFeeEP);
            currentRate = _rTotal.div(_tTotal);
            let tFeeT1 = amount.mul(_taxFee).div(new BN("100"));
            let tLiquidityT1 = amount.mul(buyLiquidityFee).div(new BN("100"));
            let rAmountT1 = amount.mul(currentRate);
            let rFeeT1 = tFeeT1.mul(currentRate);
            let rLiquidityT1 = tLiquidityT1.mul(currentRate);
            let rTransferAmountT1 = rAmountT1.sub(rFeeT1).sub(rLiquidityT1);
            let rOwnedRT1 = rTransferAmountT1;
            let rOwnedCT1 = tLiquidityT1.mul(currentRate);
            _rTotal = _rTotal.sub(rFeeT1);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser1T1 = rOwnedRT1.div(currentRate);
            let balanceContractT1 = rOwnedCT1.div(currentRate);

            await newWeth.deposit({ value: amountPairW, gas: 5500000 });
            await newWeth.approve(newRouter.address, amountPairW);
            await arcane.approve(newRouter.address, amountPairE);
            await arcane.setThreshold(ether("4"));
            await newRouter.addLiquidity(arcane.address, newWeth.address, amountPairE, amountPairW, 0, 0, owner, deadline);
            //buy tokens
            await newRouter.swapETHForExactTokens(amount, [newWeth.address, arcane.address], user2, deadline, { value: ether("2"), from: user2 });

            (await arcane.balanceOf(user2)).should.be.bignumber.equal(balanceUser1T1);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContractT1);
        });

        it("should transfer tokens correctly depending on the fee while add liquidity", async () => {
            // liquidity fee 5%
            // tax fee 0%
            const amount = ether("1");
            const _taxFee = new BN("0");
            const swapLiquidityFee = new BN("5");
            const transferLiquidityFee = new BN("2");

            const amountPairE = ether("10");
            const amountPairW = ether("10");
            const deadline = (await time.latest()).add(new BN("100000"));
            const newRouter = await IUniswapV2Router02.at(ROUTER_ADDRESS);
            await arcane.includeInFee(owner);
            const weth = await newRouter.WETH();
            const newWeth = await IWETH.at(weth);
            const pair = await arcane.uniswapV2Pair();

            let currentRate = _rTotal.div(_tTotal);
            let tFeeEP = amountPairE.mul(_taxFee).div(new BN("100"));
            let tLiquidityEP = amountPairE.mul(swapLiquidityFee).div(new BN("100"));
            let rAmountEP = amountPairE.mul(currentRate);
            let rFeeEP = tFeeEP.mul(currentRate);
            let rLiquidityEP = tLiquidityEP.mul(currentRate);
            let rTransferAmountEP = rAmountEP.sub(rFeeEP).sub(rLiquidityEP);
            let balancePairEP = rTransferAmountEP.div(currentRate);

            await newWeth.deposit({ value: amountPairW, gas: 5500000 });
            await newWeth.approve(newRouter.address, amountPairW);
            await arcane.approve(newRouter.address, amountPairE);
            await arcane.setThreshold(ether("4"));
            await newRouter.addLiquidity(arcane.address, newWeth.address, amountPairE, amountPairW, 0, 0, owner, deadline);


            (await arcane.balanceOf(pair)).should.be.bignumber.equal(balancePairEP);
            await arcane.excludeFromFee(owner);
        });


        it("should transfer tokens depending on the sell fee correctly", async () => {
            // liquidity fee 5%
            // tax fee 0%
            const _taxFee = new BN("0");
            const sellLiquidityFee = new BN("5");
            const amount = ether("1");
            const amountPairE = ether("10");
            const amountPairW = ether("10");
            const deadline = (await time.latest()).add(new BN("100000"));
            const newRouter = await IUniswapV2Router02.at(ROUTER_ADDRESS);
            const weth = await newRouter.WETH();
            const newWeth = await IWETH.at(weth);
            const pair = await arcane.uniswapV2Pair();

            currentRate = _rTotal.div(_tTotal);
            let tFeeT1 = amount.mul(_taxFee).div(new BN("100"));
            let tLiquidityT1 = amount.mul(sellLiquidityFee).div(new BN("100"));
            let rAmountT1 = amount.mul(currentRate);
            let rFeeT1 = tFeeT1.mul(currentRate);
            let rLiquidityT1 = tLiquidityT1.mul(currentRate);
            let rTransferAmountT1 = rAmountT1.sub(rFeeT1).sub(rLiquidityT1);
            let rOwnedRT1 = rTransferAmountT1;
            let rOwnedCT1 = tLiquidityT1.mul(currentRate);
            _rTotal = _rTotal.sub(rFeeT1);
            currentRate = _rTotal.div(_tTotal);
            let balanceUser1T1 = rOwnedRT1.div(currentRate);
            let balanceContractT1 = rOwnedCT1.div(currentRate);

            await newWeth.deposit({ value: amountPairW, gas: 5500000 });
            await newWeth.approve(newRouter.address, amountPairW);
            await arcane.approve(newRouter.address, amountPairE);
            await arcane.setThreshold(ether("4"));
            await newRouter.addLiquidity(arcane.address, newWeth.address, amountPairE, amountPairW, 0, 0, owner, deadline);
            await arcane.transfer(user1, amount);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(amount);
            //sell tokens
            await arcane.approve(newRouter.address, amountPairE, { from: user1 });
            await newRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(ether("1"), 0, [arcane.address, newWeth.address], owner, deadline, { from: user1 });

            const pairBalance = (await arcane.balanceOf(pair)).sub(amountPairE);
            (await arcane.balanceOf(user1)).should.be.bignumber.equal(new BN("0"));
            (pairBalance).should.be.bignumber.equal(balanceUser1T1);
            (await arcane.balanceOf(arcane.address)).should.be.bignumber.equal(balanceContractT1);

        })

        it("Balances after transfer all tokens when _taxFee = 0; _liquidityFee = 2", async () => {
            const amount = ether("14");
            await arcane.transfer(user1, amount);
            let balanceUserB = await arcane.balanceOf(user1);
            console.log("balance of sender before transfer: " + balanceUserB.toString());
            await arcane.transfer(user2, amount.div(new BN("2")), { from: user1 });
            let balanceUserA = await arcane.balanceOf(user1);
            let balanceUserC = await arcane.balanceOf(user2);
            let balanceContract = await arcane.balanceOf(arcane.address);
            console.log("Balances after transfer tokens (7 ether from 14 ether) when _taxFee = 0; _liquidityFee = 2:");
            console.log("balance of sender: " + balanceUserA.toString());
            console.log("balance of recipient: " + balanceUserC.toString());
            console.log("balance of contract: " + balanceContract.toString());
        });

    });

});