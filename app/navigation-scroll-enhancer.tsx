import { useEffect } from "react";

const navigationSelector = [
  ".employee-module-tabs button",
  ".employee-info-tabs button",
  ".employee-tabs button",
  ".settings-cards button",
  ".nav button",
  ".enterprise-items button",
].join(",");

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function verticalScroller(element: HTMLElement) {
  return element.closest<HTMLElement>(".main") ?? document.scrollingElement ?? document.documentElement;
}

function scrollAfterNavigation(button: HTMLButtonElement) {
  const navigation = button.closest<HTMLElement>(".employee-module-tabs,.employee-info-tabs,.employee-tabs,.settings-cards,.nav,.enterprise-items");
  const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";

  // Keep the selected item visible in long horizontal tab rows.
  button.scrollIntoView({ behavior, block: "nearest", inline: "center" });

  // Wait for React to render the selected dashboard/module before moving the screen.
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    if (navigation?.matches(".employee-module-tabs,.employee-info-tabs,.employee-tabs")) {
      const destination = navigation.nextElementSibling as HTMLElement | null;
      if (destination) {
        destination.scrollIntoView({ behavior, block: "start", inline: "nearest" });
        return;
      }
    }

    if (navigation?.matches(".settings-cards")) {
      const panel = navigation.parentElement?.querySelector<HTMLElement>(".settings-panel");
      if (panel) {
        panel.scrollIntoView({ behavior, block: "start", inline: "nearest" });
        return;
      }
    }

    const scroller = verticalScroller(button);
    if (scroller instanceof HTMLElement) scroller.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
  }));
}

export function NavigationScrollEnhancer() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>(navigationSelector);
      if (!button || button.disabled) return;
      scrollAfterNavigation(button);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
