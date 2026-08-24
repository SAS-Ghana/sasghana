import { useEffect, useLayoutEffect } from "react";
import { fetchProfile, readSession } from "./lib/supabase-auth";
import { updateRow } from "./lib/supabase-data";
import { resolveDashboardMode } from "./lib/dashboard-mode";

const elevatedRolePattern = /administrator|human resources|\bhr\b|manager|supervisor|team lead|department head|procurement|accountant|finance officer|payroll officer|auditor|asset officer|compliance|recruiter|it support|branch manager/i;
const elevatedPermissionPattern = /^(procurement\.|accounts\.|users\.|roles\.|audit\.|archive\.|payroll\.(run|approve|publish)|expenses\.approve|documents\.verify|attendance\.manage)/i;

function applyVisibility(hidden: boolean) {
  document.documentElement.classList.toggle("sas-employee-sidebar-hidden", hidden);
  document.body.classList.toggle("sas-employee-sidebar-hidden", hidden);
}

function applyBooting(active: boolean) {
  document.documentElement.classList.toggle("sas-employee-profile-booting", active);
  document.body.classList.toggle("sas-employee-profile-booting", active);
}

function findMyInfoButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "My Info",
  );
}

function openEmployeeProfile() {
  const findAndOpen = () => {
    const employeeApp = document.querySelector(".app.employee-app");
    if (!employeeApp) return false;
    const target = findMyInfoButton();
    if (!target) return false;
    if (!target.classList.contains("active")) target.click();
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
  // Run before the browser paints. If this is the employee shell, open My Info immediately so
  // the legacy Home dashboard never flashes during refresh while profile data is being resolved.
  useLayoutEffect(() => {
    const employeeApp = document.querySelector(".app.employee-app");
    if (!employeeApp) return;
    applyBooting(true);
    const stop = openEmployeeProfile();
    const release = () => applyBooting(false);
    const observer = new MutationObserver(() => {
      const target = findMyInfoButton();
      if (target?.classList.contains("active") || document.querySelector(".profile-banner")) {
        observer.disconnect();
        release();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      release();
    }, 2500);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      stop();
      release();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let defaultedForUser = "";
    let stopProfileOpen: (() => void) | undefined;

    const refresh = async () => {
      const session = readSession();
      if (!session) {
        applyVisibility(false);
        applyBooting(false);
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

        const employeeOnly = resolvedMode === "employee" && !hasElevatedRole && !hasElevatedPermission && !specialAccountType;
        applyVisibility(employeeOnly);

        if (employeeOnly) {
          if (defaultedForUser !== profile.id) {
            defaultedForUser = profile.id;
            stopProfileOpen?.();
            stopProfileOpen = openEmployeeProfile();
          }

          // Persist the employee landing page so subsequent reloads initialise directly on My Info
          // instead of briefly rendering the legacy Home dashboard first.
          if (profile.preferred_dashboard !== "My Info") {
            await updateRow(session.access_token, "profiles", profile.id, {
              preferred_dashboard: "My Info",
            }).catch(() => undefined);
          }
        } else {
          applyBooting(false);
        }
      } catch {
        if (!cancelled) {
          applyVisibility(false);
          applyBooting(false);
        }
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
      applyBooting(false);
    };
  }, []);

  return null;
}
