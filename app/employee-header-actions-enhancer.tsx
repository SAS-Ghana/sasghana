import { useEffect } from "react";
import { observeBody } from "./lib/dom-enhancer";

const actions = [
  { tab: "notifications", label: "Notifications", icon: "◉", kind: "tab" },
  { tab: "help", label: "Help centre", icon: "?", kind: "tab" },
  { tab: "settings", label: "Settings", icon: "⚙", kind: "tab" },
  { tab: "signout", label: "Sign out", icon: "⇥", kind: "signout" },
] as const;

// Searched only ".employee-module-tabs", a class no longer rendered anywhere, so every quick action
// in the header resolved to nothing and clicking one did nothing at all. The live strip is
// ".employee-info-tabs", and several destinations (Notifications, Settings, Help) sit behind its
// "More" menu rather than on the strip itself, so both have to be searched.
function findTabButton(tab: string, scope: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(scope))
    .find((button) => button.textContent?.trim().toLowerCase().includes(tab));
}

function openEmployeeTab(tab: string) {
  const strips = ".employee-module-tabs button,.employee-info-tabs button";
  const direct = findTabButton(tab, strips);
  if (direct) {
    direct.click();
    return;
  }

  // Not on the visible strip -- open "More" and look inside it once it has rendered.
  const more = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".employee-info-tabs button"),
  ).find((button) => button.textContent?.trim() === "More");
  if (!more) return;
  more.click();
  window.setTimeout(() => {
    findTabButton(tab, ".employee-info-more-menu button")?.click();
  }, 60);
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
