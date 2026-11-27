import { useCallback, useEffect, useMemo, useState } from "react";
import { parseUnits } from "ethers";
import {
  STATUS, contracts, demoProvider, explainError, formatAmount, formatDate, loadDeployment,
  metamaskSigner, readAgreement, readHistory, sha256File, shortAddress,
} from "./chain.js";

const ROLES = [
  { key: "landlord", label: "Propietario", hint: "Crea el acuerdo y lo activa" },
  { key: "tenant", label: "Inquilino", hint: "Acepta y deposita la garantía" },
  { key: "arbiter", label: "Árbitro / escribano", hint: "Valida y resuelve disputas" },
];

const DAY = 86400;

export default function App() {
  const [deployment, setDeployment] = useState(null);
  const [setupError, setSetupError] = useState(null);
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
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const provider = useMemo(() => (deployment ? demoProvider(deployment) : null), [deployment]);
  const c = useMemo(() => (deployment && signer ? contracts(deployment, signer) : null), [deployment, signer]);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    loadDeployment().then(setDeployment).catch(() => setSetupError(true));
  }, []);

  // Firmante: cuenta demo del rol elegido o MetaMask.
  useEffect(() => {
    if (!deployment || !provider || mode !== "demo") return;
    const address = deployment.demoAccounts?.[role];
    if (!address) return;
    provider.getSigner(address).then((s) => {
      setSigner(s);
      setAccount(address);
    });
  }, [deployment, provider, mode, role]);

  const connectMetamask = async () => {
    try {
      const s = await metamaskSigner(deployment);
      setSigner(s);
      setAccount(await s.getAddress());
      setMode("metamask");
    } catch (error) {
      setToast({ kind: "error", text: explainError(error) });
    }
  };

  // Datos del usuario actual.
  useEffect(() => {
    if (!c || !account) return;
    let cancelled = false;
    (async () => {
      const [list, bal, block] = await Promise.all([
        c.factory.getAgreementsOf(account),
        c.token.balanceOf(account),
        provider.getBlock("latest"),
      ]);
      if (cancelled) return;
      const mapped = list.map((r, i) => ({
        id: i, agreement: r.agreement, escrow: r.escrow, landlord: r.landlord,
        tenant: r.tenant, arbiter: r.arbiter, createdAt: Number(r.createdAt),
      })).reverse();
      setRecords(mapped);
      setBalance(bal);
      setChainNow(block.timestamp);
      setSelected((current) => mapped.find((r) => r.agreement === current?.agreement) || mapped[0] || null);
    })().catch((error) => setToast({ kind: "error", text: explainError(error) }));
    return () => { cancelled = true; };
  }, [c, account, provider, refreshKey]);

  const run = useCallback(async (label, action) => {
    setBusy(label);
    try {
      await action();
      setToast({ kind: "ok", text: `${label}: confirmado en blockchain` });
      refresh();
    } catch (error) {
      setToast({ kind: "error", text: explainError(error) });
    } finally {
      setBusy(null);
    }
  }, []);

  const advanceTime = () =>
    run("Adelantar 30 días", async () => {
      await provider.send("evm_increaseTime", [30 * DAY]);
      await provider.send("evm_mine", []);
    });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (setupError) return <SetupHelp />;
  if (!deployment) return <div className="loading">Conectando con la blockchain…</div>;

  const currentRole = mode === "demo" ? role : null;

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
          <span className="chip">Red {deployment.network} · {deployment.chainId}</span>
          <span className="chip">Fecha on-chain: {formatDate(chainNow)}</span>
          {account && <span className="chip strong">{shortAddress(account)} · {formatAmount(balance)} mUSDT</span>}
          {mode === "demo" ? (
            <button className="ghost" onClick={connectMetamask}>Usar MetaMask</button>
          ) : (
            <button className="ghost" onClick={() => setMode("demo")}>Volver a modo demo</button>
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
          <button className="ghost time" onClick={advanceTime} disabled={!!busy} title="Solo en la red local: simula el paso del tiempo">
            ⏩ Adelantar 30 días
          </button>
        </nav>
      )}

      <main className="layout">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Mis acuerdos</h2>
            <button className="primary small" onClick={() => setCreating(true)}>+ Nuevo</button>
          </div>
          {records.length === 0 && <p className="muted">Todavía no participás en ningún acuerdo.</p>}
          {records.map((r) => (
            <AgreementCard key={r.agreement} record={r} c={c} account={account} refreshKey={refreshKey}
              active={!creating && selected?.agreement === r.agreement}
              onClick={() => { setSelected(r); setCreating(false); }} />
          ))}
        </aside>

        <section className="content">
          {creating ? (
            <CreateAgreement deployment={deployment} c={c} account={account} chainNow={chainNow} busy={busy}
              onCancel={() => setCreating(false)}
              onCreate={(params) => run("Crear acuerdo", async () => {
                const tx = await c.factory.createAgreement(...params);
                await tx.wait();
                setCreating(false);
              })} />
          ) : selected ? (
            <AgreementDetail record={selected} c={c} provider={provider} account={account} role={currentRole}
              chainNow={chainNow} refreshKey={refreshKey} run={run} busy={busy} />
          ) : (
            <Welcome onCreate={() => setCreating(true)} />
          )}
        </section>
      </main>

      {busy && <div className="busy">⏳ {busy}…</div>}
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}

