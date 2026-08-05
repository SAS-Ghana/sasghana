import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows } from "./lib/supabase-data";
import { DashboardInsights, MiniTrend } from "./dashboard-insights";
import { QuickAttendance } from "./quick-attendance";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type HRData = {
  employees: DataRow[]; attendance: DataRow[]; leave: DataRow[]; jobs: DataRow[]; candidates: DataRow[];
  onboarding: DataRow[]; offboarding: DataRow[]; documents: DataRow[]; reviews: DataRow[]; training: DataRow[];
  payroll: DataRow[]; tickets: DataRow[]; announcements: DataRow[]; expenses: DataRow[]; assets: DataRow[]; benefits: DataRow[];
};

const empty: HRData = { employees: [], attendance: [], leave: [], jobs: [], candidates: [], onboarding: [], offboarding: [], documents: [], reviews: [], training: [], payroll: [], tickets: [], announcements: [], expenses: [], assets: [], benefits: [] };

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

    const [employees, attendance, leave, jobs, candidates, onboarding, offboarding, documents, reviews, training, payroll, tickets, announcements, expenses, assets, benefits] = await Promise.all([
      read("employees"), read("attendance_records"), read("leave_requests"), read("job_openings"), read("candidates"),
      read("employee_onboarding"), read("employee_offboarding"), read("employee_documents"), read("performance_reviews"),
      read("employee_training"), read("payroll_records"), read("support_tickets"), read("announcements", 50),
      read("expense_claims"), read("asset_requests"), read("employee_benefits"),
    ]);
    setData({ employees, attendance, leave, jobs, candidates, onboarding, offboarding, documents, reviews, training, payroll, tickets, announcements, expenses, assets, benefits });
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
    ["Open Vacancies", data.jobs.filter((row) => ["open", "published"].includes(String(row.status))).length, "Recruitment"],
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

  const attendanceTrend = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(); date.setDate(date.getDate() - (5 - offset)); const key = date.toISOString().slice(0, 10);
    return data.attendance.filter((row) => String(row.attendance_date) === key && ["present", "late", "remote"].includes(String(row.status))).length;
  });

  return <section className="hr-dashboard dashboard-workspace">
    <header className="page-header"><div><span className="eyebrow">HR workspace</span><h1>Welcome, {profile.display_name}</h1><p className="muted">Organisation-wide workforce administration, approvals, people operations and HR compliance.</p></div><button className="secondary" onClick={() => void load()}>Refresh</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <QuickAttendance accessToken={accessToken} profile={profile} />
    <div className="dashboard-metric-grid">{metrics.map(([label, result, page]) => <button className="card metric dashboard-metric-card" key={String(label)} onClick={() => onNavigate(String(page))}><span className="metric-top"><i className="metric-icon-chip"><MenuIcon name={moduleIcon(String(page))} /></i>{label}</span><strong>{result}</strong><small>Open module</small></button>)}</div>
    <div className="dashboard-chart-grid"><DashboardInsights title="Workforce health" items={[{ label: "Present today", value: present, max: Math.max(active, 1) }, { label: "On leave", value: onLeave, max: Math.max(active, 1) }, { label: "Pending leave", value: data.leave.filter((row) => String(row.status) === "pending").length, max: Math.max(data.leave.length, 1) }, { label: "Reviews due", value: data.reviews.filter((row) => String(row.status) !== "completed").length, max: Math.max(data.reviews.length, 1) }]} /><MiniTrend title="Six day attendance" values={attendanceTrend} /></div>
    <div className="dashboard-content-grid">
      <article className="card panel"><div className="panel-head"><div><h2>HR quick actions</h2><p className="muted">Common workforce operations</p></div></div><div className="quick dashboard-quick-grid">{[["Add employee", "Employee Management"], ["Start onboarding", "Onboarding"], ["Start offboarding", "Offboarding"], ["Review leave", "Leave Management"], ["Review expenses", "Expense Management"], ["Review assets", "Asset Management"], ["Create vacancy", "Recruitment"], ["Generate HR letter", "Documents & Templates"], ["Open HR tickets", "HR Help Desk"]].map(([label, page]) => <button key={label} onClick={() => onNavigate(page)}><span><MenuIcon name={moduleIcon(page)} /></span>{label}</button>)}</div></article>
      <article className="card panel"><div className="panel-head"><div><h2>Announcements</h2><p className="muted">Recent organisation updates</p></div></div><div className="activity">{data.announcements.filter((row) => String(row.status) === "published").slice(0, 6).map((row, index) => <div className="activity-row" key={String(row.id ?? index)}><div className="task-icon">A</div><p><strong>{String(row.title ?? "Announcement")}</strong><br /><small>{String(row.body ?? "").slice(0, 90)}</small></p><time>{String(row.publish_at ?? row.created_at ?? "").slice(0, 10)}</time></div>)}{!data.announcements.some((row) => String(row.status) === "published") && <p className="muted">No announcements have been published.</p>}</div></article>
    </div>
  </section>;
}
