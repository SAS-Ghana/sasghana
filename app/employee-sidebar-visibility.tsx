import { useEffect } from "react";
import { fetchProfile, readSession } from "./lib/supabase-auth";
import { resolveDashboardMode } from "./lib/dashboard-mode";

const elevatedRolePattern = /administrator|human resources|\bhr\b|manager|supervisor|team lead|department head|procurement|accountant|finance officer|payroll officer|auditor|asset officer|compliance|recruiter|it support|branch manager/i;
const elevatedPermissionPattern = /^(procurement\.|accounts\.|users\.|roles\.|audit\.|archive\.|payroll\.(run|approve|publish)|expenses\.approve|documents\.verify|attendance\.manage)/i;

function applyVisibility(hidden: boolean) {
  document.documentElement.classList.toggle("sas-employee-sidebar-hidden", hidden);
  document.body.classList.toggle("sas-employee-sidebar-hidden", hidden);
}

function openEmployeeProfile() {
  const findAndOpen = () => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    const target = buttons.find((button) => button.textContent?.trim() === "My Info");
    if (!target) return false;
    target.click();
    return true;
  };

  if (findAndOpen()) return () => undefined;
  const observer = new MutationObserver(() => {
    if (findAndOpen()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = window.setTimeout(() => observer.disconnect(), 10000);
  return () => {
    window.clearTimeout(timer);
    observer.disconnect();
  };
}

export function EmployeeSidebarVisibility() {
  useEffect(() => {
    let cancelled = false;
    let defaultedForUser = "";
    let stopProfileOpen: (() => void) | undefined;

    const refresh = async () => {
      const session = readSession();
      if (!session) {
        applyVisibility(false);
        defaultedForUser = "";
        stopProfileOpen?.();
        stopProfileOpen = undefined;
        return;
      }

      try {
        const profile = await fetchProfile(session.access_token, session.user.id);
        if (!profile || cancelled) return;

        const resolvedMode = resolveDashboardMode(profile);
        const hasElevatedRole = profile.roles.some((role) => elevatedRolePattern.test(role));
        const hasElevatedPermission = profile.permissions.some((permission) => elevatedPermissionPattern.test(permission));
        const specialAccountType = !["", "employee", "staff", "user"].includes(String(profile.account_type || "employee").toLowerCase());

        // A plain employee gets the clean content-only workspace. As soon as Admin grants
        // Manager/HR/Procurement/Accounts/Auditor/etc. access, the normal left navigation returns.
        const employeeOnly = resolvedMode === "employee" && !hasElevatedRole && !hasElevatedPermission && !specialAccountType;
        applyVisibility(employeeOnly);

        // For employee-only accounts, My Profile/My Info is the main landing page. The hidden
        // navigation remains in the DOM so we can use the application's existing navigation logic
        // instead of duplicating profile state or bypassing access checks.
        if (employeeOnly && defaultedForUser !== profile.id) {
          defaultedForUser = profile.id;
          stopProfileOpen?.();
          stopProfileOpen = openEmployeeProfile();
        }
      } catch {
        // Do not hide navigation when effective access cannot be confirmed.
        if (!cancelled) applyVisibility(false);
      }
    };

    void refresh();
    const events = ["sas-session-changed", "sas-session-refreshed", "sas-data-changed"];
    events.forEach((event) => window.addEventListener(event, refresh));
    return () => {
      cancelled = true;
      events.forEach((event) => window.removeEventListener(event, refresh));
      stopProfileOpen?.();
      applyVisibility(false);
    };
  }, []);

  return null;
}