function roleIn(record, account) {
  if (!account) return null;
  const a = account.toLowerCase();
  if (record.landlord.toLowerCase() === a) return "landlord";
  if (record.tenant.toLowerCase() === a) return "tenant";
  if (record.arbiter.toLowerCase() === a) return "arbiter";
  return null;
}

function stageOf(d) {
  if (!d) return { label: "…", tone: "muted" };
  if (d.status === 2) return { label: "Cancelado", tone: "muted" };
  if (d.isReleased) return { label: "Cerrado", tone: "done" };
  if (d.isDisputed) return { label: "En disputa", tone: "danger" };
  if (d.isDeposited) return { label: "Garantía en escrow", tone: "ok" };
  if (d.status === 1) return { label: "Activo · falta garantía", tone: "warn" };
  return { label: "Borrador · esperando aceptaciones", tone: "warn" };
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

function CreateAgreement({ deployment, c, account, chainNow, busy, onCancel, onCreate }) {
  const today = chainNow || Math.floor(Date.now() / 1000);
  const toInput = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    tenant: deployment.demoAccounts?.tenant || "",
    arbiter: deployment.demoAccounts?.arbiter || "",
    deposit: "1500",
    start: toInput(today + DAY),
    end: toInput(today + 365 * DAY),
    documentName: "",
    documentHash: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const hash = await sha256File(file);
    setForm((f) => ({ ...f, documentName: file.name, documentHash: `sha256:${hash}` }));
  };

  const submit = (e) => {
    e.preventDefault();
    // Mediodia local: evita que la zona horaria corra la fecha un dia.
    const start = Math.floor(new Date(`${form.start}T12:00:00`).getTime() / 1000);
    const end = Math.floor(new Date(`${form.end}T12:00:00`).getTime() / 1000);
    onCreate([
      deployment.contracts.MockUSDT, form.tenant, form.arbiter, parseUnits(form.deposit, 18),
      form.documentHash || "sha256:documento-de-ejemplo", start, end,
    ]);
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <h1>Nuevo acuerdo de alquiler</h1>
      <p className="muted">Vas a quedar como <strong>propietario</strong> ({shortAddress(account)}). Se despliegan el contrato del acuerdo y el escrow de la garantía en una sola transacción.</p>

      <label>Wallet del inquilino<input value={form.tenant} onChange={set("tenant")} required /></label>
      <label>Wallet del árbitro / escribano verificado<input value={form.arbiter} onChange={set("arbiter")} required /></label>
      <div className="row">
        <label>Garantía (mUSDT)<input type="number" min="1" step="any" value={form.deposit} onChange={set("deposit")} required /></label>
        <label>Inicio<input type="date" value={form.start} onChange={set("start")} required /></label>
        <label>Fin<input type="date" value={form.end} onChange={set("end")} required /></label>
      </div>
      <label>
        Contrato firmado (PDF)
        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg" onChange={onFile} />
        <small className="muted">
          {form.documentHash
            ? `Huella registrada: ${form.documentHash.slice(0, 26)}… (${form.documentName})`
            : "Se calcula la huella SHA-256 en tu navegador; el archivo no se sube. (Subida a IPFS: próxima versión.)"}
        </small>
      </label>
      <div className="actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        <button className="primary" disabled={!!busy}>Crear acuerdo</button>
      </div>
    </form>
  );
}

