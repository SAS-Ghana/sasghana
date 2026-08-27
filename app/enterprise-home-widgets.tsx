import { useEffect, useState } from "react";
import type { DataRow } from "./lib/supabase-data";
import { fetchProfile, readSession, type UserProfile } from "./lib/supabase-auth";
import { DashboardTodoWidget } from "./dashboard-todo-widget";

type Navigate = (page: string) => void;

function personName(row: DataRow) {
  const combined = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return String(row.full_name ?? (combined || row.employee_name || "Employee"));
}
function initials(row: DataRow) { return personName(row).split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join("").toUpperCase() || "E"; }
function pct(value: number, total: number) { return total > 0 ? Math.round(value / total * 100) : 0; }

export function EmployeeStatusWidget({ employees, onNavigate }: { employees: DataRow[]; onNavigate?: Navigate }) {
  const active = employees.filter((row) => ["active", "confirmed"].includes(String(row.employment_status).toLowerCase())).length;
  const probation = employees.filter((row) => String(row.employment_status).toLowerCase().includes("probation")).length;
  const leave = employees.filter((row) => String(row.employment_status).toLowerCase().includes("leave")).length;
  const inactive = Math.max(0, employees.length - active - probation - leave);
  const segments = [["Active", active, "var(--brand)"], ["Probation", probation, "var(--viz-orange-strong)"], ["On leave", leave, "var(--viz-purple)"], ["Inactive", inactive, "var(--viz-slate)"]] as const;
  return <article className="card enterprise-widget employee-status-widget"><header><div><h2>Employee Status</h2><p>Current workforce composition</p></div><button type="button" onClick={() => onNavigate?.("Employee Management")}>View All</button></header><div className="status-total"><span>Total employees</span><strong>{employees.length}</strong></div><div className="status-stack">{segments.map(([label, value, color]) => <span key={label} title={`${label}: ${value}`} style={{ width: `${pct(value, employees.length)}%`, background: color }} />)}</div><div className="status-grid">{segments.map(([label, value, color]) => <div key={label}><span><i style={{ background: color }} />{label} ({pct(value, employees.length)}%)</span><strong>{value}</strong></div>)}</div></article>;
}

export function AttendanceOverviewWidget({ attendance, employees, date = new Date().toISOString().slice(0, 10), onNavigate }: { attendance: DataRow[]; employees: DataRow[]; date?: string; onNavigate?: Navigate }) {
  const today = attendance.filter((row) => String(row.attendance_date) === date);
  const present = today.filter((row) => ["present", "remote"].includes(String(row.status))).length;
  const late = today.filter((row) => String(row.status) === "late").length;
  const absent = today.filter((row) => String(row.status) === "absent").length;
  const permission = Math.max(0, employees.length - present - late - absent);
  const total = Math.max(1, employees.length);
  const rows = [["Present", present, "var(--brand)"], ["Late", late, "var(--viz-orange-strong)"], ["Permission", permission, "var(--viz-purple)"], ["Absent", absent, "var(--viz-red)"]] as const;
  const p1 = pct(present, total), p2 = pct(present + late, total), p3 = pct(present + late + permission, total);
  return <article className="card enterprise-widget attendance-overview-widget"><header><div><h2>Attendance Overview</h2><p>Today&apos;s workforce attendance</p></div><button type="button" onClick={() => onNavigate?.("Attendance Management")}>Today</button></header><div className="attendance-gauge" style={{ background: `conic-gradient(var(--brand) 0 ${p1}%, var(--viz-orange-strong) ${p1}% ${p2}%, var(--viz-purple) ${p2}% ${p3}%, var(--viz-red) ${p3}% 100%)` }}><div><span>Total Attendance</span><strong>{present + late}</strong></div></div><div className="attendance-legend">{rows.map(([label, value, color]) => <div key={label}><span><i style={{ background: color }} />{label}</span><strong>{pct(value, total)}%</strong></div>)}</div><button type="button" className="enterprise-full-button" onClick={() => onNavigate?.("Live Attendance")}>View all attendance</button></article>;
}

export function DepartmentBarsWidget({ employees, onNavigate }: { employees: DataRow[]; onNavigate?: Navigate }) {
  const counts = new Map<string, number>();
  employees.forEach((row) => { const key = String(row.department_name || "Unassigned"); counts.set(key, (counts.get(key) || 0) + 1); });
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7), max = Math.max(1, ...[...counts.values()]);
  return <article className="card enterprise-widget department-bars-widget"><header><div><h2>Employees By Department</h2><p>Live organisational distribution</p></div><button type="button" onClick={() => onNavigate?.("Organization Structure")}>View</button></header><div className="department-bars">{rows.map(([name, value]) => <div key={name}><span>{name}</span><div><i style={{ width: `${Math.max(6, value / max * 100)}%` }} /></div><strong>{value}</strong></div>)}{!rows.length && <p className="empty-widget">No department assignments yet.</p>}</div></article>;
}

