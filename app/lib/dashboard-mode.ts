export type DashboardMode = "admin" | "hr" | "manager" | "auditor" | "employee";

export function resolveDashboardMode(profile: {
  account_type: string;
  roles: string[];
}): DashboardMode {
  const accountType = (profile.account_type || "employee").toLowerCase();
  const isAdmin =
    profile.roles.includes("SAS System Administrator") ||
    accountType === "administrator";
  const isHr =
    accountType === "hr" ||
    profile.roles.some((role) => /human resources|\bhr\b/i.test(role));
  const isManager =
    accountType === "manager" ||
    profile.roles.some((role) => /manager|supervisor|team lead/i.test(role));
  const isAuditor =
    accountType === "auditor" ||
    profile.roles.some((role) => /auditor|read only/i.test(role));
  const isEmployeeOnly = !isAdmin && !isHr && !isManager && !isAuditor;

  if (isEmployeeOnly) return "employee";
  if (isAdmin) return "admin";
  if (isHr) return "hr";
  if (isManager) return "manager";
  return "auditor";
}
