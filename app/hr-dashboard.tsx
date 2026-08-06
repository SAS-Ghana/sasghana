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

type HRData = {
  employees: DataRow[]; attendance: DataRow[]; leave: DataRow[]; jobs: DataRow[]; candidates: DataRow[];
  onboarding: DataRow[]; offboarding: DataRow[]; documents: DataRow[]; reviews: DataRow[]; training: DataRow[];
  payroll: DataRow[]; tickets: DataRow[]; announcements: DataRow[]; expenses: DataRow[]; assets: DataRow[]; benefits: DataRow[]; audit: DataRow[];
};

const empty: HRData = { employees: [], attendance: [], leave: [], jobs: [], candidates: [], onboarding: [], offboarding: [], documents: [], reviews: [], training: [], payroll: [], tickets: [], announcements: [], expenses: [], assets: [], benefits: [], audit: [] };
const vizPalette = ["var(--viz-blue)", "var(--viz-purple)", "var(--viz-red)", "var(--viz-orange)", "var(--brand)", "var(--viz-slate)"];
const quickActionIcon: Record<string, IconName> = { "Add employee": "user-plus", "Live attendance": "attendance", "Start onboarding": "recruitment", "Start offboarding": "disciplinary", "Review leave": "leave", "Review expenses": "expense", "Review assets": "asset", "Create vacancy": "briefcase", "Generate HR letter": "audit", "Open HR tickets": "help", "Open Book Library": "book" };
const quickActionColor: Record<string, "blue" | "orange" | "purple" | "slate" | "red"> = { "Add employee": "blue", "Live attendance": "blue", "Start onboarding": "orange", "Start offboarding": "slate", "Review leave": "orange", "Review expenses": "purple", "Review assets": "slate", "Create vacancy": "purple", "Generate HR letter": "slate", "Open HR tickets": "red", "Open Book Library": "blue" };

