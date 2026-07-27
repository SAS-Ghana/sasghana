import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SasPeopleApp } from "../app/sas-people-app";
import "../app/globals.css";
import "../app/employee-shell.css";
import "../app/employee-portal-v2.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SasPeopleApp />
  </StrictMode>,
);
