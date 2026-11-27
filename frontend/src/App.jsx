import { useCallback, useEffect, useMemo, useState } from "react";
import {
  contracts, demoProvider, explainError, formatAmount, formatDate, loadDeployment,
  metamaskSigner, readAgreement, shortAddress,
} from "./chain.js";
import AgreementDetail, { ROLES, roleIn, stageOf } from "./AgreementDetail.jsx";
import CreateAgreement from "./CreateAgreement.jsx";
import { ConfirmDialog, PendingTx, Toast } from "./ui.jsx";

const DAY = 86400;
const LOCAL_CHAIN_ID = 31337;

export default function App() {
  const [deployment, setDeployment] = useState(null);
  const [setupError, setSetupError] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [mode, setMode] = useState("demo");
  const [role, setRole] = useState("landlord");
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState(0n);
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [chainNow, setChainNow] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pending, setPending] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmRequest, setConfirmRequest] = useState(null);

  const provider = useMemo(() => (deployment?.rpcUrl ? demoProvider(deployment) : null), [deployment]);
  const c = useMemo(() => (deployment && signer ? contracts(deployment, signer) : null), [deployment, signer]);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const isLocalChain = deployment?.chainId === LOCAL_CHAIN_ID;
  const demoAvailable = Boolean(provider && deployment?.demoAccounts?.landlord);

  useEffect(() => {
    loadDeployment().then(setDeployment).catch(() => setSetupError(true));
  }, []);

  // Firmante del modo demo: cuenta local de Hardhat del rol elegido.
  useEffect(() => {
    if (!demoAvailable || mode !== "demo") return;
    const address = deployment.demoAccounts[role];
    provider.getSigner(address).then((s) => {
      setSigner(s);
      setAccount(address);
    });
  }, [deployment, provider, mode, role, demoAvailable]);

  // Sin modo demo (red publica), se arranca directamente con MetaMask.
  useEffect(() => {
    if (deployment && !demoAvailable) setMode("metamask");
  }, [deployment, demoAvailable]);

  const connectMetamask = useCallback(async () => {
    try {
      const s = await metamaskSigner(deployment);
      setSigner(s);
      setAccount(await s.getAddress());
      setMode("metamask");
    } catch (error) {
      setToast({ kind: "error", text: explainError(error) });
    }
  }, [deployment]);

  // Si el usuario cambia de cuenta en MetaMask, la app lo sigue.
  useEffect(() => {
    if (mode !== "metamask" || !window.ethereum?.on) return;
    const onAccounts = () => connectMetamask();
    window.ethereum.on("accountsChanged", onAccounts);
    return () => window.ethereum.removeListener?.("accountsChanged", onAccounts);
  }, [mode, connectMetamask]);

  // Actualizacion en vivo: cada bloque nuevo vuelve a leer el estado on-chain,
  // asi se ven las acciones de las otras partes sin recargar.
  useEffect(() => {
    if (!provider) return;
    let last = -1;
    const onBlock = (n) => {
      if (n !== last) {
        last = n;
        refresh();
      }
    };
    provider.on("block", onBlock);
    return () => { provider.off("block", onBlock); };
  }, [provider, refresh]);

  // Datos del usuario actual.
  useEffect(() => {
    if (!c || !account) return;
    let cancelled = false;
    (async () => {
      const reader = provider ?? signer.provider;
      const [list, bal, block] = await Promise.all([
        c.factory.getAgreementsOf(account),
        c.token.balanceOf(account),
        reader.getBlock("latest"),
      ]);
      if (cancelled) return;
      // El indice de la factory esta en orden de creacion: se invierte para mostrar el mas nuevo primero.
      const mapped = list.map((r) => ({
        agreement: r.agreement, escrow: r.escrow, landlord: r.landlord,
        tenant: r.tenant, arbiter: r.arbiter, createdAt: Number(r.createdAt),
      })).reverse();
      setConnectionError(null);
      setRecords(mapped);
      setBalance(bal);
      setChainNow(block.timestamp);
      setSelected((current) => mapped.find((r) => r.agreement === current?.agreement) || mapped[0] || null);
    })().catch((error) => !cancelled && setConnectionError(explainError(error)));
    return () => { cancelled = true; };
  }, [c, account, provider, signer, refreshKey]);

  /*
   * Ejecuta una o varias transacciones en orden, mostrando en cada paso
   * si se espera la firma en la wallet o la confirmacion del bloque.
   * Solo informa exito cuando el recibo on-chain confirma status = 1.
   */
  const execute = useCallback(async (label, steps) => {
    const hashes = [];
    try {
      for (const [i, step] of steps.entries()) {
        setPending({ label, step: step.label, index: i + 1, total: steps.length, phase: "wallet" });
        const tx = await step.send();
        setPending((p) => ({ ...p, phase: "mining", hash: tx.hash }));
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("La transacción se revirtió on-chain.");
        hashes.push(tx.hash);
      }
      setToast({ kind: "ok", text: `${label}: confirmado on-chain.`, hashes });
      return true;
    } catch (error) {
      const partial = hashes.length ? ` (se confirmaron ${hashes.length} de ${steps.length} pasos)` : "";
      setToast({ kind: "error", text: `${label}: ${explainError(error)}${partial}`, hashes });
      return false;
    } finally {
      setPending(null);
      refresh();
    }
  }, [refresh]);

  const advanceTime = () =>
    setConfirmRequest({
      title: "Adelantar el reloj de la red de prueba",
      body: <p>Solo existe en la blockchain local de Hardhat: suma 30 días al tiempo de los bloques para probar plazos. No tiene equivalente en una red real.</p>,
      confirmLabel: "Adelantar 30 días",
      onConfirm: async () => {
        try {
          await provider.send("evm_increaseTime", [30 * DAY]);
          await provider.send("evm_mine", []);
          setToast({ kind: "ok", text: "Reloj de la red local adelantado 30 días." });
        } catch (error) {
          setToast({ kind: "error", text: explainError(error) });
        }
        refresh();
      },
    });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === "error" ? 9000 : 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (setupError) return <SetupHelp />;
  if (!deployment) return <div className="loading">Conectando con la blockchain…</div>;

  const busy = pending?.label ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⛓</span>
          <div>
            <strong>RentChain</strong>
            <small>Alquileres sin inmobiliaria · garantía en escrow on-chain</small>
          </div>
        </div>
        <div className="wallet">
          <span className="chip">{isLocalChain ? "Red local de prueba" : `Red ${deployment.network}`} · {deployment.chainId}</span>
          {chainNow > 0 && <span className="chip">Fecha on-chain: {formatDate(chainNow)}</span>}
          {account && <span className="chip strong">{shortAddress(account)} · {formatAmount(balance)} mUSDT</span>}
          {mode === "demo" ? (
            <button className="ghost" onClick={connectMetamask}>Usar MetaMask</button>
          ) : demoAvailable ? (
            <button className="ghost" onClick={() => setMode("demo")}>Volver a modo demo</button>
          ) : (
            !account && <button className="ghost" onClick={connectMetamask}>Conectar MetaMask</button>
          )}
        </div>
      </header>

      {mode === "demo" && (
        <nav className="roles">
          <span className="roles-label">Ver la app como:</span>
          {ROLES.map((r) => (
            <button key={r.key} className={role === r.key ? "role active" : "role"} onClick={() => { setRole(r.key); setCreating(false); }}>
              <strong>{r.label}</strong>
              <small>{r.hint}</small>
            </button>
          ))}
          {isLocalChain && (
            <button className="ghost time" onClick={advanceTime} disabled={!!busy} title="Solo en la red local de prueba">
              ⏩ Adelantar 30 días <small>(solo red de prueba)</small>
            </button>
          )}
        </nav>
      )}

      {mode === "demo" && (
        <div className="demo-banner">
          Modo demo: firmás con cuentas de prueba de Hardhat en tu blockchain local. Las transacciones son reales en esa red, con tokens sin valor.
        </div>
      )}

      {connectionError && <div className="error-banner">{connectionError}</div>}

      <main className="layout">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Mis acuerdos</h2>
            <button className="primary small" onClick={() => setCreating(true)} disabled={!c}>+ Nuevo</button>
          </div>
          {records.length === 0 && <p className="muted">Todavía no participás en ningún acuerdo.</p>}
          {records.map((r) => (
            <AgreementCard key={r.agreement} record={r} c={c} account={account} refreshKey={refreshKey}
              active={!creating && selected?.agreement === r.agreement}
              onClick={() => { setSelected(r); setCreating(false); }} />
          ))}
        </aside>

        <section className="content">
          {!c ? (
            <div className="panel">Conectá una wallet para ver tus acuerdos.</div>
          ) : creating ? (
            <CreateAgreement deployment={deployment} account={account} chainNow={chainNow} busy={busy}
              onCancel={() => setCreating(false)}
              onCreate={({ params }) => execute("Crear acuerdo", [{ label: "Crear acuerdo", send: () => c.factory.createAgreement(...params) }])
                .then((ok) => {
                  if (!ok) return;
                  // Al crear, se abre el acuerdo nuevo (es el primero de la lista).
                  setSelected(null);
                  setCreating(false);
                })} />
          ) : selected ? (
            <AgreementDetail record={selected} c={c} provider={provider ?? signer.provider} account={account}
              role={mode === "demo" ? role : null} chainNow={chainNow} chainId={deployment.chainId}
              refreshKey={refreshKey} execute={execute} confirm={setConfirmRequest} busy={busy} />
          ) : (
            <Welcome onCreate={() => setCreating(true)} />
          )}
        </section>
      </main>

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      <PendingTx pending={pending} chainId={deployment.chainId} />
      <Toast toast={toast} chainId={deployment.chainId} />
    </div>
  );
}

