import { useCallback, useEffect, useMemo, useState } from "react";
import { callRpc, DataRow, listNamedRows, listRows } from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB");
}

export function ProfileRequestsPage({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [employees, setEmployees] = useState<DataRow[]>([]);
  const [status, setStatus] = useState("pending");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [requestRows, employeeRows] = await Promise.all([
        listRows(accessToken, "employee_change_requests", "*", 500),
        listNamedRows(accessToken, "employees", "id,first_name,last_name,employee_number", "first_name"),
      ]);
      setRows(requestRows);
      setEmployees(employeeRows);
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "Profile requests could not be loaded.");
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const employeeName = (employeeId: unknown) => {
    const employee = employees.find((row) => String(row.id) === String(employeeId));
    return employee ? `${employee.first_name} ${employee.last_name}` : "Employee";
  };

  const visible = useMemo(() => rows.filter((row) => status === "all" || String(row.status ?? "pending") === status), [rows, status]);
  const pendingCount = rows.filter((row) => String(row.status ?? "pending") === "pending").length;

  async function decide(row: DataRow, decision: "approved" | "rejected") {
    if (!row.id) return;
    const note = window.prompt(decision === "approved" ? "Optional note to the employee:" : "Reason for rejecting this request:", String(row.review_note ?? "")) ?? "";
    if (decision === "rejected" && !note.trim()) { setError("A reason is required to reject a change request."); return; }
    setBusy(String(row.id));
    setError("");
    setNotice("");
    try {
      await callRpc(accessToken, "review_employee_change_request", {
        p_request_id: String(row.id),
        p_decision: decision,
        p_review_note: note.trim() || null,
      });
      await load();
      setNotice(`Request ${decision}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be reviewed.");
    } finally {
      setBusy("");
    }
  }

  return <section>
    <header className="page-header">
      <div><span className="eyebrow">Employee self-service</span><h1><MenuIcon name={moduleIcon("Profile Requests")} />Profile Requests</h1><p className="muted">Employee-submitted profile field changes, awaiting review before they take effect.</p></div>
      <button type="button" className="secondary" onClick={() => void load()}>Refresh</button>
    </header>

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <div className="summary-strip"><div><strong>{pendingCount}</strong><span>Awaiting review</span></div><div><strong>{rows.length}</strong><span>Total requests</span></div></div>

    <article className="card data-panel">
      <div className="filter-toolbar">
        <select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All statuses</option>
        </select>
      </div>
      {visible.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Employee</th><th>Field</th><th>Requested value</th><th>Reason</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={String(row.id)}>
          <td><strong>{employeeName(row.employee_id)}</strong></td>
          <td>{String(row.field_name ?? "—").replaceAll("_", " ")}</td>
          <td>{String(row.new_value ?? "—")}</td>
          <td>{String(row.reason ?? "—")}</td>
          <td>{formatDate(row.created_at)}</td>
          <td><span className={`status-pill ${String(row.status ?? "pending")}`}>{String(row.status ?? "pending")}</span></td>
          <td><div className="row-actions">
            {String(row.status ?? "pending") === "pending" ? <>
              <button type="button" disabled={busy === String(row.id)} onClick={() => void decide(row, "approved")}>Approve</button>
              <button type="button" className="danger" disabled={busy === String(row.id)} onClick={() => void decide(row, "rejected")}>Reject</button>
            </> : <small className="table-subline">{String(row.review_note ?? "")}</small>}
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><h3>No requests</h3><p>Employee profile change requests will appear here for review.</p></div>}
    </article>
  </section>;
}
