import type { DashboardMode } from "./dashboard-mode.ts";
import { resolveDashboardMode } from "./dashboard-mode.ts";
import {
  adminGroups,
  auditorGroups,
  employeeGroups,
  employeeQuickLabels,
  hrGroups,
  managerGroups,
} from "./navigation-groups.ts";

type GroupSet = readonly (readonly [
  string,
  readonly (readonly [string, string])[],
])[];

const groupsByMode: Record<DashboardMode, GroupSet> = {
  admin: adminGroups,
  hr: hrGroups,
  manager: managerGroups,
  auditor: auditorGroups,
  employee: employeeGroups,
};

// The page each role lands on when it has no usable stored preference. Must be a real entry in that
// role's navigation -- see the labels assertion in tests/dashboard-landing.test.mjs.
const homeByMode: Record<DashboardMode, string> = {
  admin: "Administrator Dashboard",
  hr: "HR Dashboard",
  manager: "Manager Dashboard",
  auditor: "Audit Dashboard",
  employee: "Home",
};

export function roleHome(mode: DashboardMode) {
  return homeByMode[mode];
}

/** Every sidebar label reachable in a role's navigation. */
export function navigationLabels(mode: DashboardMode): Set<string> {
  return new Set<string>([
    ...groupsByMode[mode].flatMap(([, items]) => items.map(([label]) => label)),
    ...(mode === "employee" ? employeeQuickLabels : []),
  ]);
}

/**
 * Landing pages an administrator may assign to a user, ordered with the role's own home first.
 *
 * This is deliberately NOT the same list as the "Dashboard access" grants in
 * account-management-page.tsx: those name feature areas ("Dashboard", "Directory", "Employees"),
 * whereas a landing page must be a sidebar label ("Manager Dashboard", "My Team"). Offering the
 * grant vocabulary here is what stored preferred_dashboard = "Dashboard" -- a label no sidebar
 * defines -- which then rendered the empty "not enabled for this account" card.
 */
export function landingOptions(mode: DashboardMode): string[] {
  const home = roleHome(mode);
  const rest = [...navigationLabels(mode)].filter((label) => label !== home);
  return [home, ...rest];
}

/**
 * Deterministically resolve the page a profile should land on.
 *
 * A stored preferred_dashboard is honoured only when it is genuinely reachable for the resolved
 * role; anything else (empty, legacy grant names, a preference left over from a previous role)
 * falls back to that role's home. Resolution is pure and synchronous, so the correct dashboard is
 * chosen on the first render -- no post-render DOM inspection or button clicking.
 */
export function resolveLandingPage(profile: {
  account_type: string;
  roles: string[];
  preferred_dashboard?: string;
}): string {
  const mode = resolveDashboardMode(profile);
  const home = roleHome(mode);
  const preferred = profile.preferred_dashboard?.trim();
  if (!preferred || preferred === home) return home;
  return navigationLabels(mode).has(preferred) ? preferred : home;
}
