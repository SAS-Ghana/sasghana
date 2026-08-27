import { useEffect } from "react";
import { observeBody } from "./lib/dom-enhancer";
import { fetchProfile, readSession } from "./lib/supabase-auth";
import { resolveDashboardMode } from "./lib/dashboard-mode";
import { defaultOrganisationConfig, loadOrganisationConfig } from "./lib/organisation-config";

const elevatedRolePattern = /administrator|human resources|\bhr\b|manager|supervisor|team lead|department head|procurement|accountant|finance officer|payroll officer|auditor|asset officer|compliance|recruiter|it support|branch manager/i;
const elevatedPermissionPattern = /^(procurement\.|accounts\.|users\.|roles\.|audit\.|archive\.|payroll\.(run|approve|publish)|expenses\.approve|documents\.verify|attendance\.manage)/i;

function removeBrand() {
  document.querySelector("[data-sas-employee-topbar-brand]")?.remove();
  document.querySelector("[data-sas-employee-home-button]")?.remove();
}

function openMyInfo() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  const target = buttons.find((button) => button.textContent?.trim() === "My Info");
  target?.click();
}

export function EmployeeBrandedTopbar() {
  useEffect(() => {
    let cancelled = false;

    // Who the signed-in user is only changes when the session does, so it is resolved once here and
    // cached. The observer below re-applies this decision to the DOM but must never re-resolve it:
    // the callback used to call sync() -- and therefore fetchProfile() -- behind the guard
    // "brand element is missing". For anyone but a plain employee that element is never created, so
    // the guard stayed true and every single DOM mutation kicked off another profile round trip.
    // During sign-in that meant a continuous fetch/mutate loop that starved the main thread, leaving
    // the button painted on "Signing in..." forever even though authentication had already succeeded.
    let branded: { logo: string; shortName: string } | null = null;

    /** Apply the cached decision. Synchronous and idempotent, so it is safe to run on any mutation. */
    const paint = () => {
      if (!branded) {
        removeBrand();
        return;
      }
      const topbar = document.querySelector<HTMLElement>(".topbar");
      if (!topbar) return;

      let brand = topbar.querySelector<HTMLButtonElement>("[data-sas-employee-topbar-brand]");
      if (!brand) {
        brand = document.createElement("button");
        brand.type = "button";
        brand.dataset.sasEmployeeTopbarBrand = "true";
        brand.className = "employee-topbar-brand";
        brand.setAttribute("aria-label", "Go to My Info");
        brand.addEventListener("click", openMyInfo);
        topbar.prepend(brand);
        brand.innerHTML = `
          <img src="${branded.logo.replace(/"/g, "&quot;")}" alt="${branded.shortName.replace(/"/g, "&quot;")}" />
          <div class="employee-topbar-brand-copy">
            <strong>${branded.shortName || "SAS Finance Group"}</strong>
            <small>Strength. Growth. Confidence.</small>
          </div>
        `;
      }

      if (!topbar.querySelector("[data-sas-employee-home-button]")) {
        const home = document.createElement("button");
        home.type = "button";
        home.dataset.sasEmployeeHomeButton = "true";
        home.className = "employee-home-button";
        home.innerHTML = `<span aria-hidden="true">⌂</span><span>Home</span>`;
        home.setAttribute("aria-label", "Return to My Info");
        home.addEventListener("click", openMyInfo);
        brand.insertAdjacentElement("afterend", home);
      }
    };

    /** Resolve who is signed in. Only ever called on mount and on session/branding events. */
    const sync = async () => {
      const session = readSession();
      if (!session) {
        branded = null;
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
          branded = null;
          removeBrand();
          return;
        }

        const branding = await loadOrganisationConfig(session.access_token, profile.organisation_id).catch(() => defaultOrganisationConfig);
        if (cancelled) return;

        branded = {
          logo: branding.dashboardLogoUrl || branding.logoUrl || "/logo.png",
          shortName: branding.shortName,
        };
        paint();
      } catch {
        branded = null;
        removeBrand();
      }
    };

    const stopObserving = observeBody(paint, { label: "EmployeeBrandedTopbar" });
    void sync();
    const events = ["sas-session-changed", "sas-session-refreshed", "sas-branding-changed", "sas-data-changed"];
    events.forEach((event) => window.addEventListener(event, sync));

    return () => {
      cancelled = true;
      stopObserving();
      events.forEach((event) => window.removeEventListener(event, sync));
      removeBrand();
    };
  }, []);

  return null;
}
