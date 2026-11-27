import { BrowserProvider, Contract, JsonRpcProvider, formatUnits } from "ethers";

export const STATUS = ["Borrador", "Activo", "Cancelado"];

// Traduccion de los mensajes de revert de los contratos.
const REVERT_MESSAGES = {
  "Agreement is not active": "El acuerdo todavía no está activo.",
  "Tenant has not accepted yet": "Falta que el inquilino acepte.",
  "Arbiter has not accepted yet": "Falta que el árbitro acepte.",
  "Tenant has not approved the release": "El inquilino no autorizó el cobro de la garantía.",
  "Claim window still open": "Todavía no venció el plazo del propietario (fin de contrato + 7 días).",
  "Claim window closed": "Venció el plazo para que el propietario abra una disputa.",
  "Dispute timeout not reached": "El árbitro todavía está dentro de su plazo (30 días).",
  "Escrow is under dispute": "La garantía está en disputa.",
  "Escrow already released": "La garantía ya fue liberada.",
  "Deposit already made": "La garantía ya fue depositada.",
  "Amount exceeds deposit": "El monto supera la garantía.",
};

export function explainError(error) {
  const raw = error?.reason || error?.shortMessage || error?.info?.error?.message || error?.message || String(error);
  for (const [key, text] of Object.entries(REVERT_MESSAGES)) {
    if (raw.includes(key)) return text;
  }
  if (raw.includes("user rejected")) return "Operación cancelada en la wallet.";
  return raw.replace(/^execution reverted: /, "");
}

export async function loadDeployment() {
  const response = await fetch("/deployment.json", { cache: "no-store" });
  if (!response.ok) throw new Error("missing-deployment");
  return response.json();
}

/*
 * Modo demo: usa las cuentas desbloqueadas del nodo local de Hardhat.
 * No necesita MetaMask; cada rol firma con su propia cuenta.
 */
export function demoProvider(deployment) {
  return new JsonRpcProvider(deployment.rpcUrl, deployment.chainId, { staticNetwork: true, pollingInterval: 500 });
}

export async function metamaskSigner(deployment) {
  if (!window.ethereum) throw new Error("No se encontró MetaMask en este navegador.");
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== deployment.chainId) {
    throw new Error(`MetaMask está en la red ${network.chainId}; cambiá a la red ${deployment.chainId} (Hardhat local).`);
  }
  return provider.getSigner();
}

export function contracts(deployment, runner) {
  const { abis, contracts: addresses } = deployment;
  return {
    token: new Contract(addresses.MockUSDT, abis.MockUSDT, runner),
    factory: new Contract(addresses.RentChainFactory, abis.RentChainFactory, runner),
    agreement: (address) => new Contract(address, abis.RentContract, runner),
    escrow: (address) => new Contract(address, abis.RentEscrow, runner),
  };
}

export async function readAgreement(c, record) {
  const agreement = c.agreement(record.agreement);
  const escrow = c.escrow(record.escrow);

  const [
    status, tenantAccepted, arbiterAccepted, documentHash, startDate, endDate,
    depositAmount, isDeposited, isReleased, isDisputed, tenantApprovedRelease,
    disputeOpenedAt, balance, claimableAt, disputeTimeout,
  ] = await Promise.all([
    agreement.status(), agreement.tenantAccepted(), agreement.arbiterAccepted(),
    agreement.ipfsDocumentHash(), agreement.startDate(), agreement.endDate(),
    escrow.depositAmount(), escrow.isDeposited(), escrow.isReleased(), escrow.isDisputed(),
    escrow.tenantApprovedRelease(), escrow.disputeOpenedAt(), escrow.contractBalance(),
    escrow.claimableAt(), escrow.DISPUTE_TIMEOUT(),
  ]);

  return {
    ...record,
    status: Number(status),
    tenantAccepted, arbiterAccepted, documentHash,
    startDate: Number(startDate), endDate: Number(endDate),
    depositAmount, isDeposited, isReleased, isDisputed, tenantApprovedRelease,
    disputeOpenedAt: Number(disputeOpenedAt), balance,
    claimableAt: Number(claimableAt), disputeTimeout: Number(disputeTimeout),
  };
}

// Historial on-chain del acuerdo: eventos del contrato legal y del escrow.
const EVENT_LABELS = {
  TenantAccepted: "El inquilino aceptó el acuerdo",
  ArbiterAccepted: "El árbitro aceptó participar",
  AgreementActivated: "El propietario activó el acuerdo",
  AgreementCancelled: "El propietario canceló el acuerdo",
  DocumentHashUpdated: "Se actualizó el documento",
  AgreementLinked: "Escrow vinculado al acuerdo",
  Deposited: "El inquilino depositó la garantía",
  ReturnedToTenant: "La garantía volvió al inquilino",
  ReleaseApprovedByTenant: "El inquilino autorizó el cobro",
  Released: "El propietario cobró la garantía",
  DisputeOpened: "Se abrió una disputa",
  ResolvedToLandlord: "El árbitro resolvió a favor del propietario",
  ResolvedToTenant: "El árbitro resolvió a favor del inquilino",
  ResolvedSplit: "El árbitro repartió la garantía",
  DisputeTimedOut: "El inquilino recuperó la garantía por vencimiento del arbitraje",
};

export async function readHistory(c, record, provider) {
  const sources = [c.agreement(record.agreement), c.escrow(record.escrow)];
  const logs = (await Promise.all(sources.map((s) => s.queryFilter("*", 0, "latest")))).flat();
  const blocks = new Map();
  for (const log of logs) {
    if (!blocks.has(log.blockNumber)) blocks.set(log.blockNumber, await provider.getBlock(log.blockNumber));
  }
  return logs
    .filter((log) => log.fragment && EVENT_LABELS[log.fragment.name])
    .map((log) => ({
      key: `${log.transactionHash}-${log.index}`,
      label: EVENT_LABELS[log.fragment.name],
      txHash: log.transactionHash,
      block: log.blockNumber,
      logIndex: log.index,
      timestamp: blocks.get(log.blockNumber)?.timestamp ?? 0,
    }))
    .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const formatAmount = (v) => Number(formatUnits(v ?? 0n, 18)).toLocaleString("es-AR", { maximumFractionDigits: 2 });
export const formatDate = (ts) =>
  ts ? new Date(ts * 1000).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export async function sha256File(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
