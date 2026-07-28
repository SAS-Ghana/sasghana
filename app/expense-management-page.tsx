import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRow, DataRow, listNamedRows, listRowsWhere, updateRow } from "./lib/supabase-data";

const claimStatuses = ["draft", "submitted", "manager_approved", "hr_approved", "finance_review", "approved", "rejected", "returned", "reimbursed"];

function formatMoney(value: unknown, currency = "GHS") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(value ?? 0));
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB");
}

export function ExpenseManagementPage({ accessToken, organisationId }: { accessToken: string; organisationId: string }) {
  const [claims, setClaims] = useState<DataRow[]>([]);
  const [categories, setCategories] = useState<DataRow[]>([]);
  const [employees, setEmployees] = useState<DataRow[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [claimRows, categoryRows, employeeRows] = await Promise.all([
        listRowsWhere(accessToken, "expense_claims", { organisation_id: organisationId }, "*", 1000),
        listRowsWhere(accessToken, "master_data", { organisation_id: organisationId, data_type: "expense_category" }, "*", 500),
        listNamedRows(accessToken, "employees", "id,first_name,last_name,employee_number", "first_name"),
      ]);
      setClaims(claimRows);
      setCategories(categoryRows);
      setEmployees(employeeRows);
    } catch (cause) {
      setClaims([]);
      setError(cause instanceof Error ? cause.message : "Expenses could not be loaded.");
    }
  }, [accessToken, organisationId]);

  useEffect(() => { void load(); }, [load]);

  const employeeName = useCallback((employeeId: unknown) => {
    const employee = employees.find((row) => String(row.id) === String(employeeId));
    return employee ? `${employee.first_name} ${employee.last_name}` : "Employee";
  }, [employees]);

  const visible = useMemo(() => claims.filter((row) => {
    const matchesStatus = status === "all" || String(row.status ?? "draft") === status;
    const text = `${employeeName(row.employee_id)} ${row.category ?? row.expense_type ?? ""} ${row.description ?? ""} ${row.amount ?? ""}`.toLowerCase();
    return matchesStatus && (!query || text.includes(query.toLowerCase()));
  }), [claims, employeeName, query, status]);

  const pending = claims.filter((row) => ["draft", "submitted", "manager_approved", "hr_approved", "finance_review", "returned"].includes(String(row.status))).length;
  const approved = claims.filter((row) => ["approved", "reimbursed"].includes(String(row.status))).length;
  const totalPending = claims.filter((row) => !["rejected", "reimbursed"].includes(String(row.status))).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  async function changeStatus(row: DataRow, next: string) {
    if (!row.id) return;
    setBusy(String(row.id));
    setError("");
    setNotice("");
    try {
      const update: DataRow = { status: next, reviewed_at: new Date().toISOString() };
      if (next === "submitted" && !row.submitted_at) update.submitted_at = new Date().toISOString();
      if (["rejected", "returned"].includes(next)) {
        const comment = window.prompt(next === "rejected" ? "Enter the reason for rejecting this claim:" : "Enter what the employee must correct:", String(row.hr_comment ?? ""));
        if (comment === null) return;
        update.hr_comment = comment.trim() || null;
      }
      await updateRow(accessToken, "expense_claims", String(row.id), update);
      await load();
      setNotice(`Expense claim updated to ${next.replaceAll("_", " ")}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Expense claim could not be updated.");
    } finally {
      setBusy("");
    }
  }

  function exportCsv() {
    const columns: [string, string][] = [["employee_id", "Employee"], ["category", "Category"], ["amount", "Amount"], ["currency", "Currency"], ["expense_date", "Date"], ["status", "Status"], ["description", "Description"]];
    const csv = [columns.map(([, label]) => label).join(","), ...visible.map((row) => columns.map(([key]) => {
      const value = key === "employee_id" ? employeeName(row.employee_id) : row[key];
      return `"${String(value ?? "").replaceAll('"', '""')}"`;
    }).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "expense-claims.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <section>
    <header className="page-header"><div><span className="eyebrow">Expense administration</span><h1>Expenses</h1><p className="muted">Configure categories, review employee claims and track reimbursement status.</p></div><button type="button" className="primary" onClick={() => { setError(""); setNotice(""); setOpen(true); }}>Create category</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <div className="summary-strip"><div><strong>{claims.length}</strong><span>Total claims</span></div><div><strong>{pending}</strong><span>Awaiting action</span></div><div><strong>{approved}</strong><span>Approved or reimbursed</span></div><div><strong>{formatMoney(totalPending)}</strong><span>Open claim value</span></div></div>

    <article className="card panel"><div className="panel-head"><div><h2>Expense categories</h2><p className="muted">Categories created here are immediately available in expense forms.</p></div></div>
      <div className="master-list expense-category-list">{categories.map((row) => <div key={String(row.id)}><div className="expense-category-copy"><strong>{String(row.name)}</strong><small>{String(row.description ?? "No description")}</small></div><span className={`status-pill ${row.status}`}>{String(row.status ?? "active")}</span></div>)}{!categories.length && <div className="empty-state compact">No expense categories yet.</div>}</div>
    </article>

    <article className="card data-panel"><div className="panel-head"><div><h2>Expense claims</h2><p className="muted">Employee submissions, approval decisions, Finance forwarding and reimbursement tracking.</p></div><div className="row-actions"><button type="button" onClick={() => void load()}>Refresh</button><button type="button" onClick={exportCsv}>Export CSV</button></div></div>
      <div className="filter-toolbar"><input id="expense-claim-search" name="expense_claim_search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, category or description..." /><select id="expense-claim-status" name="expense_claim_status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{claimStatuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
      {visible.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Category</th><th>Amount</th><th>Expense date</th><th>Submitted</th><th>Status</th><th>Details</th><th>Actions</th></tr></thead><tbody>{visible.map((row) => <tr key={String(row.id)}><td><strong>{employeeName(row.employee_id)}</strong><small className="table-subline">{String(employees.find((employee) => String(employee.id) === String(row.employee_id))?.employee_number ?? "")}</small></td><td>{String(row.category ?? row.expense_type ?? "—")}</td><td>{formatMoney(row.amount, String(row.currency ?? "GHS"))}</td><td>{formatDate(row.expense_date)}</td><td>{formatDate(row.submitted_at ?? row.created_at)}</td><td><span className={`status-pill ${String(row.status ?? "draft")}`}>{String(row.status ?? "draft").replaceAll("_", " ")}</span></td><td>{String(row.description ?? "—")}<small className="table-subline">{String(row.hr_comment ?? row.manager_comment ?? "")}</small></td><td><div className="row-actions"><button type="button" disabled={busy === String(row.id)} onClick={() => void changeStatus(row, "hr_approved")}>HR approve</button><button type="button" disabled={busy === String(row.id)} onClick={() => void changeStatus(row, "finance_review")}>Send to Finance</button><button type="button" disabled={busy === String(row.id)} onClick={() => void changeStatus(row, "returned")}>Return</button><button type="button" disabled={busy === String(row.id)} onClick={() => void changeStatus(row, "rejected")}>Reject</button><button type="button" disabled={busy === String(row.id)} onClick={() => void changeStatus(row, "reimbursed")}>Reimbursed</button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No expense claims found</h3><p>Employee claims will appear here immediately after submission.</p></div>}
    </article>

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
