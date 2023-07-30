const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');
const {
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
const ArcaneTokenV2 = artifacts.require("ArcaneTokenV2Mock");
const IUniswapV2Router02 = artifacts.require("IUniswapV2Router02");
const IWETH = artifacts.require("IWETH");

contract("ArcaneToken (upgradeable)", function (accounts) {
    [owner, user1, user2] = accounts;

    const ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    const _tTotal = new BN("600").mul(new BN("10").pow(new BN("6"))).mul(new BN("10").pow(new BN("18")));
    const maxUINT256 = new BN("2").pow(new BN("256")).sub(new BN("1"));
    _rTotal = maxUINT256.sub(maxUINT256.mod(_tTotal));

    before(async function () {
        snapshotA = await snapshot();
    });

    beforeEach(async function () {
        arcane = await deployProxy(ArcaneToken, [ROUTER_ADDRESS, owner], {initializer: 'initialize'});
        arcaneV2 = await upgradeProxy(arcane.address, ArcaneTokenV2);
    });

    afterEach(async function () {
        await snapshotA.restore();
    });

    describe("ArcaneToken Upgradeable Phase Test Cases", function () {
        
        it("shouldn't call initialize method again", async () => {
            await expectRevert(
                arcaneV2.initialize(ROUTER_ADDRESS, owner), 
                "Initializable: contract is already initialized"
            );
        });

        it("should deploy correctly if deploy not in arcane", async () => {
            const newarcane = await deployProxy(arcaneV2, [ROUTER_ADDRESS, owner], {initializer: 'initialize'});
            let currentRate = _rTotal.div(_tTotal);
            let balanceOwner = _rTotal.div(currentRate);
            (await newarcane.uniswapV2Router()).should.be.equal(ROUTER_ADDRESS);
            (await newarcane.balanceOf(owner)).should.be.bignumber.equal(balanceOwner);
            (await newarcane.isExcludedFromFee(owner)).should.be.equal(true);
            (await newarcane.isExcludedFromFee(newarcane.address)).should.be.equal(true);
            (await newarcane.maxTxAmount()).should.be.bignumber.equal(_tTotal);
            ((await newarcane.swapFee())._liquidityFee).should.be.bignumber.equal(new BN("5"));
            ((await newarcane.swapFee())._taxFee).should.be.bignumber.equal(new BN("0"));
            ((await newarcane.transferFee())._liquidityFee).should.be.bignumber.equal(new BN("2"));
            ((await newarcane.transferFee())._taxFee).should.be.bignumber.equal(new BN("0"));
            (await newarcane.swapAndLiquifyEnabled()).should.be.equal(true);
            (await newarcane.name()).should.be.equal("Arcane Token");
            (await newarcane.symbol()).should.be.equal("Arcane");
            (await newarcane.totalSupply()).should.be.bignumber.equal(_tTotal);
            (await newarcane.decimals()).should.be.bignumber.equal(new BN("18"));
            await expectRevert(
                newarcane.initialize(ROUTER_ADDRESS, owner), 
                "Initializable: contract is already initialized"
            );
        });

        it("should standard transfer amount of tokens correctly if satisfying the threshold", async () => {
            const amountPairE = ether("10000");
            const amountPairW = ether("10");
            const amountT1 = ether("1000");
            const amountT2 = ether("100");
            const amountT3 = ether("10");
            const fee = new BN("0");
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

            let tFeeT2 = amountT2.mul(fee).div(new BN("100"));
            let tLiquidityT2 = amountT2.mul(fee).div(new BN("100"));
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

            let tFeeT3 = amountT3.mul(fee).div(new BN("100"));
            let tLiquidityT3 = amountT3.mul(fee).div(new BN("100"));
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
            await newWeth.deposit({value: amountPairW, gas: 5500000});
            await newWeth.approve(newRouter.address, amountPairW);
            await arcaneV2.approve(newRouter.address, amountPairE);
            await arcaneV2.setThreshold(ether("0.01"));
            await newRouter.addLiquidity(arcaneV2.address, newWeth.address, amountPairE, amountPairW, 0, 0, owner, deadline);
            (await arcaneV2.balanceOf(pair)).should.be.bignumber.equal(balancePairEP);
            
            await arcaneV2.transfer(user1, amountT1);
            (await arcaneV2.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T1);
            (await arcaneV2.balanceOf(arcaneV2.address)).should.be.bignumber.equal(balanceContractT1);
            
            await arcaneV2.transfer(user2, amountT2, {from: user1});
            (await arcaneV2.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T2);
            (await arcaneV2.balanceOf(user2)).should.be.bignumber.equal(balanceUser2T2);
            (await arcaneV2.balanceOf(arcaneV2.address)).should.be.bignumber.equal(balanceContractT2);
            
            await arcaneV2.transfer(user1, amountT3, {from: user2});
            (await arcaneV2.balanceOf(user2)).should.be.bignumber.equal(balanceUser2T3);
            (await arcaneV2.balanceOf(user1)).should.be.bignumber.equal(balanceUser1T3);
        });

    });
});
