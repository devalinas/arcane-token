const { deployProxy } = require('@openzeppelin/truffle-upgrades');

const ArcaneToken = artifacts.require('ArcaneToken');

module.exports = async function (deployer) {
    // const router = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"; // router address for mumbai
    // const router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" // router address for ropsten
    const router = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1"; // router address for bscscan testnet
    const owner = "0x9b38DE554AC02af25c911e262690550c8584BFaa"; // address where all tokens and ownership will be transfered
    const instance = await deployProxy(ArcaneToken, [router, owner], { deployer, initializer: 'initialize' });
    console.log('Deployed', instance.address);
};