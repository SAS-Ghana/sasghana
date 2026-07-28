import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SasPeopleApp } from "../app/sas-people-app";
import { FormOtherEnhancer } from "../app/form-other-enhancer";
import { DashboardPolishEnhancer } from "../app/dashboard-polish-enhancer";
import { PreferencesRuntimeEnhancer } from "../app/preferences-runtime-enhancer";
import "../app/globals.css";
import "../app/employee-shell.css";
import "../app/employee-portal-v2.css";
import "../app/handover-polish.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FormOtherEnhancer />
    <DashboardPolishEnhancer />
    <PreferencesRuntimeEnhancer />
    <SasPeopleApp />
  </StrictMode>,
);
