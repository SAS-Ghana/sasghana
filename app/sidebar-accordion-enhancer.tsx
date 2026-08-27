import { useEffect } from "react";
import { observeBody } from "./lib/dom-enhancer";

function sidebarGroups(sidebar: HTMLElement) {
  return Array.from(sidebar.children).filter((node): node is HTMLElement => {
    if (!(node instanceof HTMLElement)) return false;
    return Boolean(node.querySelector(":scope > .nav-label") && node.querySelector(":scope > .nav"));
  });
}

function prepareGroup(group: HTMLElement, index: number) {
  const label = group.querySelector<HTMLElement>(":scope > .nav-label");
  const nav = group.querySelector<HTMLElement>(":scope > .nav");
  if (!label || !nav) return;

  group.classList.add("sidebar-accordion-group");
  label.classList.add("sidebar-accordion-trigger");
  label.setAttribute("role", "button");
  label.setAttribute("tabindex", "0");
  label.setAttribute("aria-expanded", "false");
  label.dataset.accordionReady = "true";

  let chevron = label.querySelector<HTMLElement>(".sidebar-accordion-chevron");
  if (!chevron) {
    chevron = document.createElement("span");
    chevron.className = "sidebar-accordion-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    label.appendChild(chevron);
  }

  const setOpen = (open: boolean) => {
    group.classList.toggle("open", open);
    label.setAttribute("aria-expanded", String(open));
  };

  const toggle = () => setOpen(!group.classList.contains("open"));
  const activate = (event: Event) => {
    if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key)) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    toggle();
  };

  label.addEventListener("click", activate);
  label.addEventListener("keydown", activate);

  const activeInside = Boolean(nav.querySelector("button.active"));
  setOpen(activeInside || index === 0);
}

function syncSidebar(sidebar: HTMLElement) {
  const groups = sidebarGroups(sidebar);
  groups.forEach((group, index) => {
    const label = group.querySelector<HTMLElement>(":scope > .nav-label");
    if (label?.dataset.accordionReady !== "true") prepareGroup(group, index);
  });

  // Whenever navigation changes, keep the section containing the active page open.
  groups.forEach((group) => {
    if (group.querySelector(":scope > .nav button.active")) {
      group.classList.add("open");
      group.querySelector<HTMLElement>(":scope > .nav-label")?.setAttribute("aria-expanded", "true");
    }
  });
}

export function SidebarAccordionEnhancer() {
  useEffect(() => {
    // syncSidebar() adds `open` classes, so watching `class` across the whole subtree used to feed
    // this observer its own writes. observeBody() detaches while the pass runs.
    return observeBody(
      () => document.querySelectorAll<HTMLElement>(".sidebar").forEach(syncSidebar),
      { label: "SidebarAccordionEnhancer", attributeFilter: ["class"] },
    );
  }, []);

  return null;
}