export function HRDashboard({ accessToken, profile, onNavigate }: { accessToken: string; profile: UserProfile; onNavigate: (page: string) => void }) {
  const [data, setData] = useState<HRData>(empty);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const issues: string[] = [];
    const read = async (table: string, limit = 500) => {
      try { return await listRows(accessToken, table, "*", limit); }
      catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }
    };

    const [employees, attendance, leave, jobs, candidates, onboarding, offboarding, documents, reviews, training, payroll, tickets, announcements, expenses, assets, benefits, audit] = await Promise.all([
      read("employees"), read("attendance_records"), read("leave_requests"), read("job_openings"), read("candidates"),
      read("employee_onboarding"), read("employee_offboarding"), read("employee_documents"), read("performance_reviews"),
      read("employee_training"), read("payroll_records"), read("support_tickets"), read("announcements", 50),
      read("expense_claims"), read("asset_requests"), read("employee_benefits"), read("audit_logs", 100),
    ]);
    setData({ employees, attendance, leave, jobs, candidates, onboarding, offboarding, documents, reviews, training, payroll, tickets, announcements, expenses, assets, benefits, audit });
    if (issues.length) setError(`Some HR data could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const active = data.employees.filter((row) => ["active", "probation", "leave"].includes(String(row.employment_status))).length;
  const present = data.attendance.filter((row) => String(row.attendance_date) === today && ["present", "late", "remote"].includes(String(row.status))).length;
  const onLeave = data.leave.filter((row) => String(row.status) === "approved" && String(row.start_date) <= today && String(row.end_date) >= today).length;

  const metrics = useMemo(() => [
    ["Total Employees", data.employees.length, "Employee Management"],
    ["Active Employees", active, "Employee Management"],
    ["Present Today", present, "Attendance Management"],
    ["Absent Today", Math.max(active - present - onLeave, 0), "Attendance Management"],
    ["On Leave", onLeave, "Leave Management"],
    ["Pending Leave", data.leave.filter((row) => String(row.status) === "pending").length, "Leave Management"],
    ["Expense Claims", data.expenses.filter((row) => ["submitted", "manager_approved", "hr_approved", "finance_review", "returned"].includes(String(row.status))).length, "Expense Management"],
    ["Asset Requests", data.assets.filter((row) => !["fulfilled", "rejected", "cancelled"].includes(String(row.status))).length, "Asset Management"],
    ["Active Benefits", data.benefits.filter((row) => String(row.status) === "active").length, "Benefits Administration"],
    ["New Hires", data.employees.filter((row) => String(row.start_date).slice(0, 7) === today.slice(0, 7)).length, "Employee Management"],
    ["On Probation", data.employees.filter((row) => String(row.employment_status) === "probation").length, "Onboarding"],
    ["Open Vacancies", data.jobs.filter((row) => ["open", "published"].includes(String(row.status)) && (!row.closing_date || new Date(String(row.closing_date)).getTime() >= new Date(today + "T00:00:00").getTime())).length, "Recruitment"],
    ["New Applications", data.candidates.filter((row) => ["applied", "screening", "new", "submitted"].includes(String(row.stage ?? row.status))).length, "Recruitment"],
    ["Onboarding", data.onboarding.filter((row) => !["completed", "closed"].includes(String(row.status))).length, "Onboarding"],
    ["Offboarding", data.offboarding.filter((row) => !["completed", "closed"].includes(String(row.status))).length, "Offboarding"],
    ["Missing Documents", data.documents.filter((row) => ["pending", "missing"].includes(String(row.status))).length, "Documents & Templates"],
    ["Expiring Documents", data.documents.filter((row) => { const date = new Date(String(row.expiry_date)); return !Number.isNaN(date.getTime()) && date >= now && date.getTime() - now.getTime() < 31 * 86400000; }).length, "Documents & Templates"],
    ["Reviews Due", data.reviews.filter((row) => String(row.status) !== "completed").length, "Performance Management"],
    ["Training Due", data.training.filter((row) => !["completed", "cancelled"].includes(String(row.status))).length, "Learning & Development"],
    ["HR Tickets", data.tickets.filter((row) => !["resolved", "closed"].includes(String(row.status))).length, "HR Help Desk"],
    ["Payroll Drafts", data.payroll.filter((row) => ["draft", "calculated", "approved"].includes(String(row.status))).length, "Payroll Administration"],
  ], [data, active, present, onLeave, today, now]);

  const quickActions: [string, string][] = [["Add employee", "Employee Management"], ["Live attendance", "Live Attendance"], ["Start onboarding", "Onboarding"], ["Start offboarding", "Offboarding"], ["Review leave", "Leave Management"], ["Review expenses", "Expense Management"], ["Review assets", "Asset Management"], ["Create vacancy", "Recruitment"], ["Generate HR letter", "Documents & Templates"], ["Open HR tickets", "HR Help Desk"]];
  if (profile.dashboard_access.includes("Book Library")) quickActions.push(["Open Book Library", "Book Library"]);

  const newHiresTrend = useMemo(() => monthDelta(data.employees, "start_date"), [data.employees]);

  const leaveTypes = useMemo(() => groupCounts(data.leave, "leave_type", 4), [data.leave]);
  const leaveSeries = useMemo(() => leaveTypes.map(([type], index) => ({ name: type, color: vizPalette[index], values: monthlyBuckets(data.leave.filter((row) => String(row.leave_type ?? "").trim() === type), "start_date", 9).values })), [data.leave, leaveTypes]);
  const leaveMonthLabels = useMemo(() => monthlyBuckets(data.leave, "start_date", 9).labels, [data.leave]);

  const departmentSlices = useMemo(() => groupCounts(data.employees, "department_name", 6).map(([name, value], index) => ({ name, value, color: vizPalette[index] })), [data.employees]);
  const topDepartment = departmentSlices[0];

  const headcount = useMemo(() => monthlyCumulative(data.employees, "start_date", 7), [data.employees]);

  const pendingApprovals = useMemo(() => data.leave.filter((row) => String(row.status) === "pending").slice(0, 5), [data.leave]);
  const publishedAnnouncements = useMemo(() => data.announcements.filter((row) => String(row.status) === "published").slice(0, 6), [data.announcements]);

  return <section className="hr-dashboard dashboard-workspace">
    <div className="breadcrumb-trail"><span>SAS Finance Group</span><span aria-hidden="true">›</span><span>HR Dashboard</span></div>
    <div className="home-hero-row">
      <header className="page-header">
        <div className="page-header-with-photo"><AvatarPhoto accessToken={accessToken} path={profile.avatar_path} name={profile.display_name} size={52} /><div><span className="eyebrow">HR workspace</span><h1>Welcome, {profile.display_name}</h1><p className="muted">Organisation-wide workforce administration, approvals, people operations and HR compliance.</p></div></div>
        <div className="page-header-actions"><button className="secondary" onClick={() => void load()}><MenuIcon name="report" />Refresh</button><button type="button" className="link-button" onClick={() => onNavigate("Reports & Analytics")}>Quick Actions</button></div>
      </header>
      <QuickAttendance accessToken={accessToken} profile={profile} compact />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dhv2-stat-grid">{metrics.map(([label, result, page]) => <StatCard key={String(label)} label={String(label)} value={result} trend={label === "New Hires" ? newHiresTrend : undefined} onClick={() => onNavigate(String(page))} />)}</div>
    <div className="dhv2-chart-row">
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Leave Trends (Last 9 Months)</h2><button type="button" className="dhv2-chart-link" onClick={() => onNavigate("Leave Management")}>View Details ›</button></div><AreaChart series={leaveSeries} xLabels={leaveMonthLabels} /></article>
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Team Distribution</h2></div><DonutChart slices={departmentSlices} centerLabel={topDepartment ? { name: topDepartment.name, value: topDepartment.value } : undefined} /><div className="dhv2-donut-legend">{departmentSlices.map((slice) => <div className="dhv2-donut-legend-item" key={slice.name}><span>{slice.name}</span><b>{slice.value}</b></div>)}</div></article>
    </div>
    <div className="dhv2-list-row-grid">
      <ListCard title="Pending Approvals" count={pendingApprovals.length} rows={pendingApprovals.map((row) => ({ icon: "leave" as IconName, iconColor: "var(--viz-orange-strong)", title: String(row.employee_name ?? "Employee"), subtitle: `${row.leave_type ?? "Leave"} — ${row.days ?? "?"} days`, trailing: { type: "check" as const, onClick: () => onNavigate("Leave Management") } }))} emptyLabel="No leave requests are waiting on approval." />
      <ListCard title="Recent Activity" rows={data.audit.slice(0, 6).map((row) => ({ icon: "audit" as IconName, iconColor: "var(--viz-slate)", title: String(row.action ?? row.description ?? "System activity"), subtitle: String(row.created_at ?? "") }))} emptyLabel="Nothing has been recorded yet." />
      <ListCard title="Announcements" action={{ label: "View All", onClick: () => onNavigate("Announcements & Communication") }} rows={publishedAnnouncements.map((row) => ({ icon: "announcement" as IconName, iconColor: "var(--viz-purple-strong)", title: String(row.title ?? "Announcement"), subtitle: String(row.body ?? "").slice(0, 90) }))} emptyLabel="No announcements have been published." />
    </div>
    <div className="dhv2-bottom-row">
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Headcount Trend</h2></div><BarChart values={headcount.values} xLabels={headcount.labels} /></article>
      <article className="card dhv2-chart-card"><div className="dhv2-chart-head"><h2>Quick Actions</h2></div><QuickActionsGrid items={quickActions.slice(0, 6).map(([label, page]) => ({ label, icon: quickActionIcon[label] ?? moduleIcon(page), color: quickActionColor[label] ?? "slate", onClick: () => onNavigate(page) }))} /></article>
    </div>
    <article className="card panel"><div className="panel-head"><div><h2>All HR quick actions</h2><p className="muted">Common workforce operations</p></div></div><div className="quick dashboard-quick-grid">{quickActions.map(([label, page]) => <button key={label} onClick={() => onNavigate(page)}><span><MenuIcon name={moduleIcon(page)} /></span>{label}</button>)}</div></article>
  </section>;
}
