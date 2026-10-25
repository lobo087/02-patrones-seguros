import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { encodeFunctionData, keccak256, stringToHex } from "viem";

describe("CustodiaSegura", async function () {
  const { viem } = await network.create({ network: "hardhatMainnet" });
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();
  const [administrador, operador, pausador, externo] =
    await viem.getWalletClients();

  async function confirmar(promesaHash: Promise<`0x${string}`>) {
    const hash = await promesaHash;
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function desplegarV1() {
    const implementacionV1 = await viem.deployContract("CustodiaSeguraV1");
    const datosIniciales = encodeFunctionData({
      abi: implementacionV1.abi,
      functionName: "initialize",
      args: [
        administrador.account.address,
        operador.account.address,
        pausador.account.address,
        1_000n,
        1_800n,
      ],
    });
    const proxy = await viem.deployContract("ProxyCustodia", [
      implementacionV1.address,
      datosIniciales,
    ]);

    const admin = await viem.getContractAt("CustodiaSeguraV1", proxy.address, {
      client: { wallet: administrador },
    });
    const operacion = await viem.getContractAt("CustodiaSeguraV1", proxy.address, {
      client: { wallet: operador },
    });
    const pausa = await viem.getContractAt("CustodiaSeguraV1", proxy.address, {
      client: { wallet: pausador },
    });
    const sinRol = await viem.getContractAt("CustodiaSeguraV1", proxy.address, {
      client: { wallet: externo },
    });

    return { implementacionV1, proxy, admin, operacion, pausa, sinRol };
  }

  it("aplica roles, pausa y límites unitario y diario", async function () {
    const { admin, operacion, pausa, sinRol } = await desplegarV1();

    await confirmar(
      operacion.write.registrarOperacion([
        keccak256(stringToHex("OP-001")),
        800n,
      ]),
    );

    await viem.assertions.revertWithCustomError(
      sinRol.write.registrarOperacion([
        keccak256(stringToHex("SIN-ROL")),
        100n,
      ]),
      admin,
      "AccessControlUnauthorizedAccount",
    );
    await viem.assertions.revertWithCustomError(
      operacion.write.registrarOperacion([
        keccak256(stringToHex("EXCESO")),
        1_200n,
      ]),
      admin,
      "LimitePorOperacionExcedido",
    );

    await confirmar(pausa.write.pausar());
    await viem.assertions.revertWithCustomError(
      operacion.write.registrarOperacion([
        keccak256(stringToHex("PAUSADA")),
        100n,
      ]),
      admin,
      "EnforcedPause",
    );
    await confirmar(pausa.write.reanudar());

    await confirmar(
      operacion.write.registrarOperacion([
        keccak256(stringToHex("OP-002")),
        900n,
      ]),
    );
    await viem.assertions.revertWithCustomError(
      operacion.write.registrarOperacion([
        keccak256(stringToHex("EXCESO-DIARIO")),
        200n,
      ]),
      admin,
      "LimiteDiarioExcedido",
    );

    assert.equal(await operacion.read.totalProcesado(), 1_700n);
  });

  it("bloquea la inicialización directa de la implementación", async function () {
    const { implementacionV1 } = await desplegarV1();
    const directa = await viem.getContractAt(
      "CustodiaSeguraV1",
      implementacionV1.address,
      { client: { wallet: administrador } },
    );

    await viem.assertions.revertWithCustomError(
      directa.write.initialize([
        administrador.account.address,
        operador.account.address,
        pausador.account.address,
        1_000n,
        1_800n,
      ]),
      directa,
      "InvalidInitialization",
    );
  });

  it("actualiza a V2, conserva el estado y aplica el límite global", async function () {
    const { proxy, admin, operacion } = await desplegarV1();

    await confirmar(
      operacion.write.registrarOperacion([
        keccak256(stringToHex("OP-A")),
        800n,
      ]),
    );
    await confirmar(
      operacion.write.registrarOperacion([
        keccak256(stringToHex("OP-B")),
        900n,
      ]),
    );

    const implementacionV2 = await viem.deployContract("CustodiaSeguraV2");
    const datosV2 = encodeFunctionData({
      abi: implementacionV2.abi,
      functionName: "inicializarV2",
      args: [2_500n],
    });

    await viem.assertions.revertWithCustomError(
      operacion.write.upgradeToAndCall([implementacionV2.address, datosV2]),
      admin,
      "AccessControlUnauthorizedAccount",
    );
    await confirmar(
      admin.write.upgradeToAndCall([implementacionV2.address, datosV2]),
    );

    const v2 = await viem.getContractAt("CustodiaSeguraV2", proxy.address, {
      client: { wallet: operador },
    });
    assert.equal(await v2.read.version(), 2n);
    assert.equal(await v2.read.totalProcesado(), 1_700n);
    assert.equal(await v2.read.limiteGlobal(), 2_500n);

    await testClient.increaseTime({ seconds: 86_400 });
    await testClient.mine({ blocks: 1 });

    await viem.assertions.revertWithCustomError(
      v2.write.registrarOperacion([
        keccak256(stringToHex("EXCESO-GLOBAL")),
        900n,
      ]),
      v2,
      "LimiteGlobalExcedido",
    );
    await confirmar(
      v2.write.registrarOperacion([
        keccak256(stringToHex("OP-C")),
        700n,
      ]),
    );
    assert.equal(await v2.read.totalProcesado(), 2_400n);
  });
});