export function ClockInOutWidget({ employees, attendance, onNavigate }: { employees: DataRow[]; attendance: DataRow[]; onNavigate?: Navigate }) {
  const today = new Date().toISOString().slice(0, 10), rows = attendance.filter((row) => String(row.attendance_date) === today).slice(0, 6), byId = new Map(employees.map((row) => [String(row.id), row]));
  return <article className="card enterprise-widget clock-widget"><header><div><h2>Clock In / Out</h2><p>Latest employee attendance today</p></div><button type="button" onClick={() => onNavigate?.("Live Attendance")}>Today</button></header><div className="clock-list">{rows.map((row) => { const employee = byId.get(String(row.employee_id)) || row; return <div className="clock-person" key={String(row.id)}><span className="enterprise-avatar">{initials(employee)}</span><div><strong>{personName(employee)}</strong><small>{String(employee.position_title ?? row.status ?? "Employee")}</small></div><span className={`clock-time ${row.clock_out ? "clock-out" : "clock-in"}`}>{String(row.clock_out ?? row.clock_in ?? "—").slice(11, 16)}</span></div>; })}{!rows.length && <p className="empty-widget">No attendance activity recorded today.</p>}</div><button type="button" className="enterprise-full-button" onClick={() => onNavigate?.("Live Attendance")}>View all attendance</button></article>;
}

function jobTitle(row: DataRow) { return String(row.title ?? row.position_title ?? row.job_title ?? "Vacancy"); }

export function RecruitmentWidget({ jobs, candidates, applications, employees, onNavigate }: { jobs: DataRow[]; candidates?: DataRow[]; applications?: DataRow[]; employees?: DataRow[]; onNavigate?: Navigate }) {
  const applicants = applications?.length ? applications : (candidates ?? []);
  const openings = jobs.filter((row) => ["open", "published"].includes(String(row.status)));
  // An internal_job_applications row carries only employee_id and job_opening_id, so reading a name
  // straight off it produced "Employee" applying for "Applicant" on every real application. Resolve
  // both against the lists the dashboard already loaded. Candidate rows carry their own names and
  // fall through these lookups unchanged.
  const employeeById = new Map((employees ?? []).map((row) => [String(row.id), row]));
  const jobById = new Map(jobs.map((row) => [String(row.id), row]));
  const applicantName = (row: DataRow) => {
    const employee = employeeById.get(String(row.employee_id ?? ""));
    return employee ? personName(employee) : personName(row);
  };
  const appliedFor = (row: DataRow) =>
    String(jobById.get(String(row.job_opening_id ?? ""))?.title
      ?? row.position_title ?? row.job_title ?? row.role ?? "Applicant");
  // These two were plain <span>s, one with a hardcoded "active" class: the tabs could not be
  // switched, and the panel below only ever rendered applicants -- so vacancies never appeared on
  // the dashboard at all. Openings leads, since that is the side with data far more often.
  const [tab, setTab] = useState<"openings" | "applicants">("openings");

  return <article className="card enterprise-widget recruitment-widget">
    <header>
      <div><h2>Jobs &amp; Applicants</h2><p>{openings.length} open roles · {applicants.length} applicants</p></div>
      <button type="button" onClick={() => onNavigate?.("Recruitment")}>View All</button>
    </header>
    <div className="recruitment-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "openings"} className={tab === "openings" ? "active" : ""} onClick={() => setTab("openings")}>Openings</button>
      <button type="button" role="tab" aria-selected={tab === "applicants"} className={tab === "applicants" ? "active" : ""} onClick={() => setTab("applicants")}>Applicants</button>
    </div>
    {tab === "openings"
      ? <div className="applicant-list">
          {openings.slice(0, 5).map((row) => <div key={String(row.id)}>
            <span className="enterprise-avatar">{jobTitle(row).slice(0, 1).toUpperCase()}</span>
            <div><strong>{jobTitle(row)}</strong><small>{[row.employment_type, row.location].filter(Boolean).join(" · ") || String(row.status ?? "Open")}</small></div>
            <em>{Number(row.openings ?? 1)} {Number(row.openings ?? 1) === 1 ? "opening" : "openings"}</em>
          </div>)}
          {!openings.length && <p className="empty-widget">No open roles yet.</p>}
        </div>
      : <div className="applicant-list">
          {applicants.slice(0, 5).map((row) => <div key={String(row.id)}>
            <span className="enterprise-avatar">{applicantName(row).split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join("").toUpperCase() || "A"}</span>
            <div><strong>{applicantName(row)}</strong><small>{String(row.stage ?? row.status ?? "Application")}</small></div>
            <em>{appliedFor(row)}</em>
          </div>)}
          {!applicants.length && <p className="empty-widget">No applicants yet.</p>}
        </div>}
  </article>;
}

export function EmployeesListWidget({ employees, onNavigate }: { employees: DataRow[]; onNavigate?: Navigate }) {
  return <article className="card enterprise-widget employees-list-widget"><header><div><h2>Employees</h2><p>Recently active workforce records</p></div><button type="button" onClick={() => onNavigate?.("Employee Management")}>View All</button></header><div className="enterprise-person-list">{employees.slice(0, 6).map((row) => <div key={String(row.id)}><span className="enterprise-avatar">{initials(row)}</span><div><strong>{personName(row)}</strong><small>{String(row.position_title ?? row.employment_status ?? "Employee")}</small></div><em>{String(row.department_name ?? "Unassigned")}</em></div>)}{!employees.length && <p className="empty-widget">No employee records yet.</p>}</div></article>;
}

