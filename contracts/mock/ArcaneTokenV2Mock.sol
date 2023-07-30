// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.9;

import "../ArcaneToken.sol";

contract ArcaneTokenV2Mock is ArcaneToken {
    uint256 internal value;

    function setValue(uint256 _value) external virtual {
        value = _value;
    }

    function getValue() external view virtual returns (uint256) {
        return value;
    }
}
