import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminSectionPage } from "./admin-section-page";
import { DataRow, listNamedRows, listRows, updateRow } from "./lib/supabase-data";

export function AssetManagementWorkspace({ accessToken, organisationId }: { accessToken: string; organisationId: string }) {
  const [requests, setRequests] = useState<DataRow[]>([]);
  const [employees, setEmployees] = useState<DataRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [requestRows, employeeRows] = await Promise.all([
        listRows(accessToken, "asset_requests", "*", 1000),
        listNamedRows(accessToken, "employees", "id,first_name,last_name,employee_number", "first_name"),
      ]);
      setRequests(requestRows);
      setEmployees(employeeRows);
    } catch (cause) {
      setRequests([]);
      setError(cause instanceof Error ? cause.message : "Asset requests could not be loaded.");
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const employeeName = (employeeId: unknown) => {
    const employee = employees.find((row) => String(row.id) === String(employeeId));
    return employee ? `${employee.first_name} ${employee.last_name}` : "Employee";
  };

  const statuses = Array.from(new Set(requests.map((row) => String(row.status ?? "pending"))));
  const visible = useMemo(() => requests.filter((row) =>
    (status === "all" || String(row.status ?? "pending") === status) &&
    (!query || `${employeeName(row.employee_id)} ${row.asset_type ?? ""} ${row.category ?? ""} ${row.reason ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  ), [requests, query, status, employees]);

  async function change(row: DataRow, next: string) {
    if (!row.id) return;
    setBusy(String(row.id));
    setError("");
    setNotice("");
    try {
      await updateRow(accessToken, "asset_requests", String(row.id), {
        status: next,
        approved_at: ["approved", "fulfilled"].includes(next) ? new Date().toISOString() : null,
      });
      await load();
      setNotice(`Asset request updated to ${next}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Asset request could not be updated.");
    } finally {
      setBusy("");
    }
  }

  return <section className="asset-management-workspace">
    <AdminSectionPage label="Asset Management" accessToken={accessToken} organisationId={organisationId} />

    <article className="card data-panel request-review-panel">
      <div className="panel-head"><div><span className="eyebrow">Employee self service</span><h2>Asset requests</h2><p className="muted">Requests submitted by employees appear here immediately for HR or administrator review.</p></div><button type="button" className="secondary" onClick={() => void load()}>Refresh requests</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}
      <div className="filter-toolbar"><input id="asset-request-search" name="asset_request_search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or requested asset..." /><select id="asset-request-status" name="asset_request_status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
      {visible.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Asset needed</th><th>Reason</th><th>Priority</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>{visible.map((row) => <tr key={String(row.id)}><td><strong>{employeeName(row.employee_id)}</strong></td><td>{String(row.asset_type ?? row.category ?? "—")}</td><td>{String(row.reason ?? row.description ?? "—")}</td><td><span className={`status-pill ${String(row.priority ?? "normal")}`}>{String(row.priority ?? "normal")}</span></td><td>{String(row.status ?? "pending").replaceAll("_", " ")}</td><td>{row.created_at ? new Date(String(row.created_at)).toLocaleString("en-GB") : "—"}</td><td><div className="row-actions"><button type="button" disabled={busy === String(row.id)} onClick={() => void change(row, "approved")}>Approve</button><button type="button" disabled={busy === String(row.id)} onClick={() => void change(row, "rejected")}>Reject</button><button type="button" disabled={busy === String(row.id)} onClick={() => void change(row, "fulfilled")}>Fulfilled</button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No asset requests</h3><p>Employee requests will appear here after submission.</p></div>}
    </article>
  </section>;
}