export function TasksWidget({ tasks, onNavigate }: { tasks: DataRow[]; onNavigate?: Navigate }) {
  const [sessionToken, setSessionToken] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) return;
    setSessionToken(session.access_token);
    void fetchProfile(session.access_token, session.user.id).then((next) => {
      if (next) setProfile(next);
    }).catch(() => undefined);
  }, []);

  if (sessionToken && profile) return <DashboardTodoWidget accessToken={sessionToken} profile={profile} assignedTasks={tasks} />;

  const open = tasks.filter((row) => !["completed", "closed", "cancelled"].includes(String(row.status))).slice(0, 6);
  return <article className="card enterprise-widget tasks-widget"><header><div><h2>Todo</h2><p>Loading your Todo workspace…</p></div><button type="button" onClick={() => onNavigate?.("Tasks")}>Assigned Tasks</button></header><div className="enterprise-task-list">{open.map((row, index) => <button type="button" onClick={() => onNavigate?.("Tasks")} key={String(row.id)}><i style={{ background: ["var(--brand)", "var(--viz-purple)", "var(--viz-orange-strong)", "var(--viz-red)"][index % 4] }} /><span>{String(row.title ?? "Task")}</span><small>{String(row.due_date ?? row.status ?? "Open")}</small></button>)}{!open.length && <p className="empty-widget">No open assigned tasks.</p>}</div></article>;
}

export function ScheduleWidget({ meetings, holidays, onNavigate }: { meetings: DataRow[]; holidays?: DataRow[]; onNavigate?: Navigate }) {
  // Typed explicitly: spreading DataRow and adding known keys widens the inferred element type to
  // just the added keys, so row.id -- which is present at runtime from the spread -- did not
  // typecheck, leaving a standing error in the build.
  const combined: DataRow[] = [...meetings.map((row) => ({ ...row, event_title: row.title, event_date: row.starts_at, kind: "Meeting" })), ...(holidays ?? []).map((row) => ({ ...row, event_title: row.name, event_date: row.holiday_date, kind: "Holiday" }))].filter((row) => row.event_date && new Date(String(row.event_date)).getTime() >= Date.now() - 86400000).sort((a, b) => new Date(String(a.event_date)).getTime() - new Date(String(b.event_date)).getTime()).slice(0, 4);
  return <article className="card enterprise-widget schedules-widget"><header><div><h2>Schedules</h2><p>Upcoming meetings and company events</p></div><button type="button" onClick={() => onNavigate?.("Meetings & Calendar")}>View All</button></header><div className="schedule-list">{combined.map((row) => <div key={`${row.kind}-${row.id}`}><span>{String(row.kind)}</span><strong>{String(row.event_title ?? "Event")}</strong><small>{new Date(String(row.event_date)).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div>)}{!combined.length && <p className="empty-widget">No upcoming schedules.</p>}</div></article>;
}

export function RecentActivityWidget({ rows, onNavigate }: { rows: DataRow[]; onNavigate?: Navigate }) {
  return <article className="card enterprise-widget recent-activity-widget"><header><div><h2>Recent Activities</h2><p>Latest recorded system activity</p></div><button type="button" onClick={() => onNavigate?.("Audit Logs")}>View All</button></header><div className="activity-list">{rows.slice(0, 7).map((row) => <div key={String(row.id)}><span className="activity-dot" /><div><strong>{String(row.actor_name ?? row.user_name ?? row.action ?? "System activity")}</strong><small>{String(row.description ?? row.action ?? row.event_type ?? "Activity recorded")}</small></div><time>{row.created_at ? new Date(String(row.created_at)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}</time></div>)}{!rows.length && <p className="empty-widget">No recent activity.</p>}</div></article>;
}

export function BirthdaysWidget({ employees, onNavigate }: { employees: DataRow[]; onNavigate?: Navigate }) {
  const current = new Date();
  const upcoming = employees.filter((row) => row.date_of_birth).map((row) => { const dob = new Date(String(row.date_of_birth)); const next = new Date(current.getFullYear(), dob.getMonth(), dob.getDate()); if (next < current) next.setFullYear(next.getFullYear() + 1); return { row, next }; }).sort((a, b) => a.next.getTime() - b.next.getTime()).slice(0, 5);
  return <article className="card enterprise-widget birthdays-widget"><header><div><h2>Birthdays</h2><p>Upcoming employee birthdays</p></div><button type="button" onClick={() => onNavigate?.("Employee Management")}>View All</button></header><div className="birthday-list">{upcoming.map(({ row, next }) => <div key={String(row.id)}><span className="enterprise-avatar">{initials(row)}</span><div><strong>{personName(row)}</strong><small>{String(row.position_title ?? "Employee")}</small></div><em>{next.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</em></div>)}{!upcoming.length && <p className="empty-widget">No birthday data available.</p>}</div></article>;
}
