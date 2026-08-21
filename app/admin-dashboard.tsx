import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows } from "./lib/supabase-data";
import { QuickAttendance } from "./quick-attendance";
import { MenuIcon, IconName } from "./menu-icon";
import { moduleIcon } from "./module-icons";
import { AvatarPhoto } from "./avatar-photo";
import { StatCard, ListCard, QuickActionsGrid } from "./dashboard-cards";
import { AreaChart, BarChart } from "./dashboard-charts";
import { monthlyBuckets, monthlyCumulative, groupCounts } from "./lib/dashboard-metrics";
import { realtimeClient } from "./lib/supabase-realtime";
import { AttendanceOverviewWidget, BirthdaysWidget, ClockInOutWidget, DepartmentBarsWidget, EmployeeStatusWidget, EmployeesListWidget, RecentActivityWidget, RecruitmentWidget, ScheduleWidget, TasksWidget } from "./enterprise-home-widgets";

type Props = { accessToken: string; profile: UserProfile; onNavigate: (label: string) => void };
const emptyRows: DataRow[] = [];
const vizPalette = ["var(--brand)", "var(--viz-purple)", "var(--viz-red)", "var(--viz-orange)", "var(--viz-blue)", "var(--viz-slate)"];
const quickActions: [string, string, IconName][] = [
  ["Add Employee", "Employee Management", "user-plus"], ["Live Attendance", "Live Attendance", "attendance"], ["Invite User", "User & Account Management", "mail"], ["Assign Role", "Roles & Permissions", "badge"],
  ["Start Onboarding", "Onboarding", "recruitment"], ["Review Leave", "Leave Management", "leave"], ["Open Payroll", "Payroll & Payslips", "payroll"], ["Create Vacancy", "Recruitment", "briefcase"],
  ["Generate Document", "Documents & Templates", "audit"], ["Publish Announcement", "Communication", "announcement"], ["Backup & Restore", "Settings Centre", "backup"], ["View Audit Logs", "Audit Logs", "compliance"],
];

