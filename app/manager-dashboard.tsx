import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listNamedRows, listRows } from "./lib/supabase-data";
import { DashboardInsights, MiniTrend } from "./dashboard-insights";
import { QuickAttendance } from "./quick-attendance";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type ManagerData = { team: DataRow[]; attendance: DataRow[]; leave: DataRow[]; expenses: DataRow[]; reviews: DataRow[]; tasks: DataRow[]; training: DataRow[]; announcements: DataRow[]; assets: DataRow[]; requests: DataRow[] };
const empty: ManagerData = { team: [], attendance: [], leave: [], expenses: [], reviews: [], tasks: [], training: [], announcements: [], assets: [], requests: [] };

export function ManagerDashboard({ accessToken, profile, onNavigate }: { accessToken: string; profile: UserProfile; onNavigate: (page: string) => void }) {
  const [data, setData] = useState<ManagerData>(empty);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const team = await listNamedRows(accessToken, "managed_team_directory", "*", "full_name");
      const teamIds = new Set(team.map((row) => String(row.id)));
      const issues: string[] = [];
      const scoped = async (table: string, key = "employee_id") => {
        try {
          return (await listRows(accessToken, table, "*", 500)).filter((row) => teamIds.has(String(row[key] ?? row.employee_id ?? row.assigned_to_employee_id ?? row.subject_employee_id)));
        } catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }
      };
      const read = async (table: string, limit = 100) => { try { return await listRows(accessToken, table, "*", limit); } catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; } };
      const [attendance, leave, expenses, reviews, tasks, training, announcements, assets, requests] = await Promise.all([
        scoped("attendance_records"), scoped("leave_requests"), scoped("expense_claims"), scoped("performance_reviews"),
        scoped("tasks", "assigned_to_employee_id"), scoped("employee_training"), read("announcements", 30), scoped("asset_requests"), scoped("hr_requests"),
      ]);
      setData({ team, attendance, leave, expenses, reviews, tasks, training, announcements, assets, requests });
      if (issues.length) setError(`Some manager data could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Manager dashboard could not be loaded."); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const metrics = useMemo(() => {
    const todayRows = data.attendance.filter((row) => String(row.attendance_date) === today);
    return {
      present: todayRows.filter((row) => ["present", "late", "remote"].includes(String(row.status))).length,
      late: todayRows.filter((row) => String(row.status) === "late").length,
      onLeave: data.leave.filter((row) => String(row.status) === "approved" && String(row.start_date) <= today && String(row.end_date) >= today).length,
      pendingLeave: data.leave.filter((row) => String(row.status) === "pending" && String(row.workflow_stage ?? "manager_review") === "manager_review").length,
      pendingExpenses: data.expenses.filter((row) => ["submitted", "pending", "manager_review"].includes(String(row.status))).length,
      reviewsDue: data.reviews.filter((row) => ["draft", "self_assessment", "manager_review", "in_progress"].includes(String(row.status))).length,
      overdueTasks: data.tasks.filter((row) => String(row.status) !== "completed" && row.due_date && String(row.due_date) < today).length,
      trainingDue: data.training.filter((row) => String(row.status) !== "completed" && row.due_date && String(row.due_date) <= today).length,
      assetRequests: data.assets.filter((row) => ["pending", "manager_review"].includes(String(row.status))).length,
      employeeRequests: data.requests.filter((row) => !["closed", "resolved", "rejected"].includes(String(row.status))).length,
    };
  }, [data, today]);

  const trend = Array.from({ length: 6 }, (_, offset) => { const date = new Date(); date.setDate(date.getDate() - (5 - offset)); const key = date.toISOString().slice(0, 10); return data.attendance.filter((row) => String(row.attendance_date) === key && ["present", "late", "remote"].includes(String(row.status))).length; });
  const birthdays = data.team.filter((person) => { if (!person.date_of_birth) return false; const date = new Date(String(person.date_of_birth)), current = new Date(); return date.getMonth() === current.getMonth() && date.getDate() >= current.getDate(); }).slice(0, 5);
  const cards: [string, number, string][] = [
    ["Total team members", data.team.length, "My Team"], ["Present today", metrics.present, "Team Attendance"], ["Absent today", Math.max(0, data.team.length - metrics.present - metrics.onLeave), "Team Attendance"],
    ["On leave", metrics.onLeave, "Leave Approvals"], ["Late today", metrics.late, "Team Attendance"], ["Pending leave approvals", metrics.pendingLeave, "Leave Approvals"],
    ["Pending expense claims", metrics.pendingExpenses, "Expense Approvals"], ["Asset requests", metrics.assetRequests, "Assets"], ["Employee requests", metrics.employeeRequests, "Employee Requests"],
    ["Reviews due", metrics.reviewsDue, "Team Performance"], ["Overdue tasks", metrics.overdueTasks, "Tasks"], ["Training due", metrics.trainingDue, "Learning & Development"],
  ];

  const quickActions: [string, string][] = [["Leave Approvals", "Approve leave"], ["Team Attendance", "Review attendance"], ["Tasks", "Assign task"], ["Team Performance", "Start performance review"], ["One to One Meetings", "Schedule one to one"], ["Recruitment & Onboarding", "Submit recruitment request"], ["Expense Approvals", "Approve expense"], ["Learning & Development", "Assign training"], ["Team Communication", "Send team message"], ["Meetings & Calendar", "View team calendar"], ["Documents", "Request employee document"], ["Employee Requests", "Review employee requests"]];
  if (profile.dashboard_access.includes("Book Library")) quickActions.push(["Book Library", "Open Book Library"]);

  return <section className="dashboard-workspace">
    <header className="page-header"><div><span className="eyebrow">Manager workspace</span><h1>Welcome back, {profile.display_name.split(" ")[0]}</h1><p className="muted">Your authorised team, approvals, performance and workload in one place.</p></div><button className="secondary" onClick={() => void load()}>Refresh</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{loading && <p className="form-message">Loading team information…</p>}
    <QuickAttendance accessToken={accessToken} profile={profile} />
    <div className="dashboard-metric-grid">{cards.map(([label, result, page]) => <button className="card metric dashboard-metric-card" key={label} onClick={() => onNavigate(page)}><span className="metric-top"><i className="metric-icon-chip"><MenuIcon name={moduleIcon(page)} /></i>{label}</span><strong>{result}</strong><small>Open module</small></button>)}</div>
    <div className="dashboard-chart-grid"><DashboardInsights title="Team workload summary" items={[{ label: "Present today", value: metrics.present, max: Math.max(data.team.length, 1), detail: `${data.team.length} team members` }, { label: "Pending leave", value: metrics.pendingLeave, max: Math.max(data.team.length, 1) }, { label: "Reviews due", value: metrics.reviewsDue, max: Math.max(data.team.length, 1) }, { label: "Overdue tasks", value: metrics.overdueTasks, max: Math.max(data.tasks.length, 1) }]} /><MiniTrend title="Six day attendance" values={trend} /></div>
    <div className="quick dashboard-quick-grid manager-quick">{quickActions.map(([page, label]) => <button key={page} onClick={() => onNavigate(page)}><span><MenuIcon name={moduleIcon(page)} /></span>{label}</button>)}</div>
    <div className="dashboard-content-grid">
      <article className="card panel"><div className="panel-head"><h2>Tasks requiring attention</h2><button className="text-btn" onClick={() => onNavigate("Tasks")}>View all</button></div><div className="tasks">{data.tasks.filter((row) => String(row.status) !== "completed").slice(0, 6).map((row) => <div className="task" key={String(row.id)}><div className="task-icon">✓</div><div><strong>{String(row.title ?? "Task")}</strong><small>{String(row.due_date ?? "No due date")}</small></div><span className="badge">{String(row.priority ?? row.status ?? "open")}</span></div>)}{!data.tasks.some((row) => String(row.status) !== "completed") && <p className="muted">No team tasks require attention.</p>}</div></article>
      <article className="card panel"><div className="panel-head"><h2>Upcoming birthdays</h2></div><div className="activity">{birthdays.map((person) => <div className="activity-row" key={String(person.id)}><div className="avatar">{String(person.full_name ?? "TM").slice(0, 2).toUpperCase()}</div><p><strong>{String(person.full_name)}</strong><br /><span className="muted">{String(person.position_title ?? "Team member")}</span></p><time>{new Date(String(person.date_of_birth)).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}</time></div>)}{!birthdays.length && <p className="muted">No upcoming birthdays this month.</p>}</div></article>
      <article className="card panel"><div className="panel-head"><h2>Important announcements</h2></div><div className="activity">{data.announcements.filter((row) => String(row.status) === "published").slice(0, 5).map((row) => <div className="activity-row" key={String(row.id)}><div className="task-icon">i</div><p><strong>{String(row.title)}</strong><br /><span className="muted">{String(row.body ?? "").slice(0, 90)}</span></p></div>)}{!data.announcements.some((row) => String(row.status) === "published") && <p className="muted">No published announcements.</p>}</div></article>
      <article className="card panel"><div className="panel-head"><h2>AI manager insights</h2></div><p className="muted">AI suggestions support decisions but never approve, reject, discipline, terminate or promote employees automatically.</p></article>
    </div>
  </section>;
}
