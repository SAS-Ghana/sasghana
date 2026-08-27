import { useEffect } from "react";
import { fetchProfile, getValidAccessToken, readSession } from "./lib/supabase-auth";
import { DataRow, listRows, listRowsWhere } from "./lib/supabase-data";

function count(rows: DataRow[], statuses?: string[]) {
  if (!statuses) return rows.length;
  return rows.filter((row) => statuses.includes(String(row.status ?? "").toLowerCase())).length;
}

async function safe(accessToken: string, table: string, employeeId?: string, key = "employee_id") {
  try {
    if (employeeId) return await listRowsWhere(accessToken, table, { [key]: employeeId }, "*", 500);
    return await listRows(accessToken, table, "*", 500);
  } catch {
    return [] as DataRow[];
  }
}

function openEmployeeNotifications() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".employee-module-tabs button,.employee-info-tabs button"))
    .find((item) => item.textContent?.includes("Notifications"));
  button?.click();
  button?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function applyNotificationShortcut(unread: number) {
  const header = document.querySelector<HTMLElement>(".employee-portal-header");
  if (!header) return;
  let shortcut = header.querySelector<HTMLButtonElement>(".employee-notification-shortcut");
  if (!shortcut) {
    shortcut = document.createElement("button");
    shortcut.type = "button";
    shortcut.className = "employee-notification-shortcut";
    shortcut.addEventListener("click", openEmployeeNotifications);
    header.appendChild(shortcut);
  }
  shortcut.setAttribute("aria-label", unread ? `${unread} unread notifications` : "Notifications");
  shortcut.replaceChildren();
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "♢";
  shortcut.appendChild(icon);
  if (unread > 0) {
    const badge = document.createElement("b");
    badge.textContent = unread > 99 ? "99+" : String(unread);
    shortcut.appendChild(badge);
  }
}

function applyBadges(counts: Record<string, number>) {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".employee-module-tabs button,.employee-info-tabs button");
  buttons.forEach((button) => {
    const label = Array.from(button.childNodes)
      .filter((node) => !(node instanceof HTMLElement && node.classList.contains("employee-tab-count")))
      .map((node) => node.textContent ?? "")
      .join("")
      .replace(/[0-9]+\+?$/, "")
      .trim();
    const value = counts[label] ?? 0;
    let badge = button.querySelector<HTMLSpanElement>(".employee-tab-count");
    if (!value) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "employee-tab-count";
      button.appendChild(badge);
    }
    const nextText = value > 99 ? "99+" : String(value);
    if (badge.textContent !== nextText) badge.textContent = nextText;
    badge.setAttribute("aria-label", `${value} pending or new items`);
  });
  applyNotificationShortcut(counts.Notifications ?? 0);
}

export function EmployeeModuleCounterEnhancer() {
  useEffect(() => {
    let cancelled = false;
    let loading = false;
    let firstRenderObserver: MutationObserver | null = null;

    async function load() {
      if (loading) return;
      loading = true;
      try {
        const stored = readSession();
        if (!stored) return;
        const token = await getValidAccessToken(stored.access_token);
        const profile = await fetchProfile(token, stored.user.id);
        if (!profile?.employee_id || cancelled) return;

        const [leave, payroll, documents, performance, learning, tasks, expenses, assets, assetRequests, benefits, jobs, announcements, meetings, tickets, notifications, requests] = await Promise.all([
          safe(token, "leave_requests", profile.employee_id),
          safe(token, "payroll_records", profile.employee_id),
          safe(token, "employee_documents", profile.employee_id),
          safe(token, "performance_reviews", profile.employee_id),
          safe(token, "employee_training", profile.employee_id),
          safe(token, "tasks", profile.employee_id, "assigned_to_employee_id"),
          safe(token, "expense_claims", profile.employee_id),
          safe(token, "assets", profile.employee_id, "assigned_employee_id"),
          safe(token, "asset_requests", profile.employee_id),
          safe(token, "employee_benefits", profile.employee_id),
          safe(token, "job_openings"),
          safe(token, "announcements"),
          safe(token, "meetings"),
          safe(token, "support_tickets", profile.employee_id),
          safe(token, "notifications"),
          safe(token, "employee_change_requests", profile.employee_id),
        ]);

        const upcomingMeetings = meetings.filter((row) => new Date(String(row.starts_at ?? "")).getTime() >= Date.now()).length;
        const unread = notifications.filter((row) => !row.is_read && !row.archived_at).length;
        const pendingLeave = count(leave, ["pending", "draft", "manager_review", "hr_review"]);
        const pendingExpenses = count(expenses, ["submitted", "manager_approved", "hr_approved", "finance_review", "returned", "draft"]);
        const pendingAssets = count(assetRequests, ["pending", "manager_review", "hr_review", "approved"]);
        const openTickets = tickets.filter((row) => !["resolved", "closed", "cancelled"].includes(String(row.status ?? ""))).length;
        const openTasks = tasks.filter((row) => !["completed", "cancelled", "closed"].includes(String(row.status ?? ""))).length;
        const pendingRequests = requests.filter((row) => ["pending", "submitted", "draft"].includes(String(row.status ?? ""))).length;

        const values: Record<string, number> = {
          Overview: pendingLeave + pendingExpenses + pendingAssets + openTasks + unread,
          "My Profile": pendingRequests,
          Leave: pendingLeave,
          Payroll: payroll.filter((row) => ["published", "approved"].includes(String(row.status ?? ""))).length,
          Documents: documents.length,
          Performance: performance.filter((row) => !["completed", "released", "closed"].includes(String(row.status ?? ""))).length,
          Learning: learning.filter((row) => !["completed", "cancelled"].includes(String(row.status ?? ""))).length,
          Tasks: openTasks,
          Expenses: pendingExpenses,
          Assets: assets.length + pendingAssets,
          Benefits: benefits.filter((row) => !["inactive", "cancelled", "expired", "archived"].includes(String(row.status ?? ""))).length,
          "Internal Jobs": jobs.filter((row) => ["open", "published"].includes(String(row.status ?? ""))).length,
          Communication: announcements.filter((row) => String(row.status) === "published").length,
          Calendar: upcomingMeetings,
          "Help Center": openTickets,
          Notifications: unread,
        };

        if (!cancelled) applyBadges(values);
      } finally {
        loading = false;
      }
    }

    if (document.querySelector(".employee-module-tabs,.employee-info-tabs")) {
      void load();
    } else {
      firstRenderObserver = new MutationObserver(() => {
        if (!document.querySelector(".employee-module-tabs,.employee-info-tabs")) return;
        firstRenderObserver?.disconnect();
        firstRenderObserver = null;
        void load();
      });
      firstRenderObserver.observe(document.body, { childList: true, subtree: true });
    }

    const interval = window.setInterval(() => void load(), 30000);
    const refresh = () => void load();
    window.addEventListener("sas-data-changed", refresh);
    window.addEventListener("sas-notifications-changed", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      firstRenderObserver?.disconnect();
      window.removeEventListener("sas-data-changed", refresh);
      window.removeEventListener("sas-notifications-changed", refresh);
    };
  }, []);

  return null;
}