export function AdminDashboard({ accessToken, profile, onNavigate }: Props) {
  const [data, setData] = useState<Record<string, DataRow[]>>({});
  const [error, setError] = useState("");
  const [dashboardNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setError("");
    const issues: string[] = [];
    const read = async (table: string, limit = 1000, orderColumn = "created_at") => { try { return await listRows(accessToken, table, "*", limit, orderColumn); } catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; } };
    const [employees, profiles, attendance, leave, jobs, applications, onboarding, offboarding, reviews, documents, tickets, audit, announcements, expenses, assetRequests, benefits, payroll, tasks, meetings, holidays, deletedRecords, backups] = await Promise.all([
      read("employees"), read("profiles"), read("attendance_records"), read("leave_requests"), read("job_openings"), read("internal_job_applications"), read("employee_onboarding"), read("employee_offboarding"),
      read("performance_reviews"), read("employee_documents"), read("support_tickets"), read("audit_logs", 100), read("announcements", 50), read("expense_claims"), read("asset_requests"), read("employee_benefits"),
      read("payroll_records"), read("tasks"), read("meetings"), read("company_holidays"), read("deleted_records", 250, "deleted_at"), read("backup_records", 100),
    ]);
    setData({ employees, profiles, attendance, leave, jobs, applications, onboarding, offboarding, reviews, documents, tickets, audit, announcements, expenses, assetRequests, benefits, payroll, tasks, meetings, holidays, deletedRecords, backups });
    if (issues.length) setError(`Some administrator data could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);
  useEffect(() => {
    const client = realtimeClient(accessToken);
    let channel = client.channel(`admin-dashboard-${profile.organisation_id}-${profile.id}`);
    for (const table of ["employees", "profiles", "attendance_records", "leave_requests", "expense_claims", "asset_requests", "employee_benefits", "payroll_records", "job_openings", "internal_job_applications", "employee_onboarding", "employee_offboarding", "performance_reviews", "employee_documents", "support_tickets", "tasks", "meetings", "announcements"]) channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `organisation_id=eq.${profile.organisation_id}` }, () => void load());
    channel.subscribe();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { window.clearInterval(timer); void client.removeChannel(channel); };
  }, [accessToken, load, profile.id, profile.organisation_id]);

  const today = new Date().toISOString().slice(0, 10);
  const employees = data.employees ?? emptyRows, profiles = data.profiles ?? emptyRows, attendance = data.attendance ?? emptyRows, leave = data.leave ?? emptyRows, jobs = data.jobs ?? emptyRows, applications = data.applications ?? emptyRows;
  const payroll = data.payroll ?? emptyRows, tasks = data.tasks ?? emptyRows, audit = data.audit ?? emptyRows, announcements = data.announcements ?? emptyRows;
  const present = attendance.filter((row) => String(row.attendance_date) === today && ["present", "late", "remote"].includes(String(row.status))).length;
  const pendingApprovals = leave.filter((row) => String(row.status) === "pending").length + (data.expenses ?? []).filter((row) => ["submitted", "manager_approved", "hr_approved"].includes(String(row.status))).length;
  const cards: [string, string | number, string][] = [
    ["Attendance Overview", `${present}/${employees.length}`, "Live Attendance"], ["Total Employees", employees.length, "Employee Management"], ["Active Users", profiles.filter((row) => String(row.status || "active") === "active").length, "User & Account Management"],
    ["Pending Approvals", pendingApprovals, "Approval Workflows"], ["Open Vacancies", jobs.filter((row) => ["open", "published"].includes(String(row.status))).length, "Recruitment"], ["Applicants", applications.length, "Recruitment"],
    ["Payroll Drafts", payroll.filter((row) => ["draft", "calculated", "approved"].includes(String(row.status))).length, "Payroll & Payslips"], ["Open Tasks", tasks.filter((row) => !["completed", "closed", "cancelled"].includes(String(row.status))).length, "Tasks"],
  ];
  const leaveTypes = useMemo(() => groupCounts(leave, "leave_type", 4), [leave]);
  const leaveSeries = useMemo(() => leaveTypes.map(([type], index) => ({ name: type, color: vizPalette[index], values: monthlyBuckets(leave.filter((row) => String(row.leave_type ?? "").trim() === type), "start_date", 9).values })), [leave, leaveTypes]);
  const leaveMonthLabels = useMemo(() => monthlyBuckets(leave, "start_date", 9).labels, [leave]);
  const headcount = useMemo(() => monthlyCumulative(employees, "start_date", 7), [employees]);
  const expiringDocuments = (data.documents ?? []).filter((row) => row.expiry_date && new Date(String(row.expiry_date)).getTime() >= dashboardNow && new Date(String(row.expiry_date)).getTime() - dashboardNow < 30 * 86400000).length;
  const pendingLeaveRows = leave.filter((row) => String(row.status) === "pending").slice(0, 5);

  return <section className="dashboard-workspace enterprise-dashboard-home">
    <div className="breadcrumb-trail"><span>SAS Finance Group</span><span aria-hidden="true">›</span><span>Administrator Dashboard</span></div>
    <div className="home-hero-row"><header className="page-header"><div className="page-header-with-photo"><AvatarPhoto accessToken={accessToken} path={profile.avatar_path} name={profile.display_name} size={52} /><div><span className="eyebrow">Organisation administrator</span><h1>Welcome back, {profile.display_name.split(" ")[0]}</h1><p className="muted">{pendingApprovals} pending approval{pendingApprovals === 1 ? "" : "s"}, {expiringDocuments} expiring document{expiringDocuments === 1 ? "" : "s"} and {(data.deletedRecords ?? []).filter((row) => String(row.status) === "pending").length} deletion review{(data.deletedRecords ?? []).filter((row) => String(row.status) === "pending").length === 1 ? "" : "s"}.</p></div></div><div className="page-header-actions"><button className="secondary" onClick={() => onNavigate("Meetings & Calendar")}><MenuIcon name="calendar" />Add Schedule</button><button className="primary" onClick={() => onNavigate("Employee Management")}><MenuIcon name="user-plus" />Add Employee</button></div></header><QuickAttendance accessToken={accessToken} profile={profile} compact /></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dhv2-stat-grid enterprise-kpi-grid">{cards.map(([label, result, target]) => <StatCard key={label} label={label} value={result} onClick={() => onNavigate(target)} />)}</div>
    <div className="enterprise-home-section-title"><div><h2>Organisation overview</h2><p>Live people, attendance, recruitment, tasks and system activity.</p></div></div>
    <div className="enterprise-home-grid">
      <EmployeeStatusWidget employees={employees} onNavigate={onNavigate} />
      <AttendanceOverviewWidget attendance={attendance} employees={employees} onNavigate={onNavigate} />
      <ClockInOutWidget attendance={attendance} employees={employees} onNavigate={onNavigate} />
      <DepartmentBarsWidget employees={employees} onNavigate={onNavigate} />
      <RecruitmentWidget jobs={jobs} applications={applications} onNavigate={onNavigate} />
      <EmployeesListWidget employees={employees} onNavigate={onNavigate} />
      <TasksWidget tasks={tasks} onNavigate={onNavigate} />
      <ScheduleWidget meetings={data.meetings ?? []} holidays={data.holidays ?? []} onNavigate={onNavigate} />
      <RecentActivityWidget rows={audit} onNavigate={onNavigate} />
      <BirthdaysWidget employees={employees} onNavigate={onNavigate} />
    </div>
    <div className="enterprise-home-section-title"><div><h2>Trends, approvals & controls</h2><p>Strategic workforce insights and administrator actions.</p></div></div>
    <div className="dhv2-chart-row"><article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Leave Trends</h2><button type="button" className="dhv2-chart-link" onClick={() => onNavigate("Leave Management")}>View Details ›</button></div><AreaChart series={leaveSeries} xLabels={leaveMonthLabels} /></article><article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Headcount Trend</h2></div><BarChart values={headcount.values} xLabels={headcount.labels} /></article></div>
    <div className="dhv2-list-row-grid"><ListCard title="Pending Leave Approvals" count={pendingLeaveRows.length} rows={pendingLeaveRows.map((row) => ({ icon: "leave" as IconName, iconColor: "var(--viz-orange-strong)", title: String(row.employee_name ?? "Employee"), subtitle: `${row.leave_type ?? "Leave"} — ${row.days ?? "?"} days`, trailing: { type: "check" as const, onClick: () => onNavigate("Leave Management") } }))} emptyLabel="No leave requests are waiting on approval." /><ListCard title="Announcements" rows={announcements.filter((row) => String(row.status) === "published").slice(0, 5).map((row) => ({ icon: "announcement" as IconName, iconColor: "var(--brand)", title: String(row.title ?? "Announcement"), subtitle: String(row.body ?? "").slice(0, 90) }))} emptyLabel="No announcements have been published." /><article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Quick Actions</h2></div><QuickActionsGrid items={quickActions.slice(0, 6).map(([label, target, icon]) => ({ label, icon: icon ?? moduleIcon(target), color: "blue" as const, onClick: () => onNavigate(target) }))} /></article></div>
  </section>;
}
