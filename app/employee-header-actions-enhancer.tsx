import { useEffect } from "react";
import { observeBody } from "./lib/dom-enhancer";

const actions = [
  { tab: "notifications", label: "Notifications", icon: "◉", kind: "tab" },
  { tab: "help", label: "Help centre", icon: "?", kind: "tab" },
  { tab: "settings", label: "Settings", icon: "⚙", kind: "tab" },
  { tab: "signout", label: "Sign out", icon: "⇥", kind: "signout" },
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
        button.className = `employee-header-quick-button${action.kind === "signout" ? " signout" : ""}`;
        button.title = action.label;
        button.setAttribute("aria-label", action.label);
        button.innerHTML = `<span aria-hidden="true">${action.icon}</span><small>${action.label}</small>`;
        button.addEventListener("click", () => {
          if (action.kind === "signout") {
            window.dispatchEvent(new CustomEvent("sas-request-signout"));
            return;
          }
          openEmployeeTab(action.tab);
        });
        quick.appendChild(button);
      }

      wrapper.appendChild(quick);
    }

    // enhance() appends the quick-action buttons, so an undebounced observer on the whole subtree
    // re-entered itself on its own writes.
    return observeBody(enhance, { label: "EmployeeHeaderActionsEnhancer" });
  }, []);

  return null;
}