function AgreementCard({ record, c, account, active, onClick, refreshKey }) {
  const [data, setData] = useState(null);
  useEffect(() => { readAgreement(c, record).then(setData).catch(() => {}); }, [c, record, refreshKey]);
  const stage = stageOf(data);
  const myRole = ROLES.find((r) => r.key === roleIn(record, account));
  return (
    <button className={active ? "card active" : "card"} onClick={onClick}>
      <div className="card-top">
        <strong>Acuerdo {shortAddress(record.agreement)}</strong>
        <span className={`badge ${stage.tone}`}>{stage.label}</span>
      </div>
      <small className="muted">
        {myRole ? `Tu rol: ${myRole.label}` : ""} · Garantía {data ? formatAmount(data.depositAmount) : "…"} mUSDT
      </small>
    </button>
  );
}

function Welcome({ onCreate }) {
  return (
    <div className="panel welcome">
      <h1>Alquilá sin inmobiliaria, con respaldo legal y la garantía protegida</h1>
      <ol className="steps-intro">
        <li><strong>El propietario</strong> crea el acuerdo: inquilino, árbitro, fechas, garantía y la huella del contrato firmado.</li>
        <li><strong>El inquilino y el árbitro</strong> aceptan. El propietario activa el acuerdo.</li>
        <li><strong>El inquilino</strong> deposita la garantía en un escrow: nadie puede tocarla sola.</li>
        <li>Al terminar, el propietario la devuelve. Si hay conflicto, <strong>el árbitro</strong> decide.</li>
      </ol>
      <button className="primary" onClick={onCreate}>Crear el primer acuerdo</button>
    </div>
  );
}

function SetupHelp() {
  return (
    <div className="setup panel">
      <h1>Falta levantar la blockchain local</h1>
      <p>El frontend lee las direcciones de <code>public/deployment.json</code>, que genera el script de deploy.</p>
      <pre>{`cd blockchain
npx hardhat node                      # terminal 1
npm run deploy:local                  # terminal 2
cd ../frontend && npm run dev         # terminal 3`}</pre>
      <p className="muted">Después recargá esta página.</p>
    </div>
  );
}
