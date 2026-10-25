// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {CustodiaSeguraV1} from "./CustodiaSeguraV1.sol";

/// @notice Segunda versión que conserva V1 y añade un límite acumulado global.
contract CustodiaSeguraV2 is CustodiaSeguraV1 {
    // La variable se agrega al final para preservar el almacenamiento de V1.
    uint256 public limiteGlobal;

    error LimiteGlobalExcedido(uint256 proyectado, uint256 permitido);
    event LimiteGlobalConfigurado(uint256 limite);

    // Inicializa una sola vez el estado incorporado por la segunda versión.
    function inicializarV2(
        uint256 nuevoLimiteGlobal
    ) external onlyRole(DEFAULT_ADMIN_ROLE) reinitializer(2) {
        if (nuevoLimiteGlobal < totalProcesado) revert ConfiguracionInvalida();
        limiteGlobal = nuevoLimiteGlobal;
        emit LimiteGlobalConfigurado(nuevoLimiteGlobal);
    }

    // Extiende las reglas de V1 sin sustituir los límites existentes.
    function _validarLimites(uint256 monto) internal view override {
        super._validarLimites(monto);

        uint256 proyectado = totalProcesado + monto;
        if (limiteGlobal == 0 || proyectado > limiteGlobal) {
            revert LimiteGlobalExcedido(proyectado, limiteGlobal);
        }
    }

    // Permite comprobar qué lógica se encuentra activa detrás del proxy.
    function version() external pure returns (uint256) {
        return 2;
    }
}
