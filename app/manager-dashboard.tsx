import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listNamedRows, listRows } from "./lib/supabase-data";
import { QuickAttendance } from "./quick-attendance";
import { MenuIcon, IconName } from "./menu-icon";
import { moduleIcon } from "./module-icons";
import { AvatarPhoto } from "./avatar-photo";
import { StatCard, ListCard, QuickActionsGrid } from "./dashboard-cards";
import { AreaChart, DonutChart, BarChart } from "./dashboard-charts";
import { monthlyBuckets, groupCounts } from "./lib/dashboard-metrics";

type ManagerData = { team: DataRow[]; attendance: DataRow[]; leave: DataRow[]; expenses: DataRow[]; reviews: DataRow[]; tasks: DataRow[]; training: DataRow[]; announcements: DataRow[]; assets: DataRow[]; requests: DataRow[] };
const empty: ManagerData = { team: [], attendance: [], leave: [], expenses: [], reviews: [], tasks: [], training: [], announcements: [], assets: [], requests: [] };
const vizPalette = ["var(--viz-blue)", "var(--viz-purple)", "var(--viz-red)", "var(--viz-orange)", "var(--brand)", "var(--viz-slate)"];
const quickActionIcon: Record<string, IconName> = { "Approve leave": "leave", "Review attendance": "attendance", "Assign task": "task", "Start performance review": "performance", "Schedule one to one": "meeting", "Submit recruitment request": "recruitment", "Approve expense": "expense", "Assign training": "training", "Send team message": "message", "View team calendar": "calendar", "Request employee document": "audit", "Review employee requests": "help", "Open Book Library": "book" };
const quickActionColor: Record<string, "blue" | "orange" | "purple" | "slate" | "red"> = { "Approve leave": "orange", "Review attendance": "orange", "Assign task": "blue", "Start performance review": "purple", "Schedule one to one": "purple", "Submit recruitment request": "blue", "Approve expense": "purple", "Assign training": "slate", "Send team message": "purple", "View team calendar": "slate", "Request employee document": "slate", "Review employee requests": "red", "Open Book Library": "blue" };

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

  const birthdays = useMemo(() => data.team.filter((person) => { if (!person.date_of_birth) return false; const date = new Date(String(person.date_of_birth)), current = new Date(); return date.getMonth() === current.getMonth() && date.getDate() >= current.getDate(); }).slice(0, 5), [data.team]);
  const cards: [string, number, string][] = [
    ["Total team members", data.team.length, "My Team"], ["Present today", metrics.present, "Team Attendance"], ["Absent today", Math.max(0, data.team.length - metrics.present - metrics.onLeave), "Team Attendance"],
    ["On leave", metrics.onLeave, "Leave Approvals"], ["Late today", metrics.late, "Team Attendance"], ["Pending leave approvals", metrics.pendingLeave, "Leave Approvals"],
    ["Pending expense claims", metrics.pendingExpenses, "Expense Approvals"], ["Asset requests", metrics.assetRequests, "Assets"], ["Employee requests", metrics.employeeRequests, "Employee Requests"],
    ["Reviews due", metrics.reviewsDue, "Team Performance"], ["Overdue tasks", metrics.overdueTasks, "Tasks"], ["Training due", metrics.trainingDue, "Learning & Development"],
  ];

  const visibleCards = cards.filter(([label]) => label !== "Asset requests" || profile.dashboard_access.includes("Assets"));

  const quickActions: [string, string][] = [["Leave Approvals", "Approve leave"], ["Team Attendance", "Review attendance"], ["Tasks", "Assign task"], ["Team Performance", "Start performance review"], ["One to One Meetings", "Schedule one to one"], ["Recruitment & Onboarding", "Submit recruitment request"], ["Expense Approvals", "Approve expense"], ["Learning & Development", "Assign training"], ["Team Communication", "Send team message"], ["Meetings & Calendar", "View team calendar"], ["Documents", "Request employee document"], ["Employee Requests", "Review employee requests"]];
  if (profile.dashboard_access.includes("Book Library")) quickActions.push(["Book Library", "Open Book Library"]);

  const leaveTypes = useMemo(() => groupCounts(data.leave, "leave_type", 4), [data.leave]);
  const leaveSeries = useMemo(() => leaveTypes.map(([type], index) => ({ name: type, color: vizPalette[index], values: monthlyBuckets(data.leave.filter((row) => String(row.leave_type ?? "").trim() === type), "start_date", 9).values })), [data.leave, leaveTypes]);
  const leaveMonthLabels = useMemo(() => monthlyBuckets(data.leave, "start_date", 9).labels, [data.leave]);

  const departmentSlices = useMemo(() => groupCounts(data.team, "department_name", 6).map(([name, value], index) => ({ name, value, color: vizPalette[index] })), [data.team]);
  const topDepartment = departmentSlices[0];

  const attendanceTrend = useMemo(() => monthlyBuckets(data.attendance.filter((row) => ["present", "late", "remote"].includes(String(row.status))), "attendance_date", 9), [data.attendance]);

  const pendingApprovals = useMemo(() => data.leave.filter((row) => String(row.status) === "pending" && String(row.workflow_stage ?? "manager_review") === "manager_review").slice(0, 5), [data.leave]);
  const openTasks = useMemo(() => data.tasks.filter((row) => String(row.status) !== "completed").slice(0, 6), [data.tasks]);
  const publishedAnnouncements = useMemo(() => data.announcements.filter((row) => String(row.status) === "published").slice(0, 5), [data.announcements]);

  return <section className="dashboard-workspace">
    <div className="breadcrumb-trail"><span>SAS Finance Group</span><span aria-hidden="true">›</span><span>Manager Dashboard</span></div>
    <div className="home-hero-row">
      <header className="page-header">
        <div className="page-header-with-photo"><AvatarPhoto accessToken={accessToken} path={profile.avatar_path} name={profile.display_name} size={52} /><div><span className="eyebrow">Manager workspace</span><h1>Welcome back, {profile.display_name.split(" ")[0]}</h1><p className="muted">Your authorised team, approvals, performance and workload in one place.</p></div></div>
        <div className="page-header-actions"><button className="secondary" onClick={() => void load()}><MenuIcon name="report" />Refresh</button><button type="button" className="link-button" onClick={() => onNavigate("Reports & Analytics")}>Quick Actions</button></div>
      </header>
      <QuickAttendance accessToken={accessToken} profile={profile} compact />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{loading && <p className="form-message">Loading team information…</p>}
    <div className="dhv2-stat-grid">{visibleCards.map(([label, result, page]) => <StatCard key={label} label={label} value={result} onClick={() => onNavigate(page)} />)}</div>
    <div className="dhv2-chart-row">
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Leave Trends (Last 9 Months)</h2><button type="button" className="dhv2-chart-link" onClick={() => onNavigate("Leave Approvals")}>View Details ›</button></div><AreaChart series={leaveSeries} xLabels={leaveMonthLabels} /></article>
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Team Distribution</h2></div><DonutChart slices={departmentSlices} centerLabel={topDepartment ? { name: topDepartment.name, value: topDepartment.value } : undefined} /><div className="dhv2-donut-legend">{departmentSlices.map((slice) => <div className="dhv2-donut-legend-item" key={slice.name}><span>{slice.name}</span><b>{slice.value}</b></div>)}</div></article>
    </div>
    <div className="dhv2-list-row-grid">
      <ListCard title="Pending Approvals" count={pendingApprovals.length} rows={pendingApprovals.map((row) => ({ icon: "leave" as IconName, iconColor: "var(--viz-orange-strong)", title: String(row.employee_name ?? "Employee"), subtitle: `${row.leave_type ?? "Leave"} — ${row.days ?? "?"} days`, trailing: { type: "check" as const, onClick: () => onNavigate("Leave Approvals") } }))} emptyLabel="No leave requests are waiting on your approval." />
      <ListCard title="Tasks Requiring Attention" action={{ label: "View All", onClick: () => onNavigate("Tasks") }} rows={openTasks.map((row) => ({ icon: "task" as IconName, iconColor: "var(--viz-blue)", title: String(row.title ?? "Task"), subtitle: String(row.due_date ?? "No due date") }))} emptyLabel="No team tasks require attention." />
      <ListCard title="Upcoming Events" rows={birthdays.map((person) => ({ icon: "profile" as IconName, iconColor: "var(--viz-purple-strong)", title: String(person.full_name ?? "Team member"), subtitle: String(person.position_title ?? "Birthday"), trailing: { type: "pill" as const, label: new Date(String(person.date_of_birth)).toLocaleDateString("en-GB", { month: "short", day: "numeric" }) } }))} emptyLabel="No upcoming birthdays this month." />
    </div>
    <div className="dhv2-bottom-row">
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Team Attendance Trend</h2></div><BarChart values={attendanceTrend.values} xLabels={attendanceTrend.labels} /></article>
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Quick Actions</h2></div><QuickActionsGrid items={quickActions.slice(0, 6).map(([page, label]) => ({ label, icon: quickActionIcon[label] ?? moduleIcon(page), color: quickActionColor[label] ?? "slate", onClick: () => onNavigate(page) }))} /></article>
    </div>
    <div className="dashboard-content-grid">
      <article className="card panel"><div className="panel-head"><div><h2>All manager quick actions</h2><p className="muted">Common team operations</p></div></div><div className="quick dashboard-quick-grid">{quickActions.map(([page, label]) => <button key={page} onClick={() => onNavigate(page)}><span><MenuIcon name={moduleIcon(page)} /></span>{label}</button>)}</div></article>
      <article className="card panel"><div className="panel-head"><h2>Important announcements</h2></div><div className="activity">{publishedAnnouncements.map((row) => <div className="activity-row" key={String(row.id)}><div className="task-icon">i</div><p><strong>{String(row.title)}</strong><br /><span className="muted">{String(row.body ?? "").slice(0, 90)}</span></p></div>)}{!publishedAnnouncements.length && <p className="muted">No published announcements.</p>}</div></article>
      <article className="card panel"><div className="panel-head"><h2>AI manager insights</h2></div><p className="muted">AI suggestions support decisions but never approve, reject, discipline, terminate or promote employees automatically.</p></article>
    </div>
  </section>;
}
