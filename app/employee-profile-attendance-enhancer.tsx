import { createRoot, Root } from "react-dom/client";
import { useEffect } from "react";
import { fetchProfile, readSession, UserProfile } from "./lib/supabase-auth";
import { resolveDashboardMode } from "./lib/dashboard-mode";
import { QuickAttendance } from "./quick-attendance";

const HOST_CLASS = "employee-profile-quick-attendance-host";

function mountAttendance(profile: UserProfile, accessToken: string) {
  const banner = document.querySelector<HTMLElement>(".profile-banner");
  if (!banner) return false;

  let host = banner.querySelector<HTMLElement>(`.${HOST_CLASS}`);
  let root: Root | undefined = (host as (HTMLElement & { __sasRoot?: Root }) | null)?.__sasRoot;

  if (!host) {
    host = document.createElement("div");
    host.className = HOST_CLASS;
    banner.appendChild(host);
  }

  const typedHost = host as HTMLElement & { __sasRoot?: Root };
  if (!root) {
    root = createRoot(host);
    typedHost.__sasRoot = root;
  }

  root.render(<QuickAttendance accessToken={accessToken} profile={profile} compact />);
  return true;
}

export function EmployeeProfileAttendanceEnhancer() {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | undefined;

    const refresh = async () => {
      const session = readSession();
      if (!session) return;
      const profile = await fetchProfile(session.access_token, session.user.id).catch(() => null);
      if (!profile || cancelled || resolveDashboardMode(profile) !== "employee") return;

      const tryMount = () => mountAttendance(profile, session.access_token);
      if (tryMount()) return;

      observer?.disconnect();
      observer = new MutationObserver(() => {
        if (tryMount()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    };

    void refresh();
    const events = ["sas-session-changed", "sas-session-refreshed", "sas-data-changed"];
    events.forEach((event) => window.addEventListener(event, refresh));

    return () => {
      cancelled = true;
      observer?.disconnect();
      events.forEach((event) => window.removeEventListener(event, refresh));
      const host = document.querySelector<HTMLElement & { __sasRoot?: Root }>(`.${HOST_CLASS}`);
      host?.__sasRoot?.unmount();
      host?.remove();
    };
  }, []);

  return null;
}
