# Laboratorio: patrones seguros y actualización UUPS

Este proyecto implementa un registro de operaciones de custodia que combina modularidad, validaciones reutilizables, control de acceso basado en roles, pausa de emergencia, errores personalizados, límites operativos y actualización controlada mediante el patrón UUPS.

El laboratorio despliega `CustodiaSeguraV1` detrás de un proxy ERC-1967, procesa operaciones permitidas y rechazadas, actualiza la lógica a `CustodiaSeguraV2` y demuestra que la dirección y el estado permanecen intactos.

## Objetivos

- Separar validaciones, lógica, proxy e implementación actualizada.
- Aplicar mínimo privilegio mediante roles independientes.
- Rechazar entradas inválidas, referencias duplicadas y montos excesivos.
- Detener y reanudar operaciones sin destruir el estado.
- Actualizar de V1 a V2 conservando la dirección pública y los datos.
- Incorporar un límite global sin alterar el almacenamiento previo.

## Tecnologías probadas

- Node.js 24.19.0
- npm 11.9.0
- Hardhat 3.18.1
- Solidity 0.8.37
- OpenZeppelin Contracts 5.6.1
- OpenZeppelin Contracts Upgradeable 5.6.1
- Viem 2.57.x

## Instalación paso a paso

1. Descargue o clone este repositorio.
2. Abra una terminal dentro de la carpeta.
3. Compruebe las versiones:

```bash
node --version
npm --version
```

4. Instale las versiones registradas en `package-lock.json`:

```bash
npm ci
```

5. Compile los cuatro contratos:

```bash
npm run compile
```

6. Ejecute las pruebas automatizadas:

```bash
npm test
```

Deben aprobarse tres pruebas de integración.

## Ejecución del laboratorio

```bash
npm run lab
```

El ejercicio realiza la siguiente secuencia:

1. Despliega la implementación V1 con los inicializadores bloqueados.
2. Despliega el proxy e inicializa roles y límites de forma atómica.
3. Acepta `OP-001` por 800 unidades.
4. Rechaza una cuenta sin rol y una operación de 1.200 unidades.
5. Pausa el contrato y rechaza una escritura durante la pausa.
6. Reanuda y acepta `OP-002` por 900 unidades.
7. Rechaza un acumulado diario de 1.900 frente al límite de 1.800.
8. Actualiza el proxy a V2 y configura un límite global de 2.500.
9. Conserva las 1.700 unidades registradas en V1.
10. Rechaza una operación que elevaría el acumulado a 2.600 y acepta otra que lo deja en 2.400.

El reporte queda en `reports/resultado-laboratorio.json`.

Para ejecutar todo el proceso:

```bash
npm run check
```

## Qué hace cada contrato

| Archivo | Responsabilidad |
| --- | --- |
| `ValidacionesOperativas.sol` | Centraliza las comprobaciones de direcciones, referencias y montos. |
| `CustodiaSeguraV1.sol` | Define roles, pausa, deduplicación y límites por operación y día. |
| `ProxyCustodia.sol` | Conserva estado y dirección mientras delega la ejecución. |
| `CustodiaSeguraV2.sol` | Extiende V1 y agrega un límite global al final del almacenamiento. |

## Explicación de los fragmentos de código

**Inicialización bloqueada.** El constructor de V1 ejecuta `_disableInitializers()`. Esto impide que una persona inicialice directamente la implementación y se asigne privilegios.

**Inicialización atómica del proxy.** `ProxyCustodia` recibe la dirección de V1 y los datos codificados de `initialize`. La asignación de roles y límites ocurre en la misma transacción del despliegue; el proxy no queda temporalmente sin configurar.

**Separación de funciones.** `OPERADOR_ROLE` registra operaciones, `PAUSADOR_ROLE` responde ante incidentes y `ACTUALIZADOR_ROLE` autoriza cambios de lógica. Ninguno de estos roles se concede implícitamente a los demás.

**Validaciones y errores.** La biblioteca rechaza direcciones nulas, referencias vacías y montos cero. V1 utiliza errores personalizados para duplicados y límites, lo que evita mensajes ambiguos y facilita interpretar cada reversión.

**Límites operativos.** `_validarLimites()` comprueba el monto individual y el acumulado diario antes de escribir. Como es `virtual`, V2 puede extenderla mediante `super._validarLimites(monto)` sin eliminar los controles anteriores.

**Compatibilidad del almacenamiento.** `limiteGlobal` se declara después de todas las variables heredadas. V2 no reordena ni cambia el tipo de los datos de V1, por lo que el total de 1.700 permanece después de actualizar.

**Actualización UUPS.** `_authorizeUpgrade()` exige `ACTUALIZADOR_ROLE`. El script llama `upgradeToAndCall` para cambiar la implementación e inicializar el nuevo límite en una única transacción.

**Evidencia del laboratorio.** `confirmar()` espera el recibo y registra gas; `debeRechazar()` considera correcta una prueba únicamente cuando la EVM revierte. Al final, ambos resultados se guardan en JSON.

## Estructura

```text
contracts/       Biblioteca, V1, proxy y V2
scripts/         Ejecución comentada de extremo a extremo
test/            Pruebas de integración
reports/         Resultado generado
hardhat.config.ts
```

## Alcance de seguridad

El proyecto es didáctico y se ejecuta sobre una EVM local. Un sistema productivo también necesitaría gobierno multifirma, timelock, monitoreo de eventos, revisión independiente, gestión segura de claves, pruebas de invariantes y un procedimiento formal de actualización.

## Clonar el repositorio y comenzar a trabajar

Sigue estos pasos para descargar el repositorio y trabajar localmente desde Visual Studio Code.

### 1. Requisitos previos

Verifica que tengas instalados:

- [Git](https://git-scm.com/downloads)
- [Visual Studio Code](https://code.visualstudio.com/)

### 2. Abrir PowerShell

Abre PowerShell o la terminal integrada de Visual Studio Code y dirígete a la carpeta donde guardarás el proyecto. Por ejemplo:

```powershell
cd $HOME\Documents
```

### 3. Clonar el repositorio

Ejecuta el siguiente comando:

```powershell
git clone https://github.com/lobo087/02-patrones-seguros.git
```

Esto descargará el repositorio y creará la carpeta `02-patrones-seguros`.

### 4. Abrir el proyecto en VS Code

Ingresa a la carpeta del proyecto:

```powershell
cd 02-auditoria-rpc
```

Abre el proyecto en Visual Studio Code:

```powershell
code .
```

### 5. Verificar el repositorio

Comprueba que Git reconoce el proyecto y que está conectado al repositorio original:

```powershell
git status
git remote -v
```

### 6. Guardar los cambios

Después de modificar los archivos, puedes registrar tus cambios localmente con los siguientes comandos:

```powershell
git add .
git commit -m "Descripción de los cambios realizados"
```

Para publicar los cambios en GitHub, necesitarás permisos de escritura en el repositorio original o trabajar desde un *fork* de tu propia cuenta.

**Nota:** Clonar el repositorio no modifica el proyecto original. Los cambios realizados localmente solo se publican en GitHub cuando se ejecuta un `git push` con los permisos correspondientes.

## Licencia

MIT. Consulte `LICENSE`.
