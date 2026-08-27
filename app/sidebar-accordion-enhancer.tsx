import { useEffect } from "react";
import { observeBody } from "./lib/dom-enhancer";

function sidebarGroups(sidebar: HTMLElement) {
  return Array.from(sidebar.children).filter((node): node is HTMLElement => {
    if (!(node instanceof HTMLElement)) return false;
    return Boolean(node.querySelector(":scope > .nav-label") && node.querySelector(":scope > .nav"));
  });
}

function prepareGroup(group: HTMLElement) {
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
    // An inline SVG rather than the "⌄" glyph, whose weight and vertical alignment shift with
    // whichever font actually resolves -- it sat noticeably high inside the round button.
    chevron.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    label.appendChild(chevron);
  }

  const setOpen = (open: boolean) => {
    group.classList.toggle("open", open);
    label.setAttribute("aria-expanded", String(open));
  };

  const toggle = () => {
    const opening = !group.classList.contains("open");
    // One section at a time: opening this one collapses its siblings.
    const sidebar = group.parentElement;
    if (opening && sidebar) {
      for (const sibling of sidebarGroups(sidebar)) {
        if (sibling === group) continue;
        sibling.classList.remove("open");
        sibling.querySelector<HTMLElement>(":scope > .nav-label")?.setAttribute("aria-expanded", "false");
      }
    }
    setOpen(opening);
  };
  const activate = (event: Event) => {
    if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key)) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    toggle();
  };

  label.addEventListener("click", activate);
  label.addEventListener("keydown", activate);

  // Open only the section holding the active page. Falling back to "or the first section" here let
  // two sections start open at once, which the accordion no longer allows; syncSidebar picks a
  // default when no section qualifies.
  setOpen(Boolean(nav.querySelector("button.active")));
}

function syncSidebar(sidebar: HTMLElement) {
  const groups = sidebarGroups(sidebar);
  groups.forEach((group) => {
    const label = group.querySelector<HTMLElement>(":scope > .nav-label");
    if (label?.dataset.accordionReady !== "true") prepareGroup(group);
  });

  // Reveal the section holding the active page, but only when nothing is open at all -- on first
  // render, or after navigating from somewhere that left every section collapsed. This used to run
  // unconditionally on every pass, so a section the user had just collapsed was immediately forced
  // back open, and opening a second one left both showing.
  if (!groups.some((group) => group.classList.contains("open"))) {
    const target = groups.find((group) => group.querySelector(":scope > .nav button.active")) ?? groups[0];
    if (target) {
      target.classList.add("open");
      target.querySelector<HTMLElement>(":scope > .nav-label")?.setAttribute("aria-expanded", "true");
    }
  }
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
