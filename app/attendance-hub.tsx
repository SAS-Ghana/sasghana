import { useCallback, useEffect, useMemo, useState } from "react";
import { callRpc, DataRow, listRows } from "./lib/supabase-data";
import { AttendancePolicySettings } from "./attendance-policy-settings";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";
type AttendanceRow = DataRow & { employee?: DataRow };
function elapsed(start: unknown, end: unknown, now: number) {
  if (!start) return "—";
  const ms =
    (end ? new Date(String(end)).getTime() : now) -
    new Date(String(start)).getTime();
  if (ms < 0) return "—";
  const seconds = Math.floor(ms / 1000),
    hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function AttendanceHub({ accessToken }: { accessToken: string }) {
  const [records, setRecords] = useState<DataRow[]>([]),
    [employees, setEmployees] = useState<DataRow[]>([]),
    [overtimeRequests, setOvertimeRequests] = useState<DataRow[]>([]),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [date, setDate] = useState(""),
    [sort, setSort] = useState("newest"),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      const [a, e, overtime] = await Promise.all([
        listRows(accessToken, "attendance_records", "*", 1000),
        listRows(
          accessToken,
          "employees",
          "id,first_name,last_name,employee_number,department_id",
          1000,
        ),
        listRows(accessToken, "attendance_overtime_requests", "*", 500),
      ]);
      setRecords(a);
      setEmployees(e);
      setOvertimeRequests(overtime);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Attendance could not be loaded.",
      );
    }
  }, [accessToken]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [load]);
  const rows = useMemo<AttendanceRow[]>(
    () =>
      records
        .map(
          (row) =>
            ({
              ...row,
              employee: employees.find((e) => e.id === row.employee_id),
            }) as AttendanceRow,
        )
        .filter((row) => {
          const employee = row.employee as DataRow | undefined,
            needle = query.toLowerCase();
          return (
            (status === "all" || row.status === status) &&
            (!date || row.attendance_date === date) &&
            (!needle ||
              `${employee?.first_name ?? ""} ${employee?.last_name ?? ""} ${employee?.employee_number ?? ""}`
                .toLowerCase()
                .includes(needle))
          );
        })
        .sort((a, b) =>
          sort === "oldest"
            ? String(a.attendance_date).localeCompare(String(b.attendance_date))
            : sort === "name"
              ? String((a.employee as DataRow)?.first_name ?? "").localeCompare(
                  String((b.employee as DataRow)?.first_name ?? ""),
                )
              : String(b.attendance_date).localeCompare(
                  String(a.attendance_date),
                ),
        ),
    [records, employees, query, status, date, sort],
  );
  const today = new Date().toISOString().slice(0, 10),
    todayRows = records.filter((r) => r.attendance_date === today);
  function exportCsv() {
    const lines = [
      [
        "Employee",
        "Date",
        "Clock in",
        "Clock out",
        "Live time",
        "State",
        "GPS",
        "Source",
      ],
      ...rows.map((row) => {
        const employee = row.employee as DataRow | undefined;
        return [
          `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`,
          row.attendance_date,
          row.clock_in,
          row.clock_out,
          elapsed(row.clock_in, row.clock_out, now),
          row.current_state ?? row.status,
          row.latitude && row.longitude
            ? "Captured"
            : (row.location_permission ?? "Not captured"),
          row.source ?? "manual",
        ];
      }),
    ];
    const blob = new Blob(
      [
        lines
          .map((line) =>
            line
              .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `attendance-${today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function override(employeeId: string, action: string) {
    const reason = window.prompt("Reason for this attendance override:");
    if (!reason) return;
    setBusy(`${employeeId}-${action}`);
    setError("");
    try {
      let until: string | null = null,
        shift: string | null = null;
      if (action === "activate_overtime") {
        const hours = Number(
          window.prompt("Approve overtime for how many hours?", "2") ?? 0,
        );
        if (!hours) return;
        until = new Date(Date.now() + hours * 3600000).toISOString();
      }
      if (action === "set_shift_end") {
        shift = window.prompt(
          "Enter this employee's shift end time (HH:MM):",
          "18:00",
        );
        if (!shift) return;
      }
      await callRpc(accessToken, "admin_attendance_action", {
        p_employee_id: employeeId,
        p_action: action,
        p_reason: reason,
        p_shift_end: shift,
        p_overtime_until: until,
      });
      setNotice("Attendance override saved and audited.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Override failed.");
    } finally {
      setBusy("");
    }
  }
  async function reviewOvertime(
    request: DataRow,
    decision: "approved" | "rejected" | "questions",
  ) {
    const requested = Number(request.requested_minutes ?? 0);
    const minutes =
      decision === "approved"
        ? Number(
            window.prompt("Approved overtime minutes:", String(requested)) ??
              NaN,
          )
        : null;
    if (
      decision === "approved" &&
      (!Number.isFinite(minutes) || minutes! < 0)
    ) {
      setError("Enter valid approved overtime minutes.");
      return;
    }
    const comment = window.prompt(
      decision === "questions"
        ? "What proof or clarification should the employee provide?"
        : "Reviewer comment:",
      "",
    );
    if (comment === null || (decision === "questions" && !comment.trim()))
      return;
    setBusy(`overtime-${String(request.id)}`);
    setError("");
    try {
      await callRpc(accessToken, "review_overtime_request", {
        p_request_id: request.id,
        p_decision: decision,
        p_minutes: minutes,
        p_comment: comment,
      });
      setNotice(
        decision === "questions"
          ? "The employee was asked to provide overtime proof."
          : `Overtime ${decision}.`,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Overtime review failed.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section>
      <header className="page-header">
        <div>
          <span className="eyebrow">Time & attendance</span>
          <h1>
            <MenuIcon name={moduleIcon("Attendance Management")} />
            Attendance control centre
          </h1>
          <p className="muted">
            Live clock status, automatic shift controls, GPS status and
            administrator overrides.
          </p>
        </div>
        <button className="primary" onClick={exportCsv}>
          Download report
        </button>
      </header>
      <AttendancePolicySettings accessToken={accessToken} />
      <article className="card data-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Overtime approvals</span>
            <h2>Review recorded overtime</h2>
            <p className="muted">
              Approve recorded minutes, reject them, or ask the employee for
              proof. Every decision is retained in the attendance audit trail.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Recorded</th>
                <th>Approved</th>
                <th>Status</th>
                <th>Proof / comments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {overtimeRequests.length === 0 ? (
                <tr>
                  <td colSpan={6}>No overtime requests require review.</td>
                </tr>
              ) : (
                overtimeRequests.map((request) => {
                  const employee = employees.find(
                    (item) => item.id === request.employee_id,
                  );
                  const isBusy = busy === `overtime-${String(request.id)}`;
                  return (
                    <tr key={String(request.id)}>
                      <td>
                        <strong>{`${employee?.first_name ?? "Employee"} ${employee?.last_name ?? ""}`}</strong>
                        <small className="table-subline">
                          {String(employee?.employee_number ?? "")}
                        </small>
                      </td>
                      <td>{Number(request.requested_minutes ?? 0)} min</td>
                      <td>
                        {request.approved_minutes == null
                          ? "—"
                          : `${Number(request.approved_minutes)} min`}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${String(request.status)}`}
                        >
                          {String(request.status)}
                        </span>
                      </td>
                      <td>
                        {String(
                          request.employee_proof ??
                            request.reviewer_comment ??
                            "—",
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            disabled={isBusy}
                            onClick={() =>
                              void reviewOvertime(request, "approved")
                            }
                          >
                            Approve
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() =>
                              void reviewOvertime(request, "questions")
                            }
                          >
                            Request proof
                          </button>
                          <button
                            className="danger"
                            disabled={isBusy}
                            onClick={() =>
                              void reviewOvertime(request, "rejected")
                            }
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>
      <div className="attendance-kpis">
        <div>
          <strong>{todayRows.filter((r) => r.clock_in).length}</strong>
          <span>Clocked in today</span>
        </div>
        <div>
          <strong>
            {todayRows.filter((r) => r.clock_in && !r.clock_out).length}
          </strong>
          <span>Working now</span>
        </div>
        <div>
          <strong>
            {
              todayRows.filter(
                (r) =>
                  r.current_state === "paused" || r.current_state === "break",
              ).length
            }
          </strong>
          <span>Paused</span>
        </div>
        <div>
          <strong>{todayRows.filter((r) => r.auto_clocked_out).length}</strong>
          <span>Auto clocked out</span>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-message">{notice}</p>}
      <article className="card data-panel">
        <div className="filter-toolbar">
          <input
            aria-label="Search attendance"
            placeholder="Employee name or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <input
            aria-label="Attendance date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <select
            aria-label="Attendance status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {["present", "late", "absent", "remote", "travel", "leave"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
          <select
            aria-label="Sort attendance"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Employee name</option>
          </select>
          <button
            onClick={() => {
              setQuery("");
              setStatus("all");
              setDate("");
            }}
          >
            Clear
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Live time</th>
                <th>State</th>
                <th>GPS</th>
                <th>Source</th>
                <th>Admin controls</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const employee = row.employee as DataRow | undefined,
                  id = String(row.employee_id);
                return (
                  <tr key={String(row.id)}>
                    <td>
                      <strong>{`${employee?.first_name ?? "Employee"} ${employee?.last_name ?? ""}`}</strong>
                      <small className="table-subline">
                        {String(employee?.employee_number ?? "")}
                      </small>
                    </td>
                    <td>{String(row.attendance_date)}</td>
                    <td>
                      {row.clock_in
                        ? new Date(String(row.clock_in)).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td>
                      {row.clock_out
                        ? new Date(String(row.clock_out)).toLocaleTimeString()
                        : "Working"}
                    </td>
                    <td>
                      <strong
                        className={
                          row.clock_in && !row.clock_out ? "live-timer" : ""
                        }
                      >
                        {elapsed(row.clock_in, row.clock_out, now)}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${row.current_state ?? row.status}`}
                      >
                        {String(row.current_state ?? row.status)}
                      </span>
                    </td>
                    <td>
                      {row.latitude && row.longitude
                        ? "Captured"
                        : String(row.location_permission ?? "Not captured")}
                    </td>
                    <td>{String(row.source ?? "manual")}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => void override(id, "force_pause")}
                        >
                          Pause
                        </button>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => void override(id, "force_clock_out")}
                        >
                          Clock out
                        </button>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => void override(id, "activate_overtime")}
                        >
                          Approve OT
                        </button>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => void override(id, "set_shift_end")}
                        >
                          Shift end
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
