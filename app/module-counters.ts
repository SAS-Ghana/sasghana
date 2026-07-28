import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows } from "./lib/supabase-data";

export type ModuleCountMap = Record<string, number>;
type DashboardMode = "admin" | "hr" | "manager";
type ModuleSeenMap = Record<string, number>;

const openStatuses = new Set(["pending", "submitted", "draft", "open", "reopened", "in_progress", "manager_review", "hr_review", "finance_review", "returned", "assigned", "not_started", "manager_approved", "hr_approved"]);
const closedStatuses = new Set(["approved", "rejected", "cancelled", "completed", "complete", "closed", "resolved", "reimbursed", "published", "archived", "released", "retired", "fulfilled"]);

function statusOf(row: DataRow) { return String(row.status ?? "").toLowerCase(); }
function isActive(row: DataRow) { const status = statusOf(row); return status ? openStatuses.has(status) || !closedStatuses.has(status) : true; }
async function safe(accessToken: string, table: string, limit = 1000) { try { return await listRows(accessToken, table, "*", limit); } catch { return [] as DataRow[]; } }

function storageKey(profileId: string) { return `sas-module-seen:${profileId}`; }
function readSeen(profileId: string): ModuleSeenMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(storageKey(profileId)) ?? "{}") as ModuleSeenMap; }
  catch { return {}; }
}
function saveSeen(profileId: string, value: ModuleSeenMap) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(storageKey(profileId), JSON.stringify(value)); }
  catch { /* Storage is optional; the current session still updates immediately. */ }
}
function activityTime(row: DataRow) {
  for (const key of ["updated_at", "created_at", "submitted_at", "assigned_at", "published_at", "publish_at", "starts_at", "attendance_date", "start_date"]) {
    const value = row[key];
    if (!value) continue;
    const time = new Date(String(value)).getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
}
function unseenCount(rows: DataRow[], label: string, seen: ModuleSeenMap, predicate: (row: DataRow) => boolean) {
  const cutoff = Number(seen[label] ?? 0);
  return rows.reduce((count, row) => {
    if (!predicate(row)) return count;
    if (!cutoff) return count + 1;
    const activity = activityTime(row);
    return activity > cutoff ? count + 1 : count;
  }, 0);
}

export function useDashboardModuleCounts(accessToken: string, profile: UserProfile, mode: DashboardMode) {
  const [counts, setCounts] = useState<ModuleCountMap>({});
  const [seenAt, setSeenAt] = useState<ModuleSeenMap>(() => readSeen(profile.id));

  useEffect(() => { setSeenAt(readSeen(profile.id)); }, [profile.id]);

  const markModuleSeen = useCallback((label: string) => {
    const seen = Date.now();
    setSeenAt((current) => {
      const next = { ...current, [label]: seen };
      saveSeen(profile.id, next);
      return next;
    });
    setCounts((current) => ({ ...current, [label]: 0 }));
  }, [profile.id]);

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
    const leaveCount = (label: string) => unseenCount(leave, label, seenAt, (row) => ["pending", "draft"].includes(statusOf(row)) || ["manager_review", "hr_review"].includes(String(row.workflow_stage ?? "")));
    const expenseCount = (label: string) => unseenCount(expenses, label, seenAt, (row) => ["submitted", "manager_approved", "hr_approved", "finance_review", "returned", "draft"].includes(statusOf(row)));
    const assetCount = (label: string) => unseenCount(assetRequests, label, seenAt, (row) => ["pending", "manager_review", "hr_review", "approved"].includes(statusOf(row)));
    const benefitCount = (label: string) => unseenCount(benefits, label, seenAt, (row) => !["inactive", "cancelled", "expired", "archived"].includes(statusOf(row)));
    const onboardingCount = (label: string) => unseenCount(onboarding, label, seenAt, isActive);
    const offboardingCount = (label: string) => unseenCount(offboarding, label, seenAt, isActive);
    const recruitmentCount = (label: string, includeOnboarding = false) => unseenCount(jobs, label, seenAt, (row) => ["open", "published", "draft"].includes(statusOf(row))) + unseenCount(applications, label, seenAt, (row) => ["new", "submitted", "screening", "shortlisted"].includes(statusOf(row))) + (includeOnboarding ? unseenCount(onboarding, label, seenAt, isActive) : 0);
    const reviewCount = (label: string) => unseenCount(assignments, label, seenAt, isActive) + unseenCount(reviews, label, seenAt, (row) => ["pending", "draft", "in_progress", "self_assessment", "manager_review"].includes(statusOf(row)));
    const trainingCount = (label: string) => unseenCount(training, label, seenAt, (row) => !["completed", "cancelled", "expired"].includes(statusOf(row)));
    const documentCount = (label: string) => unseenCount(documents, label, seenAt, (row) => { if (!row.expiry_date) return false; const expiry = new Date(String(row.expiry_date)).getTime(); return Number.isFinite(expiry) && expiry >= now && expiry - now <= 30 * 86400000; });
    const caseCount = (label: string) => unseenCount(cases, label, seenAt, (row) => !["resolved", "closed", "archived"].includes(statusOf(row)));
    const ticketCount = (label: string) => unseenCount(tickets, label, seenAt, (row) => !["resolved", "closed", "cancelled"].includes(statusOf(row)));
    const workflowCount = (label: string) => unseenCount(workflows, label, seenAt, (row) => statusOf(row) !== "active");
    const meetingCount = (label: string) => unseenCount(meetings, label, seenAt, (row) => { const starts = new Date(String(row.starts_at ?? "")).getTime(); return Number.isFinite(starts) && starts >= now && !closedStatuses.has(statusOf(row)); });
    const payrollCount = (label: string) => unseenCount(payroll, label, seenAt, (row) => ["draft", "calculated", "approved"].includes(statusOf(row)));
    const attendanceCount = (label: string) => unseenCount(hrRequests, label, seenAt, (row) => /attendance|clock|timesheet/i.test(String(row.request_type ?? row.subject ?? "")) && !["closed", "resolved", "rejected"].includes(statusOf(row)));
    const employeeRequestCount = (label: string) => unseenCount(employeeRequests, label, seenAt, isActive) + unseenCount(transferRequests, label, seenAt, isActive) + unseenCount(hrRequests, label, seenAt, (row) => !["closed", "resolved", "rejected"].includes(statusOf(row)));
    const taskCount = (label: string) => unseenCount(tasks, label, seenAt, (row) => !["completed", "cancelled", "closed"].includes(statusOf(row)));
    const announcementCount = (label: string) => unseenCount(announcements, label, seenAt, (row) => statusOf(row) === "published");
    const reportCount = (label: string) => unseenCount(reports, label, seenAt, (row) => ["queued", "processing", "draft"].includes(statusOf(row)));

    const next: ModuleCountMap = {
      Notifications: unseenCount(notifications, "Notifications", seenAt, (row) => !Boolean(row.is_read) && !row.archived_at),
      "Leave Management": leaveCount("Leave Management"), "Leave Approvals": leaveCount("Leave Approvals"),
      "Expense Management": expenseCount("Expense Management"), Expenses: expenseCount("Expenses"), "Expense Approvals": expenseCount("Expense Approvals"),
      "Asset Management": assetCount("Asset Management"), Assets: assetCount("Assets"),
      "Benefits Administration": benefitCount("Benefits Administration"), Benefits: benefitCount("Benefits"),
      Onboarding: onboardingCount("Onboarding"), Offboarding: offboardingCount("Offboarding"),
      Recruitment: recruitmentCount("Recruitment"), "Recruitment & Onboarding": recruitmentCount("Recruitment & Onboarding", true),
      "Performance Management": reviewCount("Performance Management"), "Team Performance": reviewCount("Team Performance"),
      "Learning & Development": trainingCount("Learning & Development"),
      "Documents & Templates": documentCount("Documents & Templates"), Documents: documentCount("Documents"),
      "Employee Relations & Cases": caseCount("Employee Relations & Cases"),
      "HR Help Desk": ticketCount("HR Help Desk"), "Help Desk & Support": ticketCount("Help Desk & Support"),
      "Workflows & Approvals": workflowCount("Workflows & Approvals"), "Approval Workflows": workflowCount("Approval Workflows"),
      "Meetings & Calendar": meetingCount("Meetings & Calendar"), "One to One Meetings": meetingCount("One to One Meetings"),
      "Payroll Administration": payrollCount("Payroll Administration"), "Payroll & Payslips": payrollCount("Payroll & Payslips"),
      "Attendance Management": attendanceCount("Attendance Management"), "Team Attendance": attendanceCount("Team Attendance"),
      "Employee Management": employeeRequestCount("Employee Management"), "Employee Requests": employeeRequestCount("Employee Requests"),
      Tasks: taskCount("Tasks"),
      "Announcements & Communication": announcementCount("Announcements & Communication"), Communication: announcementCount("Communication"), "Team Communication": announcementCount("Team Communication"),
      "Reports & Analytics": reportCount("Reports & Analytics"),
    };

    if (mode === "manager") next["My Team"] = employeeRequestCount("My Team");
    setCounts(next);
  }, [accessToken, mode, profile.id, seenAt]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30000);
    const refresh = () => void load();
    window.addEventListener("sas-data-changed", refresh);
    window.addEventListener("sas-notifications-changed", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("sas-data-changed", refresh); window.removeEventListener("sas-notifications-changed", refresh); };
  }, [load]);

  return { counts, markModuleSeen };
}
