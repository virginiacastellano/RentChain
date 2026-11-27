import { useMemo, useState } from "react";
import { getAddress, isAddress, parseUnits } from "ethers";
import { sha256File, shortAddress } from "./chain.js";

const DAY = 86400;
const AMOUNT_RE = /^\d+(\.\d{1,18})?$/;

const toInput = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
// Mediodia local: evita que la zona horaria corra la fecha un dia.
const toTimestamp = (value) => Math.floor(new Date(`${value}T12:00:00`).getTime() / 1000);
const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();

/*
 * Valida el formulario con las mismas reglas que exigen los contratos,
 * mas dos controles de sentido comun (fin en el futuro y documento real).
 */
export function validateAgreement(form, account, chainNow) {
  const errors = {};

  if (!isAddress(form.tenant)) errors.tenant = "Ingresá una wallet válida (0x…).";
  else if (same(form.tenant, account)) errors.tenant = "El inquilino no puede ser tu propia wallet.";

  if (!isAddress(form.arbiter)) errors.arbiter = "Ingresá una wallet válida (0x…).";
  else if (same(form.arbiter, account)) errors.arbiter = "El árbitro no puede ser tu propia wallet.";
  else if (same(form.arbiter, form.tenant)) errors.arbiter = "El árbitro tiene que ser distinto del inquilino.";

  if (!AMOUNT_RE.test(form.deposit || "")) errors.deposit = "Ingresá un monto numérico (hasta 18 decimales).";
  else if (parseUnits(form.deposit, 18) === 0n) errors.deposit = "La garantía tiene que ser mayor a cero.";

  if (!form.start) errors.start = "Elegí la fecha de inicio.";
  if (!form.end) errors.end = "Elegí la fecha de fin.";
  if (form.start && form.end) {
    if (toTimestamp(form.end) <= toTimestamp(form.start)) errors.end = "El fin tiene que ser posterior al inicio.";
    else if (chainNow && toTimestamp(form.end) <= chainNow) errors.end = "El alquiler tiene que terminar en el futuro.";
  }

  if (!form.documentHash) errors.document = "Adjuntá el contrato firmado para registrar su huella.";

  return errors;
}

export default function CreateAgreement({ deployment, account, chainNow, busy, onCancel, onCreate }) {
  const today = chainNow || Math.floor(Date.now() / 1000);
  const [touched, setTouched] = useState(false);
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
  const errors = useMemo(() => validateAgreement(form, account, chainNow), [form, account, chainNow]);
  const valid = Object.keys(errors).length === 0;
  const show = (k) => touched && errors[k] && <small className="error">{errors[k]}</small>;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const hash = await sha256File(file);
    setForm((f) => ({ ...f, documentName: file.name, documentHash: `sha256:${hash}` }));
  };

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onCreate({
      params: [
        deployment.contracts.MockUSDT,
        getAddress(form.tenant),
        getAddress(form.arbiter),
        parseUnits(form.deposit, 18),
        form.documentHash,
        toTimestamp(form.start),
        toTimestamp(form.end),
      ],
      summary: form,
    });
  };

  return (
    <form className="panel form" onSubmit={submit} noValidate>
      <h1>Nuevo acuerdo de alquiler</h1>
      <p className="muted">
        Vas a quedar como <strong>propietario</strong> ({shortAddress(account)}). Se despliegan el contrato del
        acuerdo y el escrow de la garantía en una sola transacción.
      </p>

      <label>
        Wallet del inquilino
        <input value={form.tenant} onChange={set("tenant")} placeholder="0x…" spellCheck="false" />
        {show("tenant")}
      </label>
      <label>
        Wallet del árbitro / escribano verificado
        <input value={form.arbiter} onChange={set("arbiter")} placeholder="0x…" spellCheck="false" />
        {show("arbiter")}
      </label>
      <div className="row">
        <label>
          Garantía (mUSDT)
          <input inputMode="decimal" value={form.deposit} onChange={set("deposit")} />
          {show("deposit")}
        </label>
        <label>
          Inicio
          <input type="date" value={form.start} onChange={set("start")} />
          {show("start")}
        </label>
        <label>
          Fin
          <input type="date" value={form.end} onChange={set("end")} />
          {show("end")}
        </label>
      </div>
      <label>
        Contrato firmado (PDF)
        <input type="file" accept=".pdf,application/pdf" onChange={onFile} />
        {form.documentHash ? (
          <small className="muted">
            Huella SHA-256 de <strong>{form.documentName}</strong>:<br />
            <code className="hash">{form.documentHash}</code>
          </small>
        ) : (
          <small className="muted">
            La huella se calcula en tu navegador: el archivo no se sube a ningún lado. Cualquiera de las partes puede
            verificar después que su copia coincide con la registrada on-chain.
          </small>
        )}
        {show("document")}
      </label>
      <p className="muted small">
        La garantía se paga en <strong>mUSDT</strong>, un token de prueba sin valor en la red local.
      </p>
      <div className="actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        <button className="primary" disabled={!!busy || (touched && !valid)}>Crear acuerdo</button>
      </div>
    </form>
  );
}
