// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @notice Proxy mínimo: conserva el estado y delega la lógica a una implementación UUPS.
contract ProxyCustodia is ERC1967Proxy {
    // data contiene initialize y se ejecuta atómicamente durante el despliegue.
    constructor(
        address implementacion,
        bytes memory data
    ) ERC1967Proxy(implementacion, data) {}
}
