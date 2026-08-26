import { useEffect } from "react";
import { fetchProfile, readSession } from "./lib/supabase-auth";
import { resolveDashboardMode } from "./lib/dashboard-mode";
import { updateRow } from "./lib/supabase-data";

function openManagerDashboard() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  const target = buttons.find((button) => button.textContent?.trim() === "Manager Dashboard");
  if (!target) return false;
  target.click();
  return true;
}

export function ManagerLandingFix() {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    const repair = async () => {
      const session = readSession();
      if (!session) return;
      try {
        const profile = await fetchProfile(session.access_token, session.user.id);
        if (!profile || cancelled || resolveDashboardMode(profile) !== "manager") return;

        const genericLanding = !profile.preferred_dashboard || profile.preferred_dashboard === "Dashboard";
        if (genericLanding) {
          // Best effort: persist the correct manager landing page so refreshes start correctly.
          void updateRow(session.access_token, "profiles", profile.id, {
            preferred_dashboard: "Manager Dashboard",
          }).catch(() => undefined);
        }

        const shouldRepairDom =
          genericLanding ||
          document.body.textContent?.includes("This manager feature is not enabled for this account.");
        if (!shouldRepairDom) return;

        if (openManagerDashboard()) return;
        observer = new MutationObserver(() => {
          if (openManagerDashboard()) observer?.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(() => observer?.disconnect(), 8000);
      } catch {
        // Keep the existing dashboard if access cannot be resolved.
      }
    };

    void repair();
    const events = ["sas-session-changed", "sas-session-refreshed", "sas-data-changed"];
    events.forEach((event) => window.addEventListener(event, repair));
    return () => {
      cancelled = true;
      observer?.disconnect();
      events.forEach((event) => window.removeEventListener(event, repair));
    };
  }, []);

  return null;
}
