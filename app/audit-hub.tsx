import { useCallback, useEffect, useMemo, useState } from "react";
import { DataRow, listRows } from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type AuditView = "activity" | "logins";
type SortField = "time" | "name" | "location";
type SortState = { field: SortField; dir: "asc" | "desc" };

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

function locationLabel(row: DataRow) {
  const parts = [row.city, row.region, row.country].map((part) => (part ? String(part) : "")).filter(Boolean);
  if (parts.length) return parts.join(", ");
  if (row.ip_address) return String(row.ip_address);
  return "Location not available";
}

function deviceLabel(value: unknown) {
  const agent = String(value ?? "");
  if (!agent) return "Device not supplied";
  const platform = /Windows/i.test(agent) ? "Windows" : /Android/i.test(agent) ? "Android" : /iPhone|iPad/i.test(agent) ? "iPhone / iPad" : /Mac OS/i.test(agent) ? "Mac" : /Linux/i.test(agent) ? "Linux" : "Device";
  const browser = /Edg\//i.test(agent) ? "Edge" : /Chrome\//i.test(agent) ? "Chrome" : /Firefox\//i.test(agent) ? "Firefox" : /Safari\//i.test(agent) ? "Safari" : "Browser";
  return `${platform} · ${browser}`;
}

function readableAction(value: unknown) {
  return String(value ?? "Activity").replaceAll("_", " ").replaceAll(".", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableResource(value: unknown) {
  return String(value ?? "System").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function detailText(row: DataRow) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  const changed = Array.isArray(metadata.changed_fields) ? metadata.changed_fields.join(", ") : "";
  if (changed) return `Updated: ${changed}`;
  if (metadata.record_label) return String(metadata.record_label);
  if (metadata.username) return `Account: ${String(metadata.username)}`;
  return `${readableAction(row.action)} on ${readableResource(row.resource)}`;
}

function sortRows(rows: DataRow[], sort: SortState) {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.field === "time") return (new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime()) * factor;
    if (sort.field === "name") return accountName(a).localeCompare(accountName(b)) * factor;
    return locationLabel(a).localeCompare(locationLabel(b)) * factor;
  });
}

function SortableHeader({ label, field, sort, onSort }: { label: string; field: SortField; sort: SortState; onSort: (field: SortField) => void }) {
  const active = sort.field === field;
  return <th><button type="button" className="audit-sort-button" onClick={() => onSort(field)}>{label}{active && <span aria-hidden="true">{sort.dir === "asc" ? " ↑" : " ↓"}</span>}</button></th>;
}

export function AuditHub({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loginRows, setLoginRows] = useState<DataRow[]>([]);
  const [view, setView] = useState<AuditView>("activity");
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [sort, setSort] = useState<SortState>({ field: "time", dir: "desc" });
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
  const filtered = useMemo(() => source.filter((row) => {
    const matchesOutcome = outcome === "all" || String(row.outcome) === outcome;
    const matchesQuery = !query || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()));
    return matchesOutcome && matchesQuery;
  }), [source, query, outcome]);
  const visible = useMemo(() => sortRows(filtered, sort), [filtered, sort]);

  function toggleSort(field: SortField) {
    setSort((current) => current.field === field ? { field, dir: current.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" });
  }

  const successful = loginRows.filter((row) => row.outcome === "success").length;
  const failed = loginRows.filter((row) => row.outcome === "failed").length;

  return <section className="audit-hub-page">
    <header className="page-header">
      <div>
        <span className="eyebrow">Security & accountability</span>
        <h1><MenuIcon name={moduleIcon("Audit Logs")} />{view === "logins" ? "Login history" : "Complete activity audit"}</h1>
        <p className="muted">Audit history is permanent and read only. Login history includes successful and failed account access attempts, with the approximate location and device used.</p>
      </div>
      <div className="row-actions audit-view-actions">
        <button type="button" className={view === "activity" ? "primary" : "secondary"} onClick={() => setView("activity")}>All activity</button>
        <button type="button" className={view === "logins" ? "primary" : "secondary"} onClick={() => setView("logins")}>Login history</button>
        <button type="button" className="secondary" onClick={() => window.print()}><MenuIcon name="report" />Print</button>
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
        <input id="audit-search" name="audit_search" aria-label="Search audit" placeholder={view === "logins" ? "Search account, email, device or location…" : "Search person, action, resource, device or location…"} value={query} onChange={(event) => setQuery(event.target.value)} />
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
          <thead><tr><SortableHeader label="Date & time" field="time" sort={sort} onSort={toggleSort} /><SortableHeader label="Account" field="name" sort={sort} onSort={toggleSort} /><th>Result</th><th>Device / browser</th><SortableHeader label="Location" field="location" sort={sort} onSort={toggleSort} /></tr></thead>
          <tbody>{visible.map((row) => <tr key={String(row.id)}>
            <td>{formatDate(row.created_at)}</td>
            <td><strong>{String(row.actor_name ?? row.actor_username ?? "Account")}</strong><small className="table-subline">{String(row.actor_username ?? "—")} · {String(row.actor_email ?? "—")}</small></td>
            <td><span className={`status-pill ${row.outcome}`}>{String(row.outcome ?? "recorded")}</span></td>
            <td><span className="audit-agent audit-ellipsis" title={String(row.user_agent ?? "Device not supplied")}>{deviceLabel(row.user_agent)}</span></td>
            <td>{locationLabel(row)}<small className="table-subline">{row.ip_address ? `IP: ${String(row.ip_address)}` : "IP not supplied by browser"}</small></td>
          </tr>)}</tbody>
        </table> : <table className="data-table">
          <thead><tr><SortableHeader label="Date & time" field="time" sort={sort} onSort={toggleSort} /><SortableHeader label="Account" field="name" sort={sort} onSort={toggleSort} /><th>Action</th><th>Resource</th><th>Outcome</th><th>Device / details</th><SortableHeader label="Location" field="location" sort={sort} onSort={toggleSort} /></tr></thead>
          <tbody>{visible.map((row) => <tr key={String(row.id)}>
            <td>{formatDate(row.created_at)}</td>
            <td><strong>{accountName(row)}</strong><small className="table-subline">{String(row.actor_username ?? "—")} · {String(row.account_type ?? "—")}</small></td>
            <td>{readableAction(row.action)}</td>
            <td>{readableResource(row.resource)}<small className="table-subline audit-id" title={String(row.resource_id ?? "")}>{row.resource_id ? `${String(row.resource_id).slice(0, 8)}…` : ""}</small></td>
            <td><span className={`status-pill ${row.outcome}`}>{String(row.outcome ?? "recorded")}</span></td>
            <td><span className="audit-agent audit-ellipsis" title={JSON.stringify(row.metadata ?? {}, null, 2)}>{row.user_agent ? deviceLabel(row.user_agent) : detailText(row)}</span></td>
            <td>{locationLabel(row)}</td>
          </tr>)}</tbody>
        </table>}
      </div>

      {!visible.length && !loading && <div className="empty-state"><h3>No matching history</h3><p>Change the filters or refresh to load the latest recorded activity.</p></div>}
    </article>
  </section>;
}
