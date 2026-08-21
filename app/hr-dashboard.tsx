import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows } from "./lib/supabase-data";
import { QuickAttendance } from "./quick-attendance";
import { MenuIcon, IconName } from "./menu-icon";
import { moduleIcon } from "./module-icons";
import { AvatarPhoto } from "./avatar-photo";
import { StatCard, ListCard, QuickActionsGrid } from "./dashboard-cards";
import { AreaChart, BarChart } from "./dashboard-charts";
import { monthDelta, monthlyBuckets, monthlyCumulative, groupCounts } from "./lib/dashboard-metrics";
import { realtimeClient } from "./lib/supabase-realtime";
import { AttendanceOverviewWidget, BirthdaysWidget, ClockInOutWidget, DepartmentBarsWidget, EmployeeStatusWidget, EmployeesListWidget, RecentActivityWidget, RecruitmentWidget, ScheduleWidget, TasksWidget } from "./enterprise-home-widgets";

type HRData = {
  employees: DataRow[]; attendance: DataRow[]; leave: DataRow[]; jobs: DataRow[]; candidates: DataRow[]; applications: DataRow[];
  onboarding: DataRow[]; offboarding: DataRow[]; documents: DataRow[]; reviews: DataRow[]; training: DataRow[]; tasks: DataRow[];
  payroll: DataRow[]; tickets: DataRow[]; announcements: DataRow[]; expenses: DataRow[]; assets: DataRow[]; benefits: DataRow[]; audit: DataRow[];
  meetings: DataRow[]; holidays: DataRow[];
};

const empty: HRData = { employees: [], attendance: [], leave: [], jobs: [], candidates: [], applications: [], onboarding: [], offboarding: [], documents: [], reviews: [], training: [], tasks: [], payroll: [], tickets: [], announcements: [], expenses: [], assets: [], benefits: [], audit: [], meetings: [], holidays: [] };
const vizPalette = ["var(--brand)", "var(--viz-purple)", "var(--viz-red)", "var(--viz-orange)", "var(--viz-blue)", "var(--viz-slate)"];
const quickActionIcon: Record<string, IconName> = { "Add employee": "user-plus", "Live attendance": "attendance", "Start onboarding": "recruitment", "Start offboarding": "disciplinary", "Review leave": "leave", "Review expenses": "expense", "Review assets": "asset", "Create vacancy": "briefcase", "Generate HR letter": "audit", "Open HR tickets": "help", "Open Book Library": "book" };
const quickActionColor: Record<string, "blue" | "orange" | "purple" | "slate" | "red"> = { "Add employee": "blue", "Live attendance": "blue", "Start onboarding": "orange", "Start offboarding": "slate", "Review leave": "orange", "Review expenses": "purple", "Review assets": "slate", "Create vacancy": "purple", "Generate HR letter": "slate", "Open HR tickets": "red", "Open Book Library": "blue" };

