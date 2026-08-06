import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listNamedRows, listRowsWhere } from "./lib/supabase-data";
import { loadAttendancePolicy } from "./quick-attendance";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function parseShiftMinutes(shift?: string) { const [h, m] = String(shift ?? "08:00").split(":").map(Number); return (h || 0) * 60 + (m || 0); }
function minutesSinceMidnight(date: Date) { return date.getHours() * 60 + date.getMinutes(); }
function timeLabel(value: unknown) { if (!value) return "—"; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }

type Status = "present" | "late" | "not_clocked_in";
type Row = { employeeId: string; name: string; department: string; position: string; clockIn: unknown; clockOut: unknown; status: Status };

export function LiveAttendancePage({ accessToken }: { accessToken: string; profile: UserProfile }) {
  const [date, setDate] = useState(todayISO());
  const [employees, setEmployees] = useState<DataRow[]>([]);
  const [records, setRecords] = useState<DataRow[]>([]);
  const [policy, setPolicy] = useState<{ shift_start?: string; grace_minutes?: number }>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [emp, att, pol] = await Promise.all([
        listNamedRows(accessToken, "employees", "id,first_name,last_name,department_name,position_title,employment_status", "first_name"),
        listRowsWhere(accessToken, "attendance_records", { attendance_date: date }, "*", 2000),
        loadAttendancePolicy(accessToken),
      ]);
      setEmployees(emp.filter((row) => !["terminated", "offboarded"].includes(String(row.employment_status ?? "").toLowerCase())));
      setRecords(att);
      setPolicy(pol);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Attendance could not be loaded.");
    } finally { setLoading(false); }
  }, [accessToken, date]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);

  const lateThreshold = parseShiftMinutes(policy.shift_start) + Number(policy.grace_minutes ?? 0);

  const rows: Row[] = useMemo(() => employees.map((employee) => {
    const record = records.find((row) => String(row.employee_id) === String(employee.id));
    const clockIn = record?.clock_in;
    const status: Status = !clockIn ? "not_clocked_in" : minutesSinceMidnight(new Date(String(clockIn))) > lateThreshold ? "late" : "present";
    return {
      employeeId: String(employee.id),
      name: `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "Employee",
      department: String(employee.department_name ?? "—"),
      position: String(employee.position_title ?? "—"),
      clockIn, clockOut: record?.clock_out, status,
    };
  }), [employees, records, lateThreshold]);

  const visible = useMemo(() => rows.filter((row) => {
    const matchesStatus = statusFilter === "all" || row.status === statusFilter;
    const matchesQuery = !query || `${row.name} ${row.department} ${row.position}`.toLowerCase().includes(query.toLowerCase());
    return matchesStatus && matchesQuery;
  }), [rows, statusFilter, query]);

  const presentCount = rows.filter((row) => row.status === "present").length;
  const lateCount = rows.filter((row) => row.status === "late").length;
  const notClockedInCount = rows.filter((row) => row.status === "not_clocked_in").length;

  return <section>
    <header className="page-header">
      <div>
        <span className="eyebrow">Workforce presence</span>
        <h1><MenuIcon name={moduleIcon("Attendance Management")} />Live attendance</h1>
        <p className="muted">Who has clocked in and out, for any day. Late is anyone clocking in after {String(policy.shift_start ?? "08:00").slice(0, 5)} plus the {policy.grace_minutes ?? 0} minute grace period set in the attendance policy.</p>
      </div>
      <div className="row-actions">
        <label className="attendance-date-picker">Date<input type="date" value={date} max={todayISO()} onChange={(event) => setDate(event.target.value)} /></label>
        <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </header>

    <div className="summary-strip">
      <div><strong>{rows.length}</strong><span>Total employees</span></div>
      <div><strong>{presentCount}</strong><span>Clocked in on time</span></div>
      <div><strong>{lateCount}</strong><span>Late</span></div>
      <div><strong>{notClockedInCount}</strong><span>Not clocked in</span></div>
    </div>

    <article className="card data-panel">
      <div className="filter-toolbar">
        <input id="attendance-search" name="attendance_search" aria-label="Search employee" placeholder="Search name, department or position…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select id="attendance-status" name="attendance_status" aria-label="Attendance status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="all">All statuses</option>
          <option value="present">On time</option>
          <option value="late">Late</option>
          <option value="not_clocked_in">Not clocked in</option>
        </select>
        <button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Clear filters</button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Employee</th><th>Department</th><th>Clock in</th><th>Clock out</th><th>Status</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.employeeId}>
            <td><strong>{row.name}</strong><small className="table-subline">{row.position}</small></td>
            <td>{row.department}</td>
            <td>{timeLabel(row.clockIn)}</td>
            <td>{timeLabel(row.clockOut)}</td>
            <td><span className={`status-pill ${row.status === "present" ? "active" : row.status === "late" ? "pending" : "archived"}`}>{row.status === "present" ? "On time" : row.status === "late" ? "Late" : "Not clocked in"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>

      {!visible.length && !loading && <div className="empty-state"><h3>No matching employees</h3><p>Change the filters or pick another date.</p></div>}
    </article>
  </section>;
}
