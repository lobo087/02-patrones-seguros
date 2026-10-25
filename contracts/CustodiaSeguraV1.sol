// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ValidacionesOperativas} from "./ValidacionesOperativas.sol";

/// @notice Registro didáctico de operaciones sometidas a roles y límites.
contract CustodiaSeguraV1 is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant OPERADOR_ROLE = keccak256("OPERADOR_ROLE");
    bytes32 public constant PAUSADOR_ROLE = keccak256("PAUSADOR_ROLE");
    bytes32 public constant ACTUALIZADOR_ROLE = keccak256("ACTUALIZADOR_ROLE");

    uint256 public limitePorOperacion;
    uint256 public limiteDiario;
    uint256 public totalProcesado;

    mapping(uint256 dia => uint256 monto) public procesadoPorDia;
    mapping(bytes32 referencia => bool usada) public referenciasUsadas;

    error ConfiguracionInvalida();
    error ReferenciaDuplicada(bytes32 referencia);
    error LimitePorOperacionExcedido(uint256 solicitado, uint256 permitido);
    error LimiteDiarioExcedido(uint256 proyectado, uint256 permitido);

    event OperacionRegistrada(
        bytes32 indexed referencia,
        address indexed operador,
        uint256 monto,
        uint256 dia
    );

    // Bloquea la implementación para que nadie pueda inicializarla directamente.
    constructor() {
        _disableInitializers();
    }

    // Sustituye al constructor en el estado del proxy y asigna roles separados.
    function initialize(
        address administrador,
        address operador,
        address pausador,
        uint256 nuevoLimitePorOperacion,
        uint256 nuevoLimiteDiario
    ) external initializer {
        ValidacionesOperativas.validarDireccion(administrador);
        ValidacionesOperativas.validarDireccion(operador);
        ValidacionesOperativas.validarDireccion(pausador);

        if (
            nuevoLimitePorOperacion == 0 ||
            nuevoLimiteDiario < nuevoLimitePorOperacion
        ) revert ConfiguracionInvalida();

        __AccessControl_init();
        __Pausable_init();

        limitePorOperacion = nuevoLimitePorOperacion;
        limiteDiario = nuevoLimiteDiario;

        _grantRole(DEFAULT_ADMIN_ROLE, administrador);
        _grantRole(ACTUALIZADOR_ROLE, administrador);
        _grantRole(OPERADOR_ROLE, operador);
        _grantRole(PAUSADOR_ROLE, pausador);
    }

    // Registra una referencia una sola vez y únicamente si todas las reglas se cumplen.
    function registrarOperacion(
        bytes32 referencia,
        uint256 monto
    ) external onlyRole(OPERADOR_ROLE) whenNotPaused {
        ValidacionesOperativas.validarOperacion(referencia, monto);
        if (referenciasUsadas[referencia]) {
            revert ReferenciaDuplicada(referencia);
        }

        _validarLimites(monto);

        uint256 dia = _diaActual();
        referenciasUsadas[referencia] = true;
        procesadoPorDia[dia] += monto;
        totalProcesado += monto;

        emit OperacionRegistrada(referencia, msg.sender, monto, dia);
    }

    // Mantiene las reglas en una función extensible para que V2 agregue controles.
    function _validarLimites(uint256 monto) internal view virtual {
        if (monto > limitePorOperacion) {
            revert LimitePorOperacionExcedido(monto, limitePorOperacion);
        }

        uint256 proyectado = procesadoPorDia[_diaActual()] + monto;
        if (proyectado > limiteDiario) {
            revert LimiteDiarioExcedido(proyectado, limiteDiario);
        }
    }

    // El rol de pausa no recibe automáticamente capacidad de actualización.
    function pausar() external onlyRole(PAUSADOR_ROLE) {
        _pause();
    }

    // Restablece la operación normal después de atender el incidente.
    function reanudar() external onlyRole(PAUSADOR_ROLE) {
        _unpause();
    }

    // Convierte el timestamp en un identificador diario sencillo para el laboratorio.
    function _diaActual() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    // Protege la actualización UUPS con un rol diferente al rol operativo.
    function _authorizeUpgrade(
        address
    ) internal override onlyRole(ACTUALIZADOR_ROLE) {}
}
