export type DashboardMode = "admin" | "hr" | "manager" | "auditor" | "employee";

export function resolveDashboardMode(profile: {
  account_type: string;
  roles: string[];
}): DashboardMode {
  const accountType = (profile.account_type || "employee").toLowerCase();
  const isAdmin =
    profile.roles.includes("SAS System Administrator") ||
    accountType === "administrator";
  const isAccountant =
    accountType === "accountant" ||
    profile.roles.some((role) => /accountant|finance officer|payroll officer/i.test(role));
  const isHr =
    accountType === "hr" ||
    profile.roles.some((role) => /human resources|\bhr\b/i.test(role));
  const isManager =
    accountType === "manager" ||
    profile.roles.some((role) => /manager|supervisor|team lead|department head/i.test(role));
  const isAuditor =
    accountType === "auditor" ||
    profile.roles.some((role) => /auditor|read only/i.test(role));
  const isEmployeeOnly = !isAdmin && !isAccountant && !isHr && !isManager && !isAuditor;

  if (isEmployeeOnly) return "employee";
  if (isAdmin) return "admin";
  // Accountant currently reuses the manager shell/navigation so finance users retain
  // employee self-service plus approval access. ManagerDashboard renders the dedicated
  // AccountantDashboard whenever this role is present.
  if (isAccountant) return "manager";
  if (isHr) return "hr";
  if (isManager) return "manager";
  return "auditor";
}
