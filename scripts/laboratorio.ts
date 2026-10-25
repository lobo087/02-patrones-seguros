import fs from "node:fs";
import path from "node:path";

import { network } from "hardhat";
import { encodeFunctionData, keccak256, stringToHex } from "viem";

const { viem } = await network.create({ network: "hardhatMainnet" });
const publicClient = await viem.getPublicClient();
const testClient = await viem.getTestClient();
const [administrador, operador, pausador, externo] =
  await viem.getWalletClients();

const transacciones: Array<{ operacion: string; hash: string; gasUsado: string }> = [];
const controles: Array<{ descripcion: string; resultado: string }> = [];

// Espera el minado y captura una evidencia de costo para el informe.
async function confirmar(
  operacion: string,
  promesaHash: Promise<`0x${string}`>,
) {
  const hash = await promesaHash;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  transacciones.push({
    operacion,
    hash,
    gasUsado: receipt.gasUsed.toString(),
  });
}

// Demuestra que un control funciona únicamente cuando la acción es rechazada.
async function debeRechazar(
  descripcion: string,
  accion: () => Promise<`0x${string}`>,
) {
  try {
    await confirmar(descripcion, accion());
    throw new Error(`La prueba no rechazó: ${descripcion}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("La prueba no rechazó")) {
      throw error;
    }
    controles.push({ descripcion, resultado: "RECHAZO_ESPERADO" });
    console.log(`✓ Rechazo esperado: ${descripcion}`);
  }
}

console.log("\n1. Despliegue e inicialización atómica de V1");

// Despliega la lógica; su constructor impide inicializar esta dirección directamente.
const implementacionV1 = await viem.deployContract("CustodiaSeguraV1");

// Codifica initialize para que el proxy nazca configurado y no quede expuesto.
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

// El proxy conserva el estado y delega las llamadas a la implementación activa.
const proxy = await viem.deployContract("ProxyCustodia", [
  implementacionV1.address,
  datosIniciales,
]);

// Las cuatro vistas usan la misma dirección, pero firman con cuentas distintas.
const contratoAdmin = await viem.getContractAt("CustodiaSeguraV1", proxy.address, {
  client: { wallet: administrador },
});
const contratoOperador = await viem.getContractAt(
  "CustodiaSeguraV1",
  proxy.address,
  { client: { wallet: operador } },
);
const contratoPausador = await viem.getContractAt(
  "CustodiaSeguraV1",
  proxy.address,
  { client: { wallet: pausador } },
);
const contratoExterno = await viem.getContractAt("CustodiaSeguraV1", proxy.address, {
  client: { wallet: externo },
});

const ref1 = keccak256(stringToHex("OP-001"));
const ref2 = keccak256(stringToHex("OP-002"));

// Una cuenta autorizada registra una operación dentro de los límites.
await confirmar(
  "registrar OP-001",
  contratoOperador.write.registrarOperacion([ref1, 800n]),
);
console.log("✓ Operación OP-001 aceptada por 800 unidades");

// Demuestra control de rol, límite unitario y pausa de emergencia.
await debeRechazar("cuenta externa sin rol", () =>
  contratoExterno.write.registrarOperacion([
    keccak256(stringToHex("NO-AUTORIZADA")),
    100n,
  ]),
);
await debeRechazar("monto superior al límite por operación", () =>
  contratoOperador.write.registrarOperacion([
    keccak256(stringToHex("EXCESO-UNITARIO")),
    1_200n,
  ]),
);

await confirmar("pausar", contratoPausador.write.pausar());
await debeRechazar("contrato pausado", () =>
  contratoOperador.write.registrarOperacion([
    keccak256(stringToHex("DURANTE-PAUSA")),
    100n,
  ]),
);
await confirmar("reanudar", contratoPausador.write.reanudar());

// Acumula 1.700 unidades y comprueba el tope diario de 1.800.
await confirmar(
  "registrar OP-002",
  contratoOperador.write.registrarOperacion([ref2, 900n]),
);
await debeRechazar("límite diario proyectado de 1.900", () =>
  contratoOperador.write.registrarOperacion([
    keccak256(stringToHex("EXCESO-DIARIO")),
    200n,
  ]),
);

console.log("\n2. Actualización controlada de V1 a V2");

// Despliega la nueva lógica sin cambiar todavía la dirección pública del proxy.
const implementacionV2 = await viem.deployContract("CustodiaSeguraV2");

// Activa el límite global en la misma transacción que cambia la implementación.
const datosV2 = encodeFunctionData({
  abi: implementacionV2.abi,
  functionName: "inicializarV2",
  args: [2_500n],
});

// Solo ACTUALIZADOR_ROLE puede ejecutar el cambio de lógica.
await confirmar(
  "actualizar a V2",
  contratoAdmin.write.upgradeToAndCall([implementacionV2.address, datosV2]),
);

// La ABI de V2 se utiliza sobre la misma dirección y el estado anterior permanece.
const contratoV2 = await viem.getContractAt("CustodiaSeguraV2", proxy.address, {
  client: { wallet: operador },
});
console.log(`✓ Dirección del proxy sin cambios: ${proxy.address}`);
console.log(`✓ Versión activa: ${await contratoV2.read.version()}`);
console.log(`✓ Total conservado: ${await contratoV2.read.totalProcesado()}`);
console.log(`✓ Nuevo límite global: ${await contratoV2.read.limiteGlobal()}`);

// Avanza un día local para evaluar el límite global sin interferencia del límite diario.
await testClient.increaseTime({ seconds: 86_400 });
await testClient.mine({ blocks: 1 });

// V2 rechaza 900 porque 1.700 + 900 supera el límite global de 2.500.
await debeRechazar("nuevo límite global de V2", () =>
  contratoV2.write.registrarOperacion([
    keccak256(stringToHex("EXCESO-GLOBAL")),
    900n,
  ]),
);

// Una operación de 700 es válida y deja el total acumulado en 2.400.
await confirmar(
  "registrar OP-003",
  contratoV2.write.registrarOperacion([
    keccak256(stringToHex("OP-003")),
    700n,
  ]),
);

const reporte = {
  red: "Hardhat EVM local en memoria",
  proxy: proxy.address,
  implementacionV1: implementacionV1.address,
  implementacionV2: implementacionV2.address,
  roles: {
    administrador: administrador.account.address,
    operador: operador.account.address,
    pausador: pausador.account.address,
    externo: externo.account.address,
  },
  versionFinal: (await contratoV2.read.version()).toString(),
  totalFinal: (await contratoV2.read.totalProcesado()).toString(),
  limiteGlobal: (await contratoV2.read.limiteGlobal()).toString(),
  transacciones,
  controles,
};

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(
  path.resolve("reports/resultado-laboratorio.json"),
  `${JSON.stringify(reporte, null, 2)}\n`,
);

console.log(`✓ Total final permitido: ${reporte.totalFinal}`);
console.log("✓ Reporte: reports/resultado-laboratorio.json");
console.log("\nLaboratorio completado: todos los controles produjeron el resultado esperado.");
