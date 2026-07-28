import { useEffect } from "react";

const actions = [
  { tab: "notifications", label: "Notifications", icon: "◉" },
  { tab: "help", label: "Help centre", icon: "?" },
  { tab: "settings", label: "Settings", icon: "⚙" },
] as const;

function openEmployeeTab(tab: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".employee-module-tabs button"));
  const target = buttons.find(button => button.textContent?.trim().toLowerCase().includes(tab));
  target?.click();
}

export function EmployeeHeaderActionsEnhancer() {
  useEffect(() => {
    function enhance() {
      const header = document.querySelector<HTMLElement>(".employee-portal-header");
      const date = header?.querySelector<HTMLElement>(".employee-date");
      if (!header || !date || header.querySelector(".employee-header-quick-actions")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "employee-header-right";
      date.parentElement?.insertBefore(wrapper, date);
      wrapper.appendChild(date);

      const quick = document.createElement("div");
      quick.className = "employee-header-quick-actions";
      quick.setAttribute("aria-label", "Quick links");

      for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "employee-header-quick-button";
        button.title = action.label;
        button.setAttribute("aria-label", action.label);
        button.innerHTML = `<span aria-hidden="true">${action.icon}</span><small>${action.label}</small>`;
        button.addEventListener("click", () => openEmployeeTab(action.tab));
        quick.appendChild(button);
      }

      wrapper.appendChild(quick);
    }

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
