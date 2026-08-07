import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows } from "./lib/supabase-data";
import { QuickAttendance } from "./quick-attendance";
import { MenuIcon, IconName } from "./menu-icon";
import { moduleIcon } from "./module-icons";
import { AvatarPhoto } from "./avatar-photo";
import { StatCard, ListCard, QuickActionsGrid } from "./dashboard-cards";
import { AreaChart, DonutChart, BarChart } from "./dashboard-charts";
import { monthDelta, monthlyBuckets, monthlyCumulative, groupCounts } from "./lib/dashboard-metrics";

const vizPalette = ["var(--viz-blue)", "var(--viz-purple)", "var(--viz-red)", "var(--viz-orange)", "var(--brand)", "var(--viz-slate)"];
const quickActionIcon: Record<string, IconName> = { "Add Employee": "user-plus", "Live Attendance": "attendance", "Invite User": "mail", "Assign Role": "badge", "Create Department": "department", "Create Branch": "branch", "Start Onboarding": "recruitment", "Start Offboarding": "disciplinary", "Review Attendance": "attendance", "Review Leave": "leave", "Open Payroll": "payroll", "Create Vacancy": "briefcase", "Generate Document": "audit", "Publish Announcement": "announcement", "View Security Alerts": "compliance", "Backup & Restore": "backup", "Export Report": "report", "Open System Settings": "settings" };
const quickActionColor: Record<string, "blue" | "orange" | "purple" | "slate" | "red"> = { "Add Employee": "blue", "Live Attendance": "blue", "Invite User": "blue", "Assign Role": "blue", "Create Department": "slate", "Create Branch": "slate", "Start Onboarding": "orange", "Start Offboarding": "slate", "Review Attendance": "orange", "Review Leave": "orange", "Open Payroll": "purple", "Create Vacancy": "purple", "Generate Document": "slate", "Publish Announcement": "purple", "View Security Alerts": "red", "Export Report": "slate", "Open System Settings": "slate" };

type Props = { accessToken: string; profile: UserProfile; onNavigate: (label: string) => void };

