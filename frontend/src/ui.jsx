import { useState } from "react";
import { explorerTxUrl, shortAddress } from "./chain.js";

export function Fact({ label, value, mono, children }) {
  return (
    <div className="fact">
      <small>{label}</small>
      <span className={mono ? "mono" : ""}>{children ?? value}</span>
    </div>
  );
}

/*
 * Hash de transaccion: enlace al explorador si la red tiene uno,
 * o boton para copiar en la red local.
 */
export function TxHash({ hash, chainId }) {
  const [copied, setCopied] = useState(false);
  if (!hash) return null;
  const url = explorerTxUrl(chainId, hash);
  if (url) {
    return (
      <a className="mono txlink" href={url} target="_blank" rel="noreferrer">
        {shortAddress(hash)} ↗
      </a>
    );
  }
  const copy = async () => {
    await navigator.clipboard?.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" className="mono txlink copy" onClick={copy} title={`${hash}\n(red local: sin explorador público)`}>
      {copied ? "copiado ✓" : `${shortAddress(hash)} ⧉`}
    </button>
  );
}

/*
 * Confirmacion previa para acciones que mueven fondos o son irreversibles.
 */
export function ConfirmDialog({ request, onClose }) {
  if (!request) return null;
  const { title, body, confirmLabel, tone, onConfirm } = request;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="dialog">
        <h2 id="confirm-title">{title}</h2>
        <div className="dialog-body">{body}</div>
        <div className="actions">
          <button className="ghost" onClick={onClose}>Volver</button>
          <button
            className={tone === "danger" ? "danger solid" : "primary"}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/*
 * Estado de la transaccion en curso: firma en la wallet o esperando bloque.
 */
export function PendingTx({ pending, chainId }) {
  if (!pending) return null;
  const step = pending.total > 1 ? ` (paso ${pending.index} de ${pending.total})` : "";
  return (
    <div className="busy" role="status">
      <strong>{pending.label}{step}</strong>
      <span>
        {pending.phase === "wallet"
          ? `✍️ ${pending.step}: confirmá en tu wallet…`
          : <>⏳ {pending.step}: esperando confirmación on-chain · <TxHash hash={pending.hash} chainId={chainId} /></>}
      </span>
    </div>
  );
}

export function Toast({ toast, chainId }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} role="alert">
      <span>{toast.text}</span>
      {toast.hashes?.length > 0 && (
        <span className="toast-hashes">
          tx: {toast.hashes.map((h) => <TxHash key={h} hash={h} chainId={chainId} />)}
        </span>
      )}
    </div>
  );
}
