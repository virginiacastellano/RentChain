import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "ethers";
import { STATUS, formatAmount, formatDate, readAgreement, readHistory, sha256File, shortAddress } from "./chain.js";
import { Fact, TxHash } from "./ui.jsx";

const AMOUNT_RE = /^\d+(\.\d{1,18})?$/;

export const ROLES = [
  { key: "landlord", label: "Propietario", hint: "Crea el acuerdo y lo activa" },
  { key: "tenant", label: "Inquilino", hint: "Acepta y deposita la garantía" },
  { key: "arbiter", label: "Árbitro / escribano", hint: "Valida y resuelve disputas" },
];

export function roleIn(record, account) {
  if (!account) return null;
  const a = account.toLowerCase();
  if (record.landlord.toLowerCase() === a) return "landlord";
  if (record.tenant.toLowerCase() === a) return "tenant";
  if (record.arbiter.toLowerCase() === a) return "arbiter";
  return null;
}

export function stageOf(d) {
  if (!d) return { label: "…", tone: "muted" };
  if (d.status === 2) return { label: "Cancelado", tone: "muted" };
  if (d.isReleased) return { label: "Cerrado", tone: "done" };
  if (d.isDisputed) return { label: "En disputa", tone: "danger" };
  if (d.isDeposited) return { label: "Garantía en escrow", tone: "ok" };
  if (d.status === 1) return { label: "Activo · falta garantía", tone: "warn" };
  return { label: "Borrador · esperando aceptaciones", tone: "warn" };
}

// Explica en que punto esta el acuerdo y que se espera de cada parte.
function statusHint(d, me, chainNow) {
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
  const windowClosed = chainNow >= d.claimableAt;
  if (me === "tenant") {
    if (windowClosed) return "Venció el plazo del propietario sin devolución ni disputa: ya podés recuperar tu garantía.";
    return `Tu garantía está protegida en el escrow. Al terminar el alquiler el propietario la devuelve; si no responde, podés recuperarla desde el ${formatDate(d.claimableAt)}.`;
  }
  if (me === "landlord") {
    if (windowClosed) return `Tu plazo para abrir una disputa venció el ${formatDate(d.claimableAt)}. El inquilino ya puede recuperar la garantía; todavía podés devolverla vos.`;
    return `La garantía está en el escrow. Al terminar el alquiler devolvela, o abrí una disputa antes del ${formatDate(d.claimableAt)} si hay daños o deudas.`;
  }
  return "Sin disputas abiertas. Vas a poder resolver si alguna de las partes abre una.";
}

