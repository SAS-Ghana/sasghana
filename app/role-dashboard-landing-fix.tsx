import { useEffect } from "react";

const roleDashboards = [
  "Administrator Dashboard",
  "HR Dashboard",
  "Manager Dashboard",
  "Audit Dashboard",
] as const;

function findDashboardButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar button, .nav button")).find(
    (button) => button.textContent?.replace(/\s+/g, " ").trim().includes(label),
  );
}

function repairRoleLanding() {
  const content = document.querySelector<HTMLElement>(".content");
  if (!content) return;

  const text = content.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const invalidRolePage = /feature is not enabled for this account/i.test(text);
  const genericDashboardPage = /^Dashboard\b/i.test(text) && invalidRolePage;
  if (!invalidRolePage && !genericDashboardPage) return;

  for (const label of roleDashboards) {
    const button = findDashboardButton(label);
    if (!button) continue;

    content.style.visibility = "hidden";
    button.click();
    requestAnimationFrame(() => {
      content.style.visibility = "";
    });
    return;
  }
}

export function RoleDashboardLandingFix() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(repairRoleLanding);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("sas-session-changed", schedule);
    window.addEventListener("sas-session-refreshed", schedule);
    window.addEventListener("sas-data-changed", schedule);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("sas-session-changed", schedule);
      window.removeEventListener("sas-session-refreshed", schedule);
      window.removeEventListener("sas-data-changed", schedule);
    };
  }, []);

  return null;
}
