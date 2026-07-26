import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SasPeopleApp } from "../app/sas-people-app";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SasPeopleApp />
  </StrictMode>,
);
