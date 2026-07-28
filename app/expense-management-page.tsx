import { FormEvent, useCallback, useEffect, useState } from "react";
import { createRow, DataRow, listRowsWhere } from "./lib/supabase-data";

export function ExpenseManagementPage({ accessToken, organisationId }: { accessToken: string; organisationId: string }) {
  const [claims, setClaims] = useState<DataRow[]>([]);
  const [categories, setCategories] = useState<DataRow[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [claimRows, categoryRows] = await Promise.all([
        listRowsWhere(accessToken, "expense_claims", { organisation_id: organisationId }, "*", 500),
        listRowsWhere(accessToken, "master_data", { organisation_id: organisationId, data_type: "expense_category" }, "*", 500),
      ]);
      setClaims(claimRows);
      setCategories(categoryRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Expenses could not be loaded.");
    }
  }, [accessToken, organisationId]);

  useEffect(() => { void load(); }, [load]);

  return <section>
    <header className="page-header"><div><span className="eyebrow">Expense administration</span><h1>Expenses</h1><p className="muted">Configure categories, review employee claims and track reimbursement status.</p></div><button type="button" className="primary" onClick={() => { setError(""); setNotice(""); setOpen(true); }}>Create category</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <article className="card panel"><div className="panel-head"><div><h2>Expense categories</h2><p className="muted">Categories created here are immediately available in expense forms.</p></div></div>
      <div className="master-list expense-category-list">{categories.map((row) => <div key={String(row.id)}><div className="expense-category-copy"><strong>{String(row.name)}</strong><small>{String(row.description ?? "No description")}</small></div><span className={`status-pill ${row.status}`}>{String(row.status ?? "active")}</span></div>)}{!categories.length && <div className="empty-state compact">No expense categories yet.</div>}</div>
    </article>

    <article className="card data-panel"><div className="panel-head"><div><h2>Expense claims</h2><p className="muted">Submitted receipts and reimbursement decisions.</p></div><button type="button" onClick={() => void load()}>Refresh</button></div>{claims.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Category</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>{claims.map((row) => <tr key={String(row.id)}><td>{String(row.employee_name ?? "Employee")}</td><td>{String(row.category ?? row.expense_type ?? "—")}</td><td>{String(row.amount ?? "0")}</td><td>{String(row.expense_date ?? row.submitted_at ?? row.created_at ?? "—")}</td><td>{String(row.status ?? "pending")}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No expense claims yet</h3><p>Created categories remain visible above even when no claims have been submitted.</p></div>}</article>

    {open && <CategoryDialog accessToken={accessToken} organisationId={organisationId} onClose={() => setOpen(false)} onSaved={async () => { setOpen(false); setError(""); setNotice("Expense category created and added to the list."); await load(); }} />}
  </section>;
}

function CategoryDialog({ accessToken, organisationId, onClose, onSaved }: { accessToken: string; organisationId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createRow(accessToken, "master_data", { organisation_id: organisationId, data_type: "expense_category", name: name.trim(), description: description.trim() || null, status: "active" });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Category could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="expense-category-title"><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Expense setup</span><h2 id="expense-category-title">Create category</h2><form className="record-form" onSubmit={submit}><label htmlFor="expense-category-name">Category name<input id="expense-category-name" name="category_name" required value={name} onChange={(event) => setName(event.target.value)} /></label><label htmlFor="expense-category-description">Description<textarea id="expense-category-description" name="description" value={description} onChange={(event) => setDescription(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Create category"}</button></div></form></section></div>;
}
