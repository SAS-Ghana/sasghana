import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows } from "./lib/supabase-data";
import { DashboardInsights, MiniTrend } from "./dashboard-insights";
import { QuickAttendance } from "./quick-attendance";

type Props = { accessToken: string; profile: UserProfile; onNavigate: (label: string) => void };

export function AdminDashboard({ accessToken, profile, onNavigate }: Props) {
  const [data, setData] = useState<Record<string, DataRow[]>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const issues: string[] = [];
    const read = async (table: string, limit = 1000) => {
      try { return await listRows(accessToken, table, "*", limit); }
      catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }
    };
    const [employees, profiles, attendance, leave, jobs, applications, onboarding, offboarding, reviews, documents, tickets, audit, announcements, expenses, assetRequests, benefits, payroll] = await Promise.all([
      read("employees"), read("profiles"), read("attendance_records"), read("leave_requests"), read("job_openings"), read("internal_job_applications"),
      read("employee_onboarding"), read("employee_offboarding"), read("performance_reviews"), read("employee_documents"), read("support_tickets"),
      read("audit_logs", 100), read("announcements", 50), read("expense_claims"), read("asset_requests"), read("employee_benefits"), read("payroll_records"),
    ]);
    setData({ employees, profiles, attendance, leave, jobs, applications, onboarding, offboarding, reviews, documents, tickets, audit, announcements, expenses, assetRequests, benefits, payroll });
    if (issues.length) setError(`Some administrator data could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);

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
    ["Open Vacancies", jobs.filter((row) => ["open", "published"].includes(String(row.status))).length, "Recruitment"],
    ["New Applications", applications.filter((row) => ["new", "submitted", "screening"].includes(String(row.status))).length, "Recruitment"],
    ["Onboarding in Progress", onboarding.filter((row) => !["complete", "completed", "closed"].includes(String(row.status))).length, "Onboarding"],
    ["Offboarding in Progress", offboarding.filter((row) => !["complete", "completed", "closed"].includes(String(row.status))).length, "Offboarding"],
    ["Reviews Due", reviews.filter((row) => String(row.status) !== "completed").length, "Performance Management"],
    ["Expiring Documents", documents.filter((row) => row.expiry_date && new Date(String(row.expiry_date)).getTime() >= Date.now() && new Date(String(row.expiry_date)).getTime() - Date.now() < 30 * 86400000).length, "Documents & Templates"],
    ["Open Support Tickets", tickets.filter((row) => !["closed", "resolved"].includes(String(row.status))).length, "Help Desk & Support"],
    ["Security Alerts", (data.audit ?? []).filter((row) => /failed|security|suspicious|lock/i.test(String(row.event_type || row.action || row.description))).length, "Audit Logs"],
  ], [employees, profiles, attendance, leave, jobs, applications, onboarding, offboarding, reviews, documents, tickets, expenses, assetRequests, benefits, payroll, data.audit, today]);

  const trend = Array.from({ length: 6 }, (_, offset) => { const date = new Date(); date.setDate(date.getDate() - (5 - offset)); const key = date.toISOString().slice(0, 10); return attendanceAll.filter((row) => String(row.attendance_date) === key && ["present", "late", "remote"].includes(String(row.status))).length; });
  const quick = ["Add Employee", "Invite User", "Assign Role", "Create Department", "Create Branch", "Start Onboarding", "Start Offboarding", "Review Attendance", "Review Leave", "Open Payroll", "Create Vacancy", "Generate Document", "Publish Announcement", "View Security Alerts", "Export Report", "Open System Settings"];

  return <section className="dashboard-workspace">
    <header className="page-header"><div><span className="eyebrow">Organisation administrator</span><h1>Welcome, {profile.display_name}</h1><p className="muted">Complete workforce, security, configuration and operational control for SAS People.</p></div><button className="secondary" onClick={() => void load()}>Refresh</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <QuickAttendance accessToken={accessToken} profile={profile} />
    <div className="dashboard-metric-grid">{metrics.map(([label, result, target]) => <button key={String(label)} className="card metric dashboard-metric-card" onClick={() => onNavigate(String(target))}><span>{label}</span><strong>{result}</strong><small>Open module</small></button>)}</div>
    <div className="dashboard-chart-grid"><DashboardInsights title="Organisation health" items={[{ label: "Active users", value: profiles.filter((row) => String(row.status || "active") === "active").length, max: Math.max(profiles.length, 1) }, { label: "Present today", value: attendance.filter((row) => ["present", "late", "remote"].includes(String(row.status))).length, max: Math.max(employees.length, 1) }, { label: "Open support tickets", value: tickets.filter((row) => !["closed", "resolved"].includes(String(row.status))).length, max: Math.max(tickets.length, 1) }, { label: "Pending approvals", value: leave.filter((row) => String(row.status).includes("pending")).length, max: Math.max(leave.length, 1) }]} /><MiniTrend title="Six day organisation attendance" values={trend} /></div>
    <div className="dashboard-content-grid">
      <article className="card panel dashboard-wide-panel"><div className="panel-head"><div><h2>Administrator quick actions</h2><p className="muted">Common organisation operations</p></div></div><div className="quick dashboard-quick-grid">{quick.map((item) => <button key={item} onClick={() => onNavigate(actionTarget(item))}><span>+</span>{item}</button>)}</div></article>
      <article className="card panel"><h2>Recent system activity</h2><SimpleList rows={(data.audit ?? []).slice(0, 8)} primary="action" secondary="created_at" /></article>
      <article className="card panel"><h2>Important announcements</h2><SimpleList rows={(data.announcements ?? []).filter((row) => String(row.status) === "published").slice(0, 8)} primary="title" secondary="publish_at" /></article>
    </div>
  </section>;
}

function actionTarget(label: string) { if (/employee/i.test(label)) return "Employee Management"; if (/user|role/i.test(label)) return "User & Account Management"; if (/department|branch/i.test(label)) return "Organization Structure"; if (/onboarding/i.test(label)) return "Onboarding"; if (/offboarding/i.test(label)) return "Offboarding"; if (/attendance/i.test(label)) return "Attendance Management"; if (/leave/i.test(label)) return "Leave Management"; if (/payroll/i.test(label)) return "Payroll & Payslips"; if (/vacancy/i.test(label)) return "Recruitment"; if (/document/i.test(label)) return "Documents & Templates"; if (/announcement/i.test(label)) return "Communication"; if (/security/i.test(label)) return "Audit Logs"; if (/export|report/i.test(label)) return "Reports & Analytics"; return "Settings Centre"; }
function SimpleList({ rows, primary, secondary }: { rows: DataRow[]; primary: string; secondary: string }) { return rows.length ? <div className="activity">{rows.map((row, index) => <div className="activity-row" key={String(row.id ?? index)}><div className="task-icon">•</div><p>{String(row[primary] ?? row.title ?? row.description ?? "Activity")}</p><time>{String(row[secondary] ?? "")}</time></div>)}</div> : <div className="empty-state compact"><h3>No records</h3><p>Nothing has been recorded yet.</p></div>; }
