import { FormEvent, useState } from "react";
import { DataRow, deleteRow, updateRow } from "./lib/supabase-data";

// Fields known to be computed client-side during load() rather than real columns on the
// underlying table (e.g. AdminSectionPage/HRSectionPage/ManagerSectionPage all attach
// employee_name by looking up the employee record after fetching). Never sent back on save.
const derivedFields = new Set(["employee_name"]);

type FieldKind = "checkbox" | "date" | "textarea" | "number" | "text";
const longTextKey = /note|description|reason|details|comment|body|summary/i;

function fieldKind(key: string, value: unknown): FieldKind {
  if (typeof value === "boolean") return "checkbox";
  if (longTextKey.test(key)) return "textarea";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
  if (typeof value === "number") return "number";
  return "text";
}

export function RecordActions({ accessToken, table, row, columns, label, onReload }: {
  accessToken: string;
  table: string;
  row: DataRow;
  columns: [string, string][];
  label: string;
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!row.id) return;
    if (!window.confirm(`Delete this ${label.toLowerCase()} record? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteRow(accessToken, table, String(row.id));
      await onReload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Record could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" disabled={busy || !row.id} onClick={() => setEditing(true)}>Edit</button>
    <button type="button" className="danger" disabled={busy || !row.id} onClick={() => void remove()}>Delete</button>
    {error && <small className="table-subline form-error">{error}</small>}
    {editing && <GenericEditDialog accessToken={accessToken} table={table} row={row} columns={columns} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await onReload(); }} />}
  </>;
}

// Self-service equivalent of RecordActions: an employee editing/withdrawing their OWN submitted
// request. Deliberately narrower than the admin-tier RecordActions -- only shown while the row is
// still in a pending-equivalent status (before a manager/HR/admin has acted on it), and "Withdraw"
// updates status instead of hard-deleting the row, preserving the record for audit history.
const pendingStatuses = new Set(["pending", "draft", "submitted"]);

export function SelfRecordActions({ accessToken, table, row, columns, onReload }: {
  accessToken: string;
  table: string;
  row: DataRow;
  columns: [string, string][];
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!pendingStatuses.has(String(row.status ?? "").toLowerCase())) return null;

  async function withdraw() {
    if (!row.id) return;
    if (!window.confirm("Withdraw this request? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      await updateRow(accessToken, table, String(row.id), { status: "cancelled" });
      await onReload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request could not be withdrawn.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" disabled={busy || !row.id} onClick={() => setEditing(true)}>Edit</button>
    <button type="button" className="danger" disabled={busy || !row.id} onClick={() => void withdraw()}>Withdraw</button>
    {error && <small className="table-subline form-error">{error}</small>}
    {editing && <GenericEditDialog accessToken={accessToken} table={table} row={row} columns={columns} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await onReload(); }} />}
  </>;
}

function GenericEditDialog({ accessToken, table, row, columns, onClose, onSaved }: {
  accessToken: string;
  table: string;
  row: DataRow;
  columns: [string, string][];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<DataRow>(() => {
    const initial: DataRow = {};
    for (const [key] of columns) initial[key] = row[key] ?? "";
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row.id) return;
    setBusy(true);
    setError("");
    try {
      const payload: DataRow = { ...values };
      for (const key of derivedFields) delete payload[key];
      await updateRow(accessToken, table, String(row.id), payload);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Record could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="generic-edit-title">
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
      <span className="eyebrow">Edit record</span>
      <h2 id="generic-edit-title">Edit fields</h2>
      <form className="record-form" onSubmit={submit}>
        {columns.map(([key, fieldLabel]) => {
          const kind = fieldKind(key, row[key]);
          const disabled = derivedFields.has(key);
          if (kind === "checkbox") return <label key={key} className="check">
            <input type="checkbox" checked={Boolean(values[key])} disabled={disabled} onChange={(event) => setValues({ ...values, [key]: event.target.checked })} /> {fieldLabel}
          </label>;
          if (kind === "textarea") return <label key={key} className="wide">
            {fieldLabel}
            <textarea value={String(values[key] ?? "")} disabled={disabled} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />
          </label>;
          return <label key={key}>
            {fieldLabel}
            <input
              type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
              value={kind === "date" ? String(values[key] ?? "").slice(0, 10) : String(values[key] ?? "")}
              disabled={disabled}
              readOnly={disabled}
              onChange={(event) => setValues({ ...values, [key]: kind === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value })}
            />
          </label>;
        })}
        {error && <p className="form-error wide" role="alert">{error}</p>}
        <div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
      </form>
    </section>
  </div>;
}