export default function AgreementDetail({ record, c, provider, account, role, chainNow, chainId, refreshKey, execute, confirm, busy }) {
  const [d, setD] = useState(null);
  const [history, setHistory] = useState([]);
  const [split, setSplit] = useState("");
  const [verify, setVerify] = useState(null);

  useEffect(() => {
    let cancelled = false;
    readAgreement(c, record).then((data) => !cancelled && setD(data)).catch(() => {});
    readHistory(c, record, provider).then((h) => !cancelled && setHistory(h)).catch(() => setHistory([]));
    return () => { cancelled = true; };
  }, [c, record, provider, refreshKey]);

  useEffect(() => setVerify(null), [record.agreement]);

  if (!d) return <div className="panel">Leyendo el acuerdo desde la blockchain…</div>;

  const me = roleIn(record, account);
  const agreement = c.agreement(record.agreement);
  const escrow = c.escrow(record.escrow);
  const stage = stageOf(d);
  const funded = d.isDeposited && !d.isReleased;
  const amount = `${formatAmount(d.depositAmount)} mUSDT`;

  // Accion de una sola transaccion, con o sin confirmacion previa.
  const single = (label, send, confirmation) => () => {
    const run = () => execute(label, [{ label, send }]);
    if (!confirmation) return run();
    confirm({ ...confirmation, onConfirm: run });
  };

  const deposit = async () => {
    const [balance, allowance] = await Promise.all([
      c.token.balanceOf(account),
      c.token.allowance(account, record.escrow),
    ]);
    if (balance < d.depositAmount) {
      confirm({
        title: "Saldo insuficiente",
        body: <p>Necesitás {amount} y tenés {formatAmount(balance)} mUSDT. No se envió ninguna transacción.</p>,
        confirmLabel: "Entendido",
        onConfirm: () => {},
      });
      return;
    }
    const steps = [];
    if (allowance < d.depositAmount) {
      steps.push({ label: "Autorizar mUSDT", send: () => c.token.approve(record.escrow, d.depositAmount) });
    }
    steps.push({ label: "Depositar garantía", send: () => escrow.deposit() });
    confirm({
      title: "Depositar la garantía",
      body: (
        <>
          <p>Se van a transferir <strong>{amount}</strong> de tu wallet al escrow del acuerdo.</p>
          <p className="muted">
            {steps.length === 2
              ? "Vas a firmar 2 transacciones: primero la autorización del token y después el depósito."
              : "Ya autorizaste el token: vas a firmar 1 transacción."}{" "}
            La garantía solo sale del escrow según las reglas del contrato.
          </p>
        </>
      ),
      confirmLabel: "Depositar",
      onConfirm: () => execute("Depositar garantía", steps),
    });
  };

  const replaceDocument = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const hash = `sha256:${await sha256File(file)}`;
    confirm({
      title: "Reemplazar el documento",
      body: (
        <>
          <p>Nueva huella de <strong>{file.name}</strong>:</p>
          <code className="hash">{hash}</code>
          <p className="muted">Las aceptaciones del inquilino y del árbitro se reinician: tienen que volver a aceptar el documento nuevo.</p>
        </>
      ),
      confirmLabel: "Registrar documento",
      onConfirm: () => execute("Reemplazar documento", [{ label: "Reemplazar documento", send: () => agreement.updateDocumentHash(hash) }]),
    });
  };

  const verifyDocument = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const hash = `sha256:${await sha256File(file)}`;
    setVerify({ name: file.name, hash, ok: hash === d.documentHash });
  };

  const actions = [];
  if (me === "tenant") {
    if (d.status === 0 && !d.tenantAccepted) actions.push({ label: "Aceptar el acuerdo", kind: "primary", onClick: single("Aceptar acuerdo", () => agreement.acceptAsTenant()) });
    if (d.status === 1 && !d.isDeposited) actions.push({ label: `Depositar garantía (${amount})`, kind: "primary", onClick: deposit });
    if (funded && !d.isDisputed && !d.tenantApprovedRelease) actions.push({
      label: "Autorizar que el propietario cobre la garantía", kind: "ghost",
      onClick: single("Autorizar cobro", () => escrow.approveReleaseToLandlord(), {
        title: "Autorizar el cobro de la garantía",
        body: <p>El propietario va a poder cobrar los <strong>{amount}</strong> completos. Esta autorización <strong>no se puede revocar</strong>.</p>,
        confirmLabel: "Autorizar", tone: "danger",
      }),
    });
    if (funded && !d.isDisputed) actions.push({
      label: "Abrir disputa", kind: "danger",
      onClick: single("Abrir disputa", () => escrow.openDispute(), {
        title: "Abrir una disputa",
        body: <p>La garantía queda congelada hasta que el árbitro decida (plazo: 30 días). Si no resuelve a tiempo, vuelve a vos.</p>,
        confirmLabel: "Abrir disputa", tone: "danger",
      }),
    });
    if (funded && !d.isDisputed && chainNow >= d.claimableAt) actions.push({
      label: "Recuperar garantía (el propietario no respondió)", kind: "primary",
      onClick: single("Recuperar garantía", () => escrow.claimAfterEnd(), {
        title: "Recuperar la garantía", body: <p>Venció el plazo del propietario. Vas a recibir <strong>{amount}</strong>.</p>, confirmLabel: "Recuperar",
      }),
    });
    if (funded && d.isDisputed && chainNow >= d.disputeOpenedAt + d.disputeTimeout) actions.push({
      label: "Recuperar garantía (el árbitro no resolvió)", kind: "primary",
      onClick: single("Recuperar garantía", () => escrow.claimAfterDisputeTimeout(), {
        title: "Recuperar la garantía", body: <p>El árbitro no resolvió en 30 días. Vas a recibir <strong>{amount}</strong>.</p>, confirmLabel: "Recuperar",
      }),
    });
  }
  if (me === "arbiter" && d.status === 0 && !d.arbiterAccepted) {
    actions.push({ label: "Aceptar como árbitro", kind: "primary", onClick: single("Aceptar como árbitro", () => agreement.acceptAsArbiter()) });
  }
  if (me === "landlord") {
    if (d.status === 0) {
      actions.push({
        label: "Activar acuerdo", kind: "primary",
        disabledReason: !(d.tenantAccepted && d.arbiterAccepted) && "Falta que acepten el inquilino y el árbitro",
        onClick: single("Activar acuerdo", () => agreement.activateAgreement(), {
          title: "Activar el acuerdo", body: <p>Una vez activo, el acuerdo ya no se puede cancelar ni cambiar el documento. El inquilino va a poder depositar la garantía.</p>, confirmLabel: "Activar",
        }),
      });
      actions.push({
        label: "Cancelar borrador", kind: "ghost",
        onClick: single("Cancelar acuerdo", () => agreement.cancelAgreement(), {
          title: "Cancelar el acuerdo", body: <p>El acuerdo queda cancelado de forma definitiva.</p>, confirmLabel: "Cancelar acuerdo", tone: "danger",
        }),
      });
    }
    if (funded && !d.isDisputed) actions.push({
      label: "Devolver garantía al inquilino", kind: "primary",
      onClick: single("Devolver garantía", () => escrow.returnToTenant(), {
        title: "Devolver la garantía", body: <p>Se transfieren <strong>{amount}</strong> al inquilino y el acuerdo queda cerrado.</p>, confirmLabel: "Devolver",
      }),
    });
    if (funded && !d.isDisputed && d.tenantApprovedRelease) actions.push({
      label: "Cobrar garantía (autorizado)", kind: "primary",
      onClick: single("Cobrar garantía", () => escrow.releaseToLandlord(), {
        title: "Cobrar la garantía", body: <p>El inquilino autorizó el cobro. Vas a recibir <strong>{amount}</strong>.</p>, confirmLabel: "Cobrar",
      }),
    });
    if (funded && !d.isDisputed && chainNow < d.claimableAt) actions.push({
      label: "Abrir disputa (daños / deuda)", kind: "danger",
      onClick: single("Abrir disputa", () => escrow.openDispute(), {
        title: "Abrir una disputa", body: <p>La garantía queda congelada hasta que el árbitro decida cómo se reparte.</p>, confirmLabel: "Abrir disputa", tone: "danger",
      }),
    });
  }

  // Reparto del arbitro.
  const splitValid = AMOUNT_RE.test(split) && parseUnits(split, 18) <= d.depositAmount;
  const toLandlord = splitValid ? parseUnits(split, 18) : 0n;
  const resolve = (label, send, landlordAmount) =>
    confirm({
      title: label,
      body: (
        <p>
          Propietario recibe <strong>{formatAmount(landlordAmount)} mUSDT</strong> · inquilino recibe{" "}
          <strong>{formatAmount(d.depositAmount - landlordAmount)} mUSDT</strong>. La decisión es definitiva.
        </p>
      ),
      confirmLabel: "Confirmar resolución",
      onConfirm: () => execute(label, [{ label, send }]),
    });

  const steps = [
    ["Acuerdo creado", true],
    ["Inquilino aceptó", d.tenantAccepted || d.status === 1],
    ["Árbitro aceptó", d.arbiterAccepted || d.status === 1],
    ["Acuerdo activo", d.status === 1],
    ["Garantía en escrow", d.isDeposited],
    [d.isDisputed ? "En disputa" : "Cerrado", d.isReleased || d.isDisputed],
  ];

  const arbiterLabel = me === "arbiter" ? `Vos (${shortAddress(record.arbiter)})` : "Escribano verificado · identidad reservada";

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
            <small>Saldo real del escrow</small>
            <strong>{formatAmount(d.balance)} <span>/ {amount}</span></strong>
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
          <Fact label="Reclamo sin disputa desde" value={formatDate(d.claimableAt)} />
          <Fact label="Cobro autorizado por el inquilino" value={d.tenantApprovedRelease ? "Sí" : "No"} />
          <Fact label="Contrato del acuerdo" value={record.agreement} mono />
          <Fact label="Escrow" value={record.escrow} mono />
        </div>
      </div>

      <div className="panel">
        <h2>Documento firmado</h2>
        <p className="muted small">Huella SHA-256 registrada on-chain:</p>
        <code className="hash">{d.documentHash}</code>
        <div className="doc-actions">
          <label className="file-button ghost">
            Verificar mi copia del PDF
            <input type="file" accept=".pdf,application/pdf" onChange={verifyDocument} />
          </label>
          {me === "landlord" && d.status === 0 && (
            <label className="file-button ghost">
              Reemplazar documento
              <input type="file" accept=".pdf,application/pdf" onChange={replaceDocument} disabled={!!busy} />
            </label>
          )}
        </div>
        {verify && (
          <p className={verify.ok ? "verify ok" : "verify bad"}>
            {verify.ok
              ? `✓ ${verify.name} coincide con el documento registrado.`
              : `✗ ${verify.name} NO coincide con el documento registrado (huella ${verify.hash.slice(0, 22)}…).`}
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Qué podés hacer {role ? `como ${ROLES.find((r) => r.key === role)?.label.toLowerCase()}` : ""}</h2>
        <p className="hint">{me ? statusHint(d, me, chainNow) : "Tu wallet no participa en este acuerdo."}</p>
        <div className="action-list">
          {actions.map((a) => (
            <div key={a.label} className="action">
              <button className={a.kind} disabled={!!busy || !!a.disabledReason} onClick={a.onClick}>{a.label}</button>
              {a.disabledReason && <small className="muted">{a.disabledReason}</small>}
            </div>
          ))}
        </div>

        {me === "arbiter" && d.isDisputed && !d.isReleased && (
          <div className="resolve">
            <h3>Resolver la disputa</h3>
            <p className="muted">Revisá la evidencia de las partes y decidí cómo se libera la garantía de {amount}.</p>
            <div className="action-list">
              <button className="primary" disabled={!!busy} onClick={() => resolve("Resolver a favor del propietario", () => escrow.resolveToLandlord(), d.depositAmount)}>Todo al propietario</button>
              <button className="primary" disabled={!!busy} onClick={() => resolve("Resolver a favor del inquilino", () => escrow.resolveToTenant(), 0n)}>Todo al inquilino</button>
            </div>
            <div className="split">
              <input inputMode="decimal" placeholder="mUSDT para el propietario" value={split} onChange={(e) => setSplit(e.target.value)} />
              <button className="ghost" disabled={!!busy || !splitValid} onClick={() => resolve("Repartir garantía", () => escrow.resolveSplit(toLandlord), toLandlord)}>Repartir</button>
            </div>
            {split !== "" && !splitValid && <small className="error">Ingresá un monto entre 0 y {formatUnits(d.depositAmount, 18).replace(/\.0$/, "")} (sin separador de miles).</small>}
            {splitValid && <small className="muted">Propietario {formatAmount(toLandlord)} · inquilino {formatAmount(d.depositAmount - toLandlord)} mUSDT</small>}
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
              <small className="muted">
                {formatDate(h.timestamp)} · bloque {h.block} · tx <TxHash hash={h.txHash} chainId={chainId} />
              </small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