export function HRDashboard({ accessToken, profile, onNavigate }: { accessToken: string; profile: UserProfile; onNavigate: (page: string) => void }) {
  const [data, setData] = useState<HRData>(empty);
  const [error, setError] = useState("");
  const [dashboardNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setError("");
    const issues: string[] = [];
    const read = async (table: string, limit = 500) => {
      try { return await listRows(accessToken, table, "*", limit); }
      catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }
    };
    const [employees, attendance, leave, jobs, candidates, applications, onboarding, offboarding, documents, reviews, training, tasks, payroll, tickets, announcements, expenses, assets, benefits, audit, meetings, holidays] = await Promise.all([
      read("employees"), read("attendance_records"), read("leave_requests"), read("job_openings"), read("candidates"), read("internal_job_applications"),
      read("employee_onboarding"), read("employee_offboarding"), read("employee_documents"), read("performance_reviews"), read("employee_training"), read("tasks"),
      read("payroll_records"), read("support_tickets"), read("announcements", 50), read("expense_claims"), read("asset_requests"), read("employee_benefits"), read("audit_logs", 100), read("meetings", 100), read("company_holidays", 100),
    ]);
    setData({ employees, attendance, leave, jobs, candidates, applications, onboarding, offboarding, documents, reviews, training, tasks, payroll, tickets, announcements, expenses, assets, benefits, audit, meetings, holidays });
    if (issues.length) setError(`Some HR data could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
  }, [accessToken]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);
  useEffect(() => {
    const client = realtimeClient(accessToken);
    let channel = client.channel(`hr-dashboard-${profile.organisation_id}-${profile.id}`);
    for (const table of ["employees", "attendance_records", "leave_requests", "job_openings", "candidates", "internal_job_applications", "employee_onboarding", "employee_offboarding", "employee_documents", "performance_reviews", "employee_training", "tasks", "payroll_records", "support_tickets", "announcements", "expense_claims", "asset_requests", "employee_benefits", "meetings", "company_holidays"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `organisation_id=eq.${profile.organisation_id}` }, () => void load());
    }
    channel.subscribe();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { window.clearInterval(timer); void client.removeChannel(channel); };
  }, [accessToken, load, profile.id, profile.organisation_id]);

  const today = new Date().toISOString().slice(0, 10);
  const active = data.employees.filter((row) => ["active", "probation", "leave", "confirmed"].includes(String(row.employment_status).toLowerCase())).length;
  const present = data.attendance.filter((row) => String(row.attendance_date) === today && ["present", "late", "remote"].includes(String(row.status))).length;
  const onLeave = data.leave.filter((row) => String(row.status) === "approved" && String(row.start_date) <= today && String(row.end_date) >= today).length;
  const pendingLeave = data.leave.filter((row) => String(row.status) === "pending").length;
  const pendingApprovals = data.leave.filter((row) => String(row.status) === "pending").slice(0, 5);
  const publishedAnnouncements = data.announcements.filter((row) => String(row.status) === "published").slice(0, 6);
  const openTasks = data.tasks.filter((row) => !["completed", "closed", "cancelled"].includes(String(row.status))).length;

  const metrics = useMemo(() => [
    ["Attendance Overview", `${present}/${Math.max(active, data.employees.length)}`, "Live Attendance"],
    ["Total Employees", data.employees.length, "Employee Management"],
    ["Open Vacancies", data.jobs.filter((row) => ["open", "published"].includes(String(row.status))).length, "Recruitment"],
    ["Applicants", data.candidates.length + data.applications.length, "Recruitment"],
    ["Pending Approvals", pendingLeave + data.expenses.filter((row) => ["submitted", "manager_approved"].includes(String(row.status))).length, "Approval Workflows"],
    ["Tasks", openTasks, "Tasks"],
    ["New Hires", data.employees.filter((row) => String(row.start_date).slice(0, 7) === today.slice(0, 7)).length, "Employee Management"],
    ["Payroll Drafts", data.payroll.filter((row) => ["draft", "calculated", "approved"].includes(String(row.status))).length, "Payroll Administration"],
  ], [data, active, present, pendingLeave, openTasks, today]);

  const quickActions: [string, string][] = [["Add employee", "Employee Management"], ["Live attendance", "Live Attendance"], ["Start onboarding", "Onboarding"], ["Start offboarding", "Offboarding"], ["Review leave", "Leave Management"], ["Review expenses", "Expense Management"], ["Review assets", "Asset Management"], ["Create vacancy", "Recruitment"], ["Generate HR letter", "Documents & Templates"], ["Open HR tickets", "HR Help Desk"]];
  if (profile.dashboard_access.includes("Book Library")) quickActions.push(["Open Book Library", "Book Library"]);

  const newHiresTrend = useMemo(() => monthDelta(data.employees, "start_date"), [data.employees]);
  const leaveTypes = useMemo(() => groupCounts(data.leave, "leave_type", 4), [data.leave]);
  const leaveSeries = useMemo(() => leaveTypes.map(([type], index) => ({ name: type, color: vizPalette[index], values: monthlyBuckets(data.leave.filter((row) => String(row.leave_type ?? "").trim() === type), "start_date", 9).values })), [data.leave, leaveTypes]);
  const leaveMonthLabels = useMemo(() => monthlyBuckets(data.leave, "start_date", 9).labels, [data.leave]);
  const headcount = useMemo(() => monthlyCumulative(data.employees, "start_date", 7), [data.employees]);
  const expiringDocuments = data.documents.filter((row) => { const time = new Date(String(row.expiry_date)).getTime(); return !Number.isNaN(time) && time >= dashboardNow && time - dashboardNow < 31 * 86400000; }).length;

  return <section className="hr-dashboard dashboard-workspace enterprise-dashboard-home">
    <div className="breadcrumb-trail"><span>SAS Finance Group</span><span aria-hidden="true">›</span><span>HR Dashboard</span></div>
    <div className="home-hero-row">
      <header className="page-header">
        <div className="page-header-with-photo"><AvatarPhoto accessToken={accessToken} path={profile.avatar_path} name={profile.display_name} size={52} /><div><span className="eyebrow">HR workspace</span><h1>Welcome back, {profile.display_name.split(" ")[0]}</h1><p className="muted">You have {pendingLeave} pending leave request{pendingLeave === 1 ? "" : "s"}, {openTasks} open task{openTasks === 1 ? "" : "s"} and {expiringDocuments} document{expiringDocuments === 1 ? "" : "s"} expiring soon.</p></div></div>
        <div className="page-header-actions"><button className="secondary" onClick={() => onNavigate("Meetings & Calendar")}><MenuIcon name="calendar" />Add Schedule</button><button className="primary" onClick={() => onNavigate("HR Requests")}><MenuIcon name="user-plus" />Add Request</button></div>
      </header>
      <QuickAttendance accessToken={accessToken} profile={profile} compact />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}

    <div className="dhv2-stat-grid enterprise-kpi-grid">{metrics.map(([label, result, page]) => <StatCard key={String(label)} label={String(label)} value={result} trend={label === "New Hires" ? newHiresTrend : undefined} onClick={() => onNavigate(String(page))} />)}</div>

    <div className="enterprise-home-section-title"><div><h2>People & attendance</h2><p>Live workforce, attendance and department insights from Supabase.</p></div></div>
    <div className="enterprise-home-grid">
      <EmployeeStatusWidget employees={data.employees} onNavigate={onNavigate} />
      <AttendanceOverviewWidget attendance={data.attendance} employees={data.employees} onNavigate={onNavigate} />
      <ClockInOutWidget attendance={data.attendance} employees={data.employees} onNavigate={onNavigate} />
      <DepartmentBarsWidget employees={data.employees} onNavigate={onNavigate} />
      <RecruitmentWidget jobs={data.jobs} candidates={data.candidates} applications={data.applications} onNavigate={onNavigate} />
      <EmployeesListWidget employees={data.employees} onNavigate={onNavigate} />
      <TasksWidget tasks={data.tasks} onNavigate={onNavigate} />
      <ScheduleWidget meetings={data.meetings} holidays={data.holidays} onNavigate={onNavigate} />
      <RecentActivityWidget rows={data.audit} onNavigate={onNavigate} />
      <BirthdaysWidget employees={data.employees} onNavigate={onNavigate} />
    </div>

    <div className="enterprise-home-section-title"><div><h2>Workforce trends & actions</h2><p>Graphical trends, approvals, announcements and shortcuts.</p></div></div>
    <div className="dhv2-chart-row">
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Leave Trends (Last 9 Months)</h2><button type="button" className="dhv2-chart-link" onClick={() => onNavigate("Leave Management")}>View Details ›</button></div><AreaChart series={leaveSeries} xLabels={leaveMonthLabels} /></article>
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Headcount Trend</h2></div><BarChart values={headcount.values} xLabels={headcount.labels} /></article>
    </div>
    <div className="dhv2-list-row-grid">
      <ListCard title="Pending Approvals" count={pendingApprovals.length} rows={pendingApprovals.map((row) => ({ icon: "leave" as IconName, iconColor: "var(--viz-orange-strong)", title: String(row.employee_name ?? "Employee"), subtitle: `${row.leave_type ?? "Leave"} — ${row.days ?? "?"} days`, trailing: { type: "check" as const, onClick: () => onNavigate("Leave Management") } }))} emptyLabel="No leave requests are waiting on approval." />
      <ListCard title="Announcements" action={{ label: "View All", onClick: () => onNavigate("Announcements & Communication") }} rows={publishedAnnouncements.map((row) => ({ icon: "announcement" as IconName, iconColor: "var(--brand)", title: String(row.title ?? "Announcement"), subtitle: String(row.body ?? "").slice(0, 90) }))} emptyLabel="No announcements have been published." />
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Quick Actions</h2></div><QuickActionsGrid items={quickActions.slice(0, 6).map(([label, page]) => ({ label, icon: quickActionIcon[label] ?? moduleIcon(page), color: quickActionColor[label] ?? "slate", onClick: () => onNavigate(page) }))} /></article>
    </div>
  </section>;
}
