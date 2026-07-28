import { useCallback, useEffect, useMemo, useState } from "react";
import { DataRow, listRows } from "./lib/supabase-data";

type AuditView = "activity" | "logins";

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB");
}

function accountName(row: DataRow) {
  if (row.actor_name) return String(row.actor_name);
  if (row.metadata && typeof row.metadata === "object") {
    return String((row.metadata as Record<string, unknown>).username ?? "Account");
  }
  return "Account";
}

export function AuditHub({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loginRows, setLoginRows] = useState<DataRow[]>([]);
  const [view, setView] = useState<AuditView>("activity");
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activity, logins] = await Promise.all([
        listRows(accessToken, "admin_activity_feed", "*", 1500),
        listRows(accessToken, "login_history_feed", "*", 1500),
      ]);
      setRows(activity);
      setLoginRows(logins);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audit activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const source = view === "logins" ? loginRows : rows;
  const visible = useMemo(() => source.filter((row) => {
    const matchesOutcome = outcome === "all" || String(row.outcome) === outcome;
    const matchesQuery = !query || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()));
    return matchesOutcome && matchesQuery;
  }), [source, query, outcome]);

  const successful = loginRows.filter((row) => row.outcome === "success").length;
  const failed = loginRows.filter((row) => row.outcome === "failed").length;

  return <section>
    <header className="page-header">
      <div>
        <span className="eyebrow">Security & accountability</span>
        <h1>{view === "logins" ? "Login history" : "Complete activity audit"}</h1>
        <p className="muted">Audit history is permanent and read only. Login history includes successful and failed account access attempts.</p>
      </div>
      <div className="row-actions audit-view-actions">
        <button type="button" className={view === "activity" ? "primary" : "secondary"} onClick={() => setView("activity")}>All activity</button>
        <button type="button" className={view === "logins" ? "primary" : "secondary"} onClick={() => setView("logins")}>Login history</button>
        <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </header>

    <div className="summary-strip">
      <div><strong>{rows.length}</strong><span>Tracked activities</span></div>
      <div><strong>{successful}</strong><span>Successful logins</span></div>
      <div><strong>{failed}</strong><span>Failed logins</span></div>
    </div>

    <article className="card data-panel">
      <div className="filter-toolbar">
        <input id="audit-search" name="audit_search" aria-label="Search audit" placeholder={view === "logins" ? "Search account, email or device…" : "Search person, action, resource or device…"} value={query} onChange={(event) => setQuery(event.target.value)} />
        <select id="audit-outcome" name="audit_outcome" aria-label="Audit outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="all">All outcomes</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="recorded">Recorded</option>
        </select>
        <button type="button" onClick={() => { setQuery(""); setOutcome("all"); }}>Clear filters</button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="table-scroll">
        {view === "logins" ? <table className="data-table">
          <thead><tr><th>Date & time</th><th>Account</th><th>Result</th><th>Device / browser</th><th>Details</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={String(row.id)}>
            <td>{formatDate(row.created_at)}</td>
            <td><strong>{String(row.actor_name ?? row.actor_username ?? "Account")}</strong><small className="table-subline">{String(row.actor_username ?? "—")} · {String(row.actor_email ?? "—")}</small></td>
            <td><span className={`status-pill ${row.outcome}`}>{String(row.outcome ?? "recorded")}</span></td>
            <td><span className="audit-agent">{String(row.user_agent ?? "Device not supplied")}</span></td>
            <td>{String(row.action ?? "").replaceAll("_", " ")}<small className="table-subline">{row.ip_address ? `IP: ${String(row.ip_address)}` : "IP not supplied by browser"}</small></td>
          </tr>)}</tbody>
        </table> : <table className="data-table">
          <thead><tr><th>Date & time</th><th>Account</th><th>Action</th><th>Resource</th><th>Outcome</th><th>Device / details</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={String(row.id)}>
            <td>{formatDate(row.created_at)}</td>
            <td><strong>{accountName(row)}</strong><small className="table-subline">{String(row.actor_username ?? "—")} · {String(row.account_type ?? "—")}</small></td>
            <td>{String(row.action ?? "Activity").replaceAll("_", " ")}</td>
            <td>{String(row.resource ?? "—")}<small className="table-subline">{String(row.resource_id ?? "")}</small></td>
            <td><span className={`status-pill ${row.outcome}`}>{String(row.outcome ?? "recorded")}</span></td>
            <td><span className="audit-agent">{String(row.user_agent ?? JSON.stringify(row.metadata ?? {}))}</span></td>
          </tr>)}</tbody>
        </table>}
      </div>

      {!visible.length && !loading && <div className="empty-state"><h3>No matching history</h3><p>Change the filters or refresh to load the latest recorded activity.</p></div>}
    </article>
  </section>;
}
