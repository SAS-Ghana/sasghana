import { useEffect } from "react";
import { fetchProfile, readSession } from "./lib/supabase-auth";
import { resolveDashboardMode } from "./lib/dashboard-mode";
import { defaultOrganisationConfig, loadOrganisationConfig } from "./lib/organisation-config";

const elevatedRolePattern = /administrator|human resources|\bhr\b|manager|supervisor|team lead|department head|procurement|accountant|finance officer|payroll officer|auditor|asset officer|compliance|recruiter|it support|branch manager/i;
const elevatedPermissionPattern = /^(procurement\.|accounts\.|users\.|roles\.|audit\.|archive\.|payroll\.(run|approve|publish)|expenses\.approve|documents\.verify|attendance\.manage)/i;

function removeBrand() {
  document.querySelector("[data-sas-employee-topbar-brand]")?.remove();
}

export function EmployeeBrandedTopbar() {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const session = readSession();
      if (!session) {
        removeBrand();
        return;
      }

      try {
        const profile = await fetchProfile(session.access_token, session.user.id);
        if (!profile || cancelled) return;
        const mode = resolveDashboardMode(profile);
        const hasElevatedRole = profile.roles.some((role) => elevatedRolePattern.test(role));
        const hasElevatedPermission = profile.permissions.some((permission) => elevatedPermissionPattern.test(permission));
        const specialAccountType = !["", "employee", "staff", "user"].includes(String(profile.account_type || "employee").toLowerCase());
        const employeeOnly = mode === "employee" && !hasElevatedRole && !hasElevatedPermission && !specialAccountType;

        if (!employeeOnly) {
          removeBrand();
          return;
        }

        const topbar = document.querySelector<HTMLElement>(".topbar");
        if (!topbar) return;

        const branding = await loadOrganisationConfig(session.access_token, profile.organisation_id).catch(() => defaultOrganisationConfig);
        if (cancelled) return;

        let brand = topbar.querySelector<HTMLElement>("[data-sas-employee-topbar-brand]");
        if (!brand) {
          brand = document.createElement("div");
          brand.dataset.sasEmployeeTopbarBrand = "true";
          brand.className = "employee-topbar-brand";
          topbar.prepend(brand);
        }

        const logo = branding.dashboardLogoUrl || branding.logoUrl || "/logo.png";
        brand.innerHTML = `
          <img src="${logo.replace(/"/g, "&quot;")}" alt="${branding.shortName.replace(/"/g, "&quot;")}" />
          <div class="employee-topbar-brand-copy">
            <strong>${branding.shortName || "SAS Finance Group"}</strong>
            <small>Strength. Growth. Confidence.</small>
          </div>
        `;
      } catch {
        removeBrand();
      }
    };

    const observer = new MutationObserver(() => {
      if (document.querySelector(".topbar") && !document.querySelector("[data-sas-employee-topbar-brand]")) void sync();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    void sync();
    const events = ["sas-session-changed", "sas-session-refreshed", "sas-branding-changed", "sas-data-changed"];
    events.forEach((event) => window.addEventListener(event, sync));

    return () => {
      cancelled = true;
      observer.disconnect();
      events.forEach((event) => window.removeEventListener(event, sync));
      removeBrand();
    };
  }, []);

  return null;
}
