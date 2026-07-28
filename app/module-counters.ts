import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows } from "./lib/supabase-data";

export type ModuleCountMap = Record<string, number>;
type DashboardMode = "admin" | "hr" | "manager";

const openStatuses = new Set(["pending", "submitted", "draft", "open", "reopened", "in_progress", "manager_review", "hr_review", "finance_review", "returned", "assigned", "not_started", "manager_approved", "hr_approved"]);
const closedStatuses = new Set(["approved", "rejected", "cancelled", "completed", "complete", "closed", "resolved", "reimbursed", "published", "archived", "released", "retired", "fulfilled"]);

function countWhere(rows: DataRow[], predicate: (row: DataRow) => boolean) { return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0); }
function statusOf(row: DataRow) { return String(row.status ?? "").toLowerCase(); }
function activeCount(rows: DataRow[]) { return countWhere(rows, (row) => { const status = statusOf(row); return status ? openStatuses.has(status) || !closedStatuses.has(status) : true; }); }
async function safe(accessToken: string, table: string, limit = 1000) { try { return await listRows(accessToken, table, "*", limit); } catch { return [] as DataRow[]; } }

export function useDashboardModuleCounts(accessToken: string, profile: UserProfile, mode: DashboardMode) {
  const [counts, setCounts] = useState<ModuleCountMap>({});

  const load = useCallback(async () => {
    const [notifications, leave, expenses, assetRequests, benefits, onboarding, offboarding, jobs, applications, reviews, assignments, training, documents, cases, tickets, workflows, meetings, payroll, hrRequests, employeeRequests, transferRequests, tasks, announcements, reports] = await Promise.all([
      safe(accessToken, "notifications", 500), safe(accessToken, "leave_requests"), safe(accessToken, "expense_claims"), safe(accessToken, "asset_requests"),
      safe(accessToken, "employee_benefits"), safe(accessToken, "employee_onboarding"), safe(accessToken, "employee_offboarding"), safe(accessToken, "job_openings"),
      safe(accessToken, "internal_job_applications"), safe(accessToken, "performance_reviews"), safe(accessToken, "review_assignments"), safe(accessToken, "employee_training"),
      safe(accessToken, "employee_documents"), safe(accessToken, "employee_cases"), safe(accessToken, "support_tickets"), safe(accessToken, "approval_workflows"),
      safe(accessToken, "meetings"), safe(accessToken, "payroll_records"), safe(accessToken, "hr_requests"), safe(accessToken, "employee_change_requests"),
      safe(accessToken, "transfer_requests"), safe(accessToken, "tasks"), safe(accessToken, "announcements"), safe(accessToken, "report_runs"),
    ]);

    const now = Date.now();
    const upcomingMeetings = countWhere(meetings, (row) => { const starts = new Date(String(row.starts_at ?? "")).getTime(); return Number.isFinite(starts) && starts >= now && !closedStatuses.has(statusOf(row)); });
    const expiringDocuments = countWhere(documents, (row) => { if (!row.expiry_date) return false; const expiry = new Date(String(row.expiry_date)).getTime(); return Number.isFinite(expiry) && expiry >= now && expiry - now <= 30 * 86400000; });
    const unreadNotifications = countWhere(notifications, (row) => !Boolean(row.is_read) && !row.archived_at);
    const pendingLeave = countWhere(leave, (row) => ["pending", "draft"].includes(statusOf(row)) || ["manager_review", "hr_review"].includes(String(row.workflow_stage ?? "")));
    const pendingExpenses = countWhere(expenses, (row) => ["submitted", "manager_approved", "hr_approved", "finance_review", "returned", "draft"].includes(statusOf(row)));
    const pendingAssets = countWhere(assetRequests, (row) => ["pending", "manager_review", "hr_review", "approved"].includes(statusOf(row)));
    const openCases = countWhere(cases, (row) => !["resolved", "closed", "archived"].includes(statusOf(row)));
    const openTickets = countWhere(tickets, (row) => !["resolved", "closed", "cancelled"].includes(statusOf(row)));
    const openJobs = countWhere(jobs, (row) => ["open", "published", "draft"].includes(statusOf(row)));
    const newApplications = countWhere(applications, (row) => ["new", "submitted", "screening", "shortlisted"].includes(statusOf(row)));
    const pendingReviews = activeCount(assignments) + countWhere(reviews, (row) => ["pending", "draft", "in_progress", "self_assessment", "manager_review"].includes(statusOf(row)));
    const activeTraining = countWhere(training, (row) => !["completed", "cancelled", "expired"].includes(statusOf(row)));
    const activeBenefits = countWhere(benefits, (row) => !["inactive", "cancelled", "expired", "archived"].includes(statusOf(row)));
    const attendanceRequests = countWhere(hrRequests, (row) => /attendance|clock|timesheet/i.test(String(row.request_type ?? row.subject ?? "")) && !["closed", "resolved", "rejected"].includes(statusOf(row)));
    const pendingEmployeeRequests = activeCount(employeeRequests) + activeCount(transferRequests) + countWhere(hrRequests, (row) => !["closed", "resolved", "rejected"].includes(statusOf(row)));
    const activeTasks = countWhere(tasks, (row) => !["completed", "cancelled", "closed"].includes(statusOf(row)));
    const recentAnnouncements = countWhere(announcements, (row) => statusOf(row) === "published");
    const queuedReports = countWhere(reports, (row) => ["queued", "processing", "draft"].includes(statusOf(row)));

    const next: ModuleCountMap = {
      Notifications: unreadNotifications,
      "Leave Management": pendingLeave, "Leave Approvals": pendingLeave,
      "Expense Management": pendingExpenses, Expenses: pendingExpenses, "Expense Approvals": pendingExpenses,
      "Asset Management": pendingAssets, Assets: pendingAssets,
      "Benefits Administration": activeBenefits, Benefits: activeBenefits,
      Onboarding: activeCount(onboarding), Offboarding: activeCount(offboarding),
      Recruitment: openJobs + newApplications, "Recruitment & Onboarding": openJobs + newApplications + activeCount(onboarding),
      "Performance Management": pendingReviews, "Team Performance": pendingReviews,
      "Learning & Development": activeTraining,
      "Documents & Templates": expiringDocuments, Documents: expiringDocuments,
      "Employee Relations & Cases": openCases,
      "HR Help Desk": openTickets, "Help Desk & Support": openTickets,
      "Workflows & Approvals": countWhere(workflows, (row) => statusOf(row) !== "active"), "Approval Workflows": countWhere(workflows, (row) => statusOf(row) !== "active"),
      "Meetings & Calendar": upcomingMeetings, "One to One Meetings": upcomingMeetings,
      "Payroll Administration": countWhere(payroll, (row) => ["draft", "calculated", "approved"].includes(statusOf(row))),
      "Payroll & Payslips": countWhere(payroll, (row) => ["draft", "calculated", "approved"].includes(statusOf(row))),
      "Attendance Management": attendanceRequests, "Team Attendance": attendanceRequests,
      "Employee Management": pendingEmployeeRequests, "Employee Requests": pendingEmployeeRequests,
      Tasks: activeTasks,
      "Announcements & Communication": recentAnnouncements, Communication: recentAnnouncements, "Team Communication": recentAnnouncements,
      "Reports & Analytics": queuedReports,
    };

    if (mode === "manager") next["My Team"] = pendingEmployeeRequests;
    setCounts(next);
  }, [accessToken, mode, profile.id]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30000);
    const refresh = () => void load();
    window.addEventListener("sas-data-changed", refresh);
    window.addEventListener("sas-notifications-changed", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("sas-data-changed", refresh); window.removeEventListener("sas-notifications-changed", refresh); };
  }, [load]);

  return counts;
}
