import "../app/runtime-data-fixes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SasPeopleApp } from "../app/sas-people-app";
import { FormOtherEnhancer } from "../app/form-other-enhancer";
import { DashboardPolishEnhancer } from "../app/dashboard-polish-enhancer";
import { PreferencesRuntimeV2 } from "../app/preferences-runtime-v2";
import { NavigationScrollEnhancer } from "../app/navigation-scroll-enhancer";
import { EmployeeHeaderActionsEnhancer } from "../app/employee-header-actions-enhancer";
import { EmployeeCalendarEnhancer } from "../app/employee-calendar-enhancer";
import { EmployeeModuleCounterEnhancer } from "../app/employee-module-counter-enhancer";
import { EmployeeSidebarVisibility } from "../app/employee-sidebar-visibility";
import { EmployeeBrandedTopbar } from "../app/employee-branded-topbar";
import { EmployeeProfileAttendanceEnhancer } from "../app/employee-profile-attendance-enhancer";
import { SidebarAccordionEnhancer } from "../app/sidebar-accordion-enhancer";
import { RoleDashboardLandingFix } from "../app/role-dashboard-landing-fix";
import "../app/globals.css";
import "../app/design-system.css";
import "../app/employee-shell.css";
import "../app/employee-portal-v2.css";
import "../app/employee-profile-redesign.css";
import "../app/handover-polish.css";
import "../app/runtime-ui-fixes.css";
import "../app/dashboard-layout-fixes.css";
import "../app/dashboard-home-v2.css";
import "../app/sas-reference-dashboard.css";
import "../app/enterprise-home-widgets.css";
import "../app/accountant-dashboard.css";
import "../app/dashboard-todo.css";
import "../app/employee-sidebar-visibility.css";
import "../app/employee-branded-topbar.css";
import "../app/employee-profile-attendance-enhancer.css";
import "../app/mobile-dashboard-fixes.css";
import "../app/compact-dashboard-ui.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FormOtherEnhancer />
    <DashboardPolishEnhancer />
    <PreferencesRuntimeV2 />
    <NavigationScrollEnhancer />
    <EmployeeHeaderActionsEnhancer />
    <EmployeeCalendarEnhancer />
    <EmployeeModuleCounterEnhancer />
    <EmployeeSidebarVisibility />
    <EmployeeBrandedTopbar />
    <EmployeeProfileAttendanceEnhancer />
    <SidebarAccordionEnhancer />
    <RoleDashboardLandingFix />
    <SasPeopleApp />
  </StrictMode>,
);