export function AdminDashboard({ accessToken, profile, onNavigate }: Props) {
  const [data, setData] = useState<Record<string, DataRow[]>>({});
  const [error, setError] = useState("");
  const [dashboardNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setError("");
    const issues: string[] = [];
    const read = async (table: string, limit = 1000, orderColumn = "created_at") => {
      try { return await listRows(accessToken, table, "*", limit, orderColumn); }
      catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }
    };
    const [employees, profiles, attendance, leave, jobs, applications, onboarding, offboarding, reviews, documents, tickets, audit, announcements, expenses, assetRequests, benefits, payroll, deletedRecords, backups] = await Promise.all([
      read("employees"), read("profiles"), read("attendance_records"), read("leave_requests"), read("job_openings"), read("internal_job_applications"),
      read("employee_onboarding"), read("employee_offboarding"), read("performance_reviews"), read("employee_documents"), read("support_tickets"),
      read("audit_logs", 100), read("announcements", 50), read("expense_claims"), read("asset_requests"), read("employee_benefits"), read("payroll_records"), read("deleted_records", 250, "deleted_at"), read("backup_records", 100),
    ]);
    setData({ employees, profiles, attendance, leave, jobs, applications, onboarding, offboarding, reviews, documents, tickets, audit, announcements, expenses, assetRequests, benefits, payroll, deletedRecords, backups });
    if (issues.length) setError(`Some administrator data could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
  }, [accessToken]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load(), 30000); return () => window.clearInterval(timer); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const employees = data.employees ?? [], profiles = data.profiles ?? [], attendanceAll = data.attendance ?? [];
  const attendance = attendanceAll.filter((row) => String(row.attendance_date) === today);
  const leave = data.leave ?? [], jobs = data.jobs ?? [], applications = data.applications ?? [], onboarding = data.onboarding ?? [], offboarding = data.offboarding ?? [];
  const reviews = data.reviews ?? [], documents = data.documents ?? [], tickets = data.tickets ?? [], expenses = data.expenses ?? [], assetRequests = data.assetRequests ?? [], benefits = data.benefits ?? [], payroll = data.payroll ?? [];

  const metrics = useMemo(() => [
    ["Total Employees", employees.length, "Employee Management"],
    ["Active Users", profiles.filter((row) => String(row.status || "active") === "active").length, "User & Account Management"],
    ["Present Today", attendance.filter((row) => ["present", "late", "remote"].includes(String(row.status))).length, "Attendance Management"],
    ["Absent Today", attendance.filter((row) => String(row.status) === "absent").length, "Attendance Management"],
    ["On Leave", leave.filter((row) => String(row.status) === "approved" && String(row.start_date) <= today && String(row.end_date) >= today).length, "Leave Management"],
    ["Pending Leave", leave.filter((row) => String(row.status) === "pending").length, "Approval Workflows"],
    ["Expense Claims", expenses.filter((row) => ["submitted", "manager_approved", "hr_approved", "finance_review", "returned"].includes(String(row.status))).length, "Expenses"],
    ["Asset Requests", assetRequests.filter((row) => !["fulfilled", "rejected", "cancelled"].includes(String(row.status))).length, "Asset Management"],
    ["Active Benefits", benefits.filter((row) => String(row.status) === "active").length, "Benefits"],
    ["Payroll Drafts", payroll.filter((row) => ["draft", "calculated", "approved"].includes(String(row.status))).length, "Payroll & Payslips"],
    ["New Hires", employees.filter((row) => String(row.start_date).slice(0, 7) === today.slice(0, 7)).length, "Employee Management"],
    ["Employees on Probation", employees.filter((row) => String(row.employment_status).toLowerCase().includes("probation")).length, "Employee Management"],
    ["Open Vacancies", jobs.filter((row) => ["open", "published"].includes(String(row.status)) && (!row.closing_date || new Date(String(row.closing_date)).getTime() >= new Date(today + "T00:00:00").getTime())).length, "Recruitment"],
    ["New Applications", applications.filter((row) => ["new", "submitted", "screening"].includes(String(row.status))).length, "Recruitment"],
    ["Onboarding in Progress", onboarding.filter((row) => !["complete", "completed", "closed"].includes(String(row.status))).length, "Onboarding"],
    ["Offboarding in Progress", offboarding.filter((row) => !["complete", "completed", "closed"].includes(String(row.status))).length, "Offboarding"],
    ["Reviews Due", reviews.filter((row) => String(row.status) !== "completed").length, "Performance Management"],
    ["Expiring Documents", documents.filter((row) => row.expiry_date && new Date(String(row.expiry_date)).getTime() >= dashboardNow && new Date(String(row.expiry_date)).getTime() - dashboardNow < 30 * 86400000).length, "Documents & Templates"],
    ["Open Support Tickets", tickets.filter((row) => !["closed", "resolved"].includes(String(row.status))).length, "Help Desk & Support"],
    ["Deletion Reviews", (data.deletedRecords ?? []).filter((row) => String(row.status) === "pending").length, "Settings Centre"],
    ["Recovery Points", (data.backups ?? []).filter((row) => String(row.backup_type) === "recovery_point").length, "Settings Centre"],
    ["Security Alerts", (data.audit ?? []).filter((row) => /failed|security|suspicious|lock/i.test(String(row.event_type || row.action || row.description))).length, "Audit Logs"],
  ], [employees, profiles, attendance, leave, jobs, applications, onboarding, offboarding, reviews, documents, tickets, expenses, assetRequests, benefits, payroll, data.audit, data.deletedRecords, data.backups, dashboardNow, today]);

  const newHiresTrend = useMemo(() => monthDelta(employees, "start_date"), [employees]);
  const quick = ["Add Employee", "Live Attendance", "Invite User", "Assign Role", "Create Department", "Create Branch", "Start Onboarding", "Start Offboarding", "Review Attendance", "Review Leave", "Open Payroll", "Create Vacancy", "Generate Document", "Publish Announcement", "View Security Alerts", "Backup & Restore", "Export Report", "Open System Settings"];

  const leaveTypes = useMemo(() => groupCounts(leave, "leave_type", 4), [leave]);
  const leaveSeries = useMemo(() => leaveTypes.map(([type], index) => ({ name: type, color: vizPalette[index], values: monthlyBuckets(leave.filter((row) => String(row.leave_type ?? "").trim() === type), "start_date", 9).values })), [leave, leaveTypes]);
  const leaveMonthLabels = useMemo(() => monthlyBuckets(leave, "start_date", 9).labels, [leave]);

  const departmentSlices = useMemo(() => groupCounts(employees, "department_name", 6).map(([name, value], index) => ({ name, value, color: vizPalette[index] })), [employees]);
  const topDepartment = departmentSlices[0];

  const headcount = useMemo(() => monthlyCumulative(employees, "start_date", 7), [employees]);

  const pendingApprovals = useMemo(() => leave.filter((row) => String(row.status) === "pending").slice(0, 5), [leave]);

  return <section className="dashboard-workspace">
    <div className="breadcrumb-trail"><span>SAS Finance Group</span><span aria-hidden="true">›</span><span>Administrator Dashboard</span></div>
    <div className="home-hero-row">
      <header className="page-header">
        <div className="page-header-with-photo"><AvatarPhoto accessToken={accessToken} path={profile.avatar_path} name={profile.display_name} size={52} /><div><span className="eyebrow">Organisation administrator</span><h1>Welcome, {profile.display_name}</h1><p className="muted">Complete workforce, security, configuration and operational control for SAS Finance Group.</p></div></div>
        <div className="page-header-actions"><button className="secondary" onClick={() => void load()}><MenuIcon name="report" />Refresh</button><button type="button" className="link-button" onClick={() => onNavigate("Reports & Analytics")}>Quick Actions</button></div>
      </header>
      <QuickAttendance accessToken={accessToken} profile={profile} compact />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dhv2-stat-grid">{metrics.map(([label, result, target]) => <StatCard key={String(label)} label={String(label)} value={result} trend={label === "New Hires" ? newHiresTrend : undefined} onClick={() => onNavigate(String(target))} />)}</div>
    <div className="dhv2-chart-row">
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Leave Trends (Last 9 Months)</h2><button type="button" className="dhv2-chart-link" onClick={() => onNavigate("Leave Management")}>View Details ›</button></div><AreaChart series={leaveSeries} xLabels={leaveMonthLabels} /></article>
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Team Distribution</h2></div><DonutChart slices={departmentSlices} centerLabel={topDepartment ? { name: topDepartment.name, value: topDepartment.value } : undefined} /><div className="dhv2-donut-legend">{departmentSlices.map((slice) => <div className="dhv2-donut-legend-item" key={slice.name}><span>{slice.name}</span><b>{slice.value}</b></div>)}</div></article>
    </div>
    <div className="dhv2-list-row-grid">
      <ListCard title="Pending Approvals" count={pendingApprovals.length} rows={pendingApprovals.map((row) => ({ icon: "leave" as IconName, iconColor: "var(--viz-orange-strong)", title: String(row.employee_name ?? "Employee"), subtitle: `${row.leave_type ?? "Leave"} — ${row.days ?? "?"} days`, trailing: { type: "check" as const, onClick: () => onNavigate("Leave Management") } }))} emptyLabel="No leave requests are waiting on approval." />
      <ListCard title="Recent Activity" rows={(data.audit ?? []).slice(0, 6).map((row) => ({ icon: "audit" as IconName, iconColor: "var(--viz-slate)", title: String(row.action ?? row.description ?? "System activity"), subtitle: String(row.created_at ?? "") }))} emptyLabel="Nothing has been recorded yet." />
      <ListCard title="Important Announcements" action={{ label: "View All", onClick: () => onNavigate("Communication") }} rows={(data.announcements ?? []).filter((row) => String(row.status) === "published").slice(0, 6).map((row) => ({ icon: "announcement" as IconName, iconColor: "var(--viz-purple-strong)", title: String(row.title ?? "Announcement"), subtitle: String(row.publish_at ?? "") }))} emptyLabel="No announcements have been published yet." />
    </div>
    <div className="dhv2-bottom-row">
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Headcount Trend</h2></div><BarChart values={headcount.values} xLabels={headcount.labels} /></article>
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Quick Actions</h2></div><QuickActionsGrid items={quick.slice(0, 6).map((item) => ({ label: item, icon: quickActionIcon[item] ?? moduleIcon(actionTarget(item)), color: quickActionColor[item] ?? "slate", onClick: () => onNavigate(actionTarget(item)) }))} /></article>
    </div>
    <article className="card panel dashboard-wide-panel"><div className="panel-head"><div><h2>All administrator quick actions</h2><p className="muted">Common organisation operations</p></div></div><div className="quick dashboard-quick-grid">{quick.map((item) => <button key={item} onClick={() => onNavigate(actionTarget(item))}><span><MenuIcon name={moduleIcon(actionTarget(item))} /></span>{item}</button>)}</div></article>
  </section>;
}

function actionTarget(label: string) { if (/live attendance/i.test(label)) return "Live Attendance"; if (/employee/i.test(label)) return "Employee Management"; if (/user|role/i.test(label)) return "User & Account Management"; if (/department|branch/i.test(label)) return "Organization Structure"; if (/onboarding/i.test(label)) return "Onboarding"; if (/offboarding/i.test(label)) return "Offboarding"; if (/attendance/i.test(label)) return "Attendance Management"; if (/leave/i.test(label)) return "Leave Management"; if (/payroll/i.test(label)) return "Payroll & Payslips"; if (/vacancy/i.test(label)) return "Recruitment"; if (/document/i.test(label)) return "Documents & Templates"; if (/announcement/i.test(label)) return "Communication"; if (/security/i.test(label)) return "Audit Logs"; if (/export|report/i.test(label)) return "Reports & Analytics"; return "Settings Centre"; }
