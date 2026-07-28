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
import "../app/globals.css";
import "../app/employee-shell.css";
import "../app/employee-portal-v2.css";
import "../app/handover-polish.css";
import "../app/runtime-ui-fixes.css";
import "../app/dashboard-layout-fixes.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FormOtherEnhancer />
    <DashboardPolishEnhancer />
    <PreferencesRuntimeV2 />
    <NavigationScrollEnhancer />
    <EmployeeHeaderActionsEnhancer />
    <EmployeeCalendarEnhancer />
    <EmployeeModuleCounterEnhancer />
    <SasPeopleApp />
  </StrictMode>,
);
