import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listNamedRows, listRows } from "./lib/supabase-data";
import { QuickAttendance } from "./quick-attendance";
import { MenuIcon, IconName } from "./menu-icon";
import { moduleIcon } from "./module-icons";
import { AvatarPhoto } from "./avatar-photo";
import { StatCard, ListCard, QuickActionsGrid } from "./dashboard-cards";
import { AreaChart, BarChart } from "./dashboard-charts";
import { monthlyBuckets, groupCounts } from "./lib/dashboard-metrics";
import { realtimeClient } from "./lib/supabase-realtime";
import { AttendanceOverviewWidget, BirthdaysWidget, ClockInOutWidget, DepartmentBarsWidget, EmployeeStatusWidget, EmployeesListWidget, ScheduleWidget, TasksWidget } from "./enterprise-home-widgets";

type ManagerData = { team: DataRow[]; attendance: DataRow[]; leave: DataRow[]; expenses: DataRow[]; reviews: DataRow[]; tasks: DataRow[]; training: DataRow[]; announcements: DataRow[]; assets: DataRow[]; requests: DataRow[]; purchases: DataRow[]; meetings: DataRow[]; holidays: DataRow[] };
const empty: ManagerData = { team: [], attendance: [], leave: [], expenses: [], reviews: [], tasks: [], training: [], announcements: [], assets: [], requests: [], purchases: [], meetings: [], holidays: [] };
const vizPalette = ["var(--brand)", "var(--viz-purple)", "var(--viz-red)", "var(--viz-orange)", "var(--viz-blue)", "var(--viz-slate)"];
const quickActionIcon: Record<string, IconName> = { "Approve leave": "leave", "Review attendance": "attendance", "Assign task": "task", "Start performance review": "performance", "Schedule one to one": "meeting", "Submit recruitment request": "recruitment", "Approve expense": "expense", "Review purchase requests": "asset", "Assign training": "training", "Send team message": "message", "Request employee document": "audit", "Review employee requests": "help" };

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
        try { return (await listRows(accessToken, table, "*", 500)).filter((row) => teamIds.has(String(row[key] ?? row.employee_id ?? row.assigned_to_employee_id ?? row.subject_employee_id))); }
        catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }
      };
      const read = async (table: string, limit = 100) => { try { return await listRows(accessToken, table, "*", limit); } catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; } };
      const [attendance, leave, expenses, reviews, tasks, training, announcements, assets, requests, purchases, meetings, holidays] = await Promise.all([
        scoped("attendance_records"), scoped("leave_requests"), scoped("expense_claims"), scoped("performance_reviews"), scoped("tasks", "assigned_to_employee_id"), scoped("employee_training"), read("announcements", 30), scoped("asset_requests"), scoped("hr_requests"), read("purchase_requests", 200), read("meetings", 100), read("company_holidays", 100),
      ]);
      setData({ team, attendance, leave, expenses, reviews, tasks, training, announcements, assets, requests, purchases, meetings, holidays });
      if (issues.length) setError(`Some manager data could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Manager dashboard could not be loaded."); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);
  useEffect(() => {
    const client = realtimeClient(accessToken);
    let channel = client.channel(`manager-dashboard-${profile.organisation_id}-${profile.id}`);
    for (const table of ["attendance_records", "leave_requests", "expense_claims", "performance_reviews", "tasks", "employee_training", "asset_requests", "hr_requests", "purchase_requests", "meetings", "company_holidays"]) channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `organisation_id=eq.${profile.organisation_id}` }, () => void load());
    channel.subscribe();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { window.clearInterval(timer); void client.removeChannel(channel); };
  }, [accessToken, load, profile.id, profile.organisation_id]);

  const today = new Date().toISOString().slice(0, 10);
  const metrics = useMemo(() => {
    const todayRows = data.attendance.filter((row) => String(row.attendance_date) === today);
    return {
      present: todayRows.filter((row) => ["present", "late", "remote"].includes(String(row.status))).length,
      late: todayRows.filter((row) => String(row.status) === "late").length,
      onLeave: data.leave.filter((row) => String(row.status) === "approved" && String(row.start_date) <= today && String(row.end_date) >= today).length,
      pendingLeave: data.leave.filter((row) => String(row.status) === "pending").length,
      pendingExpenses: data.expenses.filter((row) => ["submitted", "pending", "manager_review"].includes(String(row.status))).length,
      overdueTasks: data.tasks.filter((row) => String(row.status) !== "completed" && row.due_date && String(row.due_date) < today).length,
      purchaseRequests: data.purchases.filter((row) => ["pending_manager", "pending_procurement", "clarification_requested"].includes(String(row.status))).length,
    };
  }, [data, today]);

  const cards: [string, number, string][] = [
    ["Team Members", data.team.length, "My Team"], ["Present Today", metrics.present, "Team Attendance"], ["On Leave", metrics.onLeave, "Leave Approvals"], ["Late Today", metrics.late, "Team Attendance"],
    ["Leave Approvals", metrics.pendingLeave, "Leave Approvals"], ["Expense Claims", metrics.pendingExpenses, "Expense Approvals"], ["Purchase Requests", metrics.purchaseRequests, "Purchase Approvals"], ["Overdue Tasks", metrics.overdueTasks, "Tasks"],
  ];
  const quickActions: [string, string][] = [["Leave Approvals", "Approve leave"], ["Team Attendance", "Review attendance"], ["Tasks", "Assign task"], ["Team Performance", "Start performance review"], ["Meetings & Calendar", "Schedule one to one"], ["Recruitment & Onboarding", "Submit recruitment request"], ["Expense Approvals", "Approve expense"], ["Purchase Approvals", "Review purchase requests"], ["Learning & Development", "Assign training"], ["Team Communication", "Send team message"]];
  const leaveTypes = useMemo(() => groupCounts(data.leave, "leave_type", 4), [data.leave]);
  const leaveSeries = useMemo(() => leaveTypes.map(([type], index) => ({ name: type, color: vizPalette[index], values: monthlyBuckets(data.leave.filter((row) => String(row.leave_type ?? "").trim() === type), "start_date", 9).values })), [data.leave, leaveTypes]);
  const leaveMonthLabels = useMemo(() => monthlyBuckets(data.leave, "start_date", 9).labels, [data.leave]);
  const attendanceTrend = useMemo(() => monthlyBuckets(data.attendance.filter((row) => ["present", "late", "remote"].includes(String(row.status))), "attendance_date", 9), [data.attendance]);
  const pendingApprovals = data.leave.filter((row) => String(row.status) === "pending").slice(0, 5);

  return <section className="dashboard-workspace enterprise-dashboard-home">
    <div className="breadcrumb-trail"><span>SAS Finance Group</span><span aria-hidden="true">›</span><span>Manager Dashboard</span></div>
    <div className="home-hero-row"><header className="page-header"><div className="page-header-with-photo"><AvatarPhoto accessToken={accessToken} path={profile.avatar_path} name={profile.display_name} size={52} /><div><span className="eyebrow">Manager workspace</span><h1>Welcome back, {profile.display_name.split(" ")[0]}</h1><p className="muted">You have {metrics.pendingLeave + metrics.pendingExpenses + metrics.purchaseRequests} pending approval{metrics.pendingLeave + metrics.pendingExpenses + metrics.purchaseRequests === 1 ? "" : "s"} and {metrics.overdueTasks} overdue task{metrics.overdueTasks === 1 ? "" : "s"}.</p></div></div><div className="page-header-actions"><button className="secondary" onClick={() => onNavigate("Meetings & Calendar")}><MenuIcon name="calendar" />Add Schedule</button><button className="primary" onClick={() => onNavigate("Tasks")}><MenuIcon name="task" />Add Task</button></div></header><QuickAttendance accessToken={accessToken} profile={profile} compact /></div>
    {error && <p className="form-error" role="alert">{error}</p>}{loading && <p className="form-message">Loading team information…</p>}
    <div className="dhv2-stat-grid enterprise-kpi-grid">{cards.map(([label, result, page]) => <StatCard key={label} label={label} value={result} onClick={() => onNavigate(page)} />)}</div>
    <div className="enterprise-home-section-title"><div><h2>Team overview</h2><p>Live team status, attendance, workload and schedules.</p></div></div>
    <div className="enterprise-home-grid">
      <EmployeeStatusWidget employees={data.team} onNavigate={() => onNavigate("My Team")} />
      <AttendanceOverviewWidget attendance={data.attendance} employees={data.team} onNavigate={() => onNavigate("Team Attendance")} />
      <ClockInOutWidget attendance={data.attendance} employees={data.team} onNavigate={() => onNavigate("Team Attendance")} />
      <DepartmentBarsWidget employees={data.team} onNavigate={() => onNavigate("My Team")} />
      <EmployeesListWidget employees={data.team} onNavigate={() => onNavigate("My Team")} />
      <TasksWidget tasks={data.tasks} onNavigate={() => onNavigate("Tasks")} />
      <ScheduleWidget meetings={data.meetings} holidays={data.holidays} onNavigate={() => onNavigate("Meetings & Calendar")} />
      <BirthdaysWidget employees={data.team} onNavigate={() => onNavigate("My Team")} />
    </div>
    <div className="enterprise-home-section-title"><div><h2>Approvals & trends</h2><p>Leave trends, attendance movement and manager actions.</p></div></div>
    <div className="dhv2-chart-row"><article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Leave Trends</h2><button type="button" className="dhv2-chart-link" onClick={() => onNavigate("Leave Approvals")}>View Details ›</button></div><AreaChart series={leaveSeries} xLabels={leaveMonthLabels} /></article><article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Team Attendance Trend</h2></div><BarChart values={attendanceTrend.values} xLabels={attendanceTrend.labels} /></article></div>
    <div className="dhv2-list-row-grid"><ListCard title="Pending Approvals" count={pendingApprovals.length} rows={pendingApprovals.map((row) => ({ icon: "leave" as IconName, iconColor: "var(--viz-orange-strong)", title: String(row.employee_name ?? "Employee"), subtitle: `${row.leave_type ?? "Leave"} — ${row.days ?? "?"} days`, trailing: { type: "check" as const, onClick: () => onNavigate("Leave Approvals") } }))} emptyLabel="No leave requests are waiting on your approval." /><ListCard title="Announcements" rows={data.announcements.filter((row) => String(row.status) === "published").slice(0, 5).map((row) => ({ icon: "announcement" as IconName, iconColor: "var(--brand)", title: String(row.title ?? "Announcement"), subtitle: String(row.body ?? "").slice(0, 90) }))} emptyLabel="No announcements have been published." /><article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Quick Actions</h2></div><QuickActionsGrid items={quickActions.slice(0, 6).map(([page, label]) => ({ label, icon: quickActionIcon[label] ?? moduleIcon(page), color: "blue" as const, onClick: () => onNavigate(page) }))} /></article></div>
  </section>;
}
