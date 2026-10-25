// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @notice Reúne validaciones reutilizables y evita duplicarlas en otros módulos.
library ValidacionesOperativas {
    error DireccionNula();
    error ReferenciaInvalida();
    error MontoInvalido();

    // Rechaza cuentas nulas al configurar responsables del sistema.
    function validarDireccion(address cuenta) internal pure {
        if (cuenta == address(0)) revert DireccionNula();
    }

    // Comprueba los datos mínimos antes de que una operación modifique el estado.
    function validarOperacion(bytes32 referencia, uint256 monto) internal pure {
        if (referencia == bytes32(0)) revert ReferenciaInvalida();
        if (monto == 0) revert MontoInvalido();
    }
}
