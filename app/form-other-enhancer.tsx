import { useEffect } from "react";

export function FormOtherEnhancer() {
  useEffect(() => {
    const handler = (event: Event) => {
      const select = event.target instanceof HTMLSelectElement ? event.target : null;
      if (!select) return;

      const chosen = select.options[select.selectedIndex];
      const isOther = /^other$/i.test(String(chosen?.textContent ?? "").trim())
        || /^(other|__custom__|__other__)$/i.test(select.value);
      const existing = select.parentElement?.querySelector<HTMLInputElement>(":scope > .dynamic-other-input");

      if (!isOther) {
        existing?.remove();
        delete select.dataset.customOther;
        return;
      }
      if (existing) {
        existing.focus();
        return;
      }

      const input = document.createElement("input");
      const baseName = select.name || select.id || "custom-other";
      input.type = "text";
      input.required = select.required;
      input.className = "dynamic-other-input";
      input.id = `${baseName}-other`;
      input.name = `${baseName}_other`;
      input.autocomplete = "off";
      input.placeholder = `Enter other ${select.getAttribute("aria-label") || select.closest("label")?.childNodes[0]?.textContent?.trim() || "details"}`;

      input.addEventListener("blur", () => {
        const customValue = input.value.trim();
        if (!customValue) return;
        let option = Array.from(select.options).find((item) => item.value === customValue);
        if (!option) {
          option = document.createElement("option");
          option.value = customValue;
          option.textContent = customValue;
          select.appendChild(option);
        }
        select.dataset.customOther = "true";
        select.value = customValue;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        input.remove();
      });

      select.insertAdjacentElement("afterend", input);
      input.focus();
    };

    document.addEventListener("change", handler, true);
    return () => document.removeEventListener("change", handler, true);
  }, []);

  return null;
}