function AgreementDetail({ record, c, provider, account, role, chainNow, refreshKey, run, busy }) {
  const [d, setD] = useState(null);
  const [history, setHistory] = useState([]);
  const [split, setSplit] = useState("");

  useEffect(() => {
    let cancelled = false;
    readAgreement(c, record).then((data) => !cancelled && setD(data));
    readHistory(c, record, provider).then((h) => !cancelled && setHistory(h)).catch(() => setHistory([]));
    return () => { cancelled = true; };
  }, [c, record, provider, refreshKey]);

  if (!d) return <div className="panel">Cargando acuerdo…</div>;

  const me = roleIn(record, account);
  const agreement = c.agreement(record.agreement);
  const escrow = c.escrow(record.escrow);
  const stage = stageOf(d);
  const open = d.isDeposited && !d.isReleased;
  const tx = (label, fn) => run(label, async () => (await fn()).wait());

  const actions = [];
  if (me === "tenant") {
    if (d.status === 0 && !d.tenantAccepted) actions.push(["Aceptar el acuerdo", () => tx("Aceptar acuerdo", () => agreement.acceptAsTenant()), "primary"]);
    if (d.status === 1 && !d.isDeposited) actions.push([`Depositar garantía (${formatAmount(d.depositAmount)} mUSDT)`, () => run("Depositar garantía", async () => {
      const allowance = await c.token.allowance(account, record.escrow);
      if (allowance < d.depositAmount) await (await c.token.approve(record.escrow, d.depositAmount)).wait();
      await (await escrow.deposit()).wait();
    }), "primary"]);
    if (open && !d.isDisputed && !d.tenantApprovedRelease) actions.push(["Autorizar que el propietario cobre la garantía", () => tx("Autorizar cobro", () => escrow.approveReleaseToLandlord()), "ghost"]);
    if (open && !d.isDisputed) actions.push(["Abrir disputa", () => tx("Abrir disputa", () => escrow.openDispute()), "danger"]);
    if (open && !d.isDisputed && chainNow >= d.claimableAt) actions.push(["Recuperar garantía (el propietario no respondió)", () => tx("Recuperar garantía", () => escrow.claimAfterEnd()), "primary"]);
    if (open && d.isDisputed && chainNow >= d.disputeOpenedAt + d.disputeTimeout) actions.push(["Recuperar garantía (el árbitro no resolvió)", () => tx("Recuperar garantía", () => escrow.claimAfterDisputeTimeout()), "primary"]);
  }
  if (me === "arbiter") {
    if (d.status === 0 && !d.arbiterAccepted) actions.push(["Aceptar como árbitro", () => tx("Aceptar como árbitro", () => agreement.acceptAsArbiter()), "primary"]);
  }
  if (me === "landlord") {
    if (d.status === 0) actions.push(["Activar acuerdo", () => tx("Activar acuerdo", () => agreement.activateAgreement()), "primary", !(d.tenantAccepted && d.arbiterAccepted) && "Falta que acepten el inquilino y el árbitro"]);
    if (d.status === 0) actions.push(["Cancelar borrador", () => tx("Cancelar acuerdo", () => agreement.cancelAgreement()), "ghost"]);
    if (open && !d.isDisputed) actions.push(["Devolver garantía al inquilino", () => tx("Devolver garantía", () => escrow.returnToTenant()), "primary"]);
    if (open && !d.isDisputed && d.tenantApprovedRelease) actions.push(["Cobrar garantía (autorizado)", () => tx("Cobrar garantía", () => escrow.releaseToLandlord()), "primary"]);
    if (open && !d.isDisputed && chainNow < d.claimableAt) actions.push(["Abrir disputa (daños / deuda)", () => tx("Abrir disputa", () => escrow.openDispute()), "danger"]);
  }

  const steps = [
    ["Acuerdo creado", true],
    ["Inquilino aceptó", d.tenantAccepted || d.status === 1],
    ["Árbitro aceptó", d.arbiterAccepted || d.status === 1],
    ["Acuerdo activo", d.status === 1],
    ["Garantía en escrow", d.isDeposited],
    [d.isDisputed ? "En disputa" : "Cerrado", d.isReleased || d.isDisputed],
  ];

  const arbiterLabel = me === "arbiter"
    ? `Vos (${shortAddress(record.arbiter)})`
    : "Escribano verificado · identidad reservada";

  return (
    <div className="detail">
      <div className="panel">
        <div className="detail-head">
          <div>
            <h1>Acuerdo {shortAddress(record.agreement)}</h1>
            <span className={`badge ${stage.tone}`}>{stage.label}</span>
            <span className="badge muted">Contrato: {STATUS[d.status]}</span>
          </div>
          <div className="amount">
            <small>Garantía en escrow</small>
            <strong>{formatAmount(d.balance)} <span>/ {formatAmount(d.depositAmount)} mUSDT</span></strong>
          </div>
        </div>

        <ol className="timeline">
          {steps.map(([label, done]) => <li key={label} className={done ? "done" : ""}>{label}</li>)}
        </ol>

        <div className="facts">
          <Fact label="Propietario" value={me === "landlord" ? `Vos (${shortAddress(record.landlord)})` : shortAddress(record.landlord)} />
          <Fact label="Inquilino" value={me === "tenant" ? `Vos (${shortAddress(record.tenant)})` : shortAddress(record.tenant)} />
          <Fact label="Árbitro" value={arbiterLabel} />
          <Fact label="Vigencia" value={`${formatDate(d.startDate)} → ${formatDate(d.endDate)}`} />
          <Fact label="Documento" value={d.documentHash.length > 30 ? `${d.documentHash.slice(0, 30)}…` : d.documentHash} />
          <Fact label="Reclamo sin disputa desde" value={formatDate(d.claimableAt)} />
          <Fact label="Contrato del acuerdo" value={shortAddress(record.agreement)} mono />
          <Fact label="Escrow" value={shortAddress(record.escrow)} mono />
        </div>
      </div>

      <div className="panel">
        <h2>Qué podés hacer {role ? `como ${ROLES.find((r) => r.key === role)?.label.toLowerCase()}` : ""}</h2>
        <p className="hint">{statusHint(d, me)}</p>
        <div className="action-list">
          {actions.map(([label, fn, kind, disabledReason]) => (
            <div key={label} className="action">
              <button className={kind} disabled={!!busy || !!disabledReason} onClick={fn}>{label}</button>
              {disabledReason && <small className="muted">{disabledReason}</small>}
            </div>
          ))}
        </div>

        {me === "arbiter" && d.isDisputed && !d.isReleased && (
          <div className="resolve">
            <h3>Resolver la disputa</h3>
            <p className="muted">Revisá la evidencia de las partes y decidí cómo se libera la garantía.</p>
            <div className="action-list">
              <button className="primary" disabled={!!busy} onClick={() => tx("Resolver a favor del propietario", () => escrow.resolveToLandlord())}>Todo al propietario</button>
              <button className="primary" disabled={!!busy} onClick={() => tx("Resolver a favor del inquilino", () => escrow.resolveToTenant())}>Todo al inquilino</button>
            </div>
            <div className="split">
              <input type="number" min="0" step="any" placeholder="mUSDT para el propietario" value={split} onChange={(e) => setSplit(e.target.value)} />
              <button className="ghost" disabled={!!busy || split === ""} onClick={() => tx("Repartir garantía", () => escrow.resolveSplit(parseUnits(split, 18)))}>Repartir</button>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Historial on-chain</h2>
        {history.length === 0 && <p className="muted">Sin eventos todavía.</p>}
        <ul className="history">
          {history.map((h) => (
            <li key={h.key}>
              <span>{h.label}</span>
              <small className="muted">{formatDate(h.timestamp)} · bloque {h.block} · tx {shortAddress(h.txHash)}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Explica en que punto esta el acuerdo y que se espera de cada parte.
function statusHint(d, me) {
  if (d.status === 2) return "El propietario canceló este acuerdo antes de activarlo.";
  if (d.isReleased) return "Acuerdo cerrado: la garantía ya fue liberada. El detalle queda en el historial on-chain.";
  if (d.status === 0) {
    const missing = [!d.tenantAccepted && "el inquilino", !d.arbiterAccepted && "el árbitro"].filter(Boolean);
    if (missing.length) return `Borrador: falta que acepte ${missing.join(" y ")}. Después el propietario lo activa.`;
    return "Inquilino y árbitro aceptaron: el propietario ya puede activar el acuerdo.";
  }
  if (!d.isDeposited) return "Acuerdo activo: falta que el inquilino deposite la garantía en el escrow.";
  if (d.isDisputed) {
    const deadline = formatDate(d.disputeOpenedAt + d.disputeTimeout);
    if (me === "arbiter") return `Hay una disputa abierta. Tenés tiempo hasta el ${deadline} para resolverla; si no, la garantía vuelve al inquilino.`;
    return `La garantía está congelada mientras el árbitro resuelve la disputa (plazo: ${deadline}).`;
  }
  if (me === "tenant") return `Tu garantía está protegida en el escrow. Al terminar el alquiler el propietario la devuelve; si no responde, podés recuperarla desde el ${formatDate(d.claimableAt)}.`;
  if (me === "landlord") return `La garantía está en el escrow. Al terminar el alquiler devolvela, o abrí una disputa antes del ${formatDate(d.claimableAt)} si hay daños o deudas.`;
  return "Sin disputas abiertas. Vas a poder resolver si alguna de las partes abre una.";
}

function Fact({ label, value, mono }) {
  return (
    <div className="fact">
      <small>{label}</small>
      <span className={mono ? "mono" : ""}>{value}</span>
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
