import { useEffect } from "react";
import {
  fetchProfile,
  readSession,
  saveSession,
  sendEmailLoginCode,
  setEmailTwoStep,
  verifyEmailLoginCode,
} from "./lib/supabase-auth";
import { createRow, listRowsWhereUnordered, updateRowsWhere } from "./lib/supabase-data";
import {
  applyPreferences,
  getStoredPreferences,
  preferenceDefaults,
  Preferences,
  supportedLanguages,
  translateVisibleText,
} from "./user-preferences-panel";

function addOption(select: HTMLSelectElement, value: string, label = value) {
  if (Array.from(select.options).some((option) => option.value === value)) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return domain ? `${name.slice(0, 2)}***@${domain}` : "your email";
}

export function PreferencesRuntimeV2() {
  useEffect(() => {
    let stopped = false;
    let exists = false;
    let queued = false;
    let observer: MutationObserver | null = null;
    let token = "";
    let profileId = "";
    let organisationId = "";
    let email = "";
    let preferences: Preferences = getStoredPreferences();

    function observe() {
      observer?.observe(document.body, { childList: true, subtree: true });
    }

    function withoutObserver(callback: () => void) {
      observer?.disconnect();
      try {
        callback();
      } finally {
        if (!stopped) observe();
      }
    }

    function settingsCard() {
      return Array.from(document.querySelectorAll<HTMLElement>(".settings-grid article")).find(
        (card) => card.querySelectorAll("select").length >= 3,
      ) ?? null;
    }

    function identifyControl(select: HTMLSelectElement, key: string, id: string) {
      select.dataset.preference = key;
      select.id = select.id || id;
      select.name = select.name || key;
      const label = select.closest("label");
      if (label) label.htmlFor = select.id;
    }

    function ensurePreferenceField(
      card: HTMLElement,
      labelText: string,
      key: "text_size" | "ui_density",
      id: string,
      options: readonly (readonly [string, string])[],
    ) {
      let select = card.querySelector<HTMLSelectElement>(`select[data-preference='${key}']`);
      if (!select) {
        const label = document.createElement("label");
        label.textContent = labelText;
        label.htmlFor = id;
        select = document.createElement("select");
        select.dataset.preference = key;
        select.id = id;
        select.name = key;
        for (const [value, text] of options) addOption(select, value, text);
        label.appendChild(select);
        card.insertBefore(label, card.querySelector("button"));
      }
      select.value = String(preferences[key]);
    }

    function decorateSettings() {
      const card = settingsCard();
      if (card) {
        const selects = Array.from(card.querySelectorAll<HTMLSelectElement>("select"));
        if (selects[0]) {
          identifyControl(selects[0], "language", "preferences-language");
          for (const [value, label] of supportedLanguages) addOption(selects[0], value, label);
          selects[0].value = preferences.language;
        }
        if (selects[1]) {
          identifyControl(selects[1], "theme", "preferences-theme");
          selects[1].value = preferences.theme;
        }
        if (selects[2]) {
          identifyControl(selects[2], "accessibility", "preferences-accessibility");
          addOption(selects[2], "reduced-motion", "Reduced motion");
          selects[2].value = preferences.accessibility;
        }

        ensurePreferenceField(
          card,
          "Text size",
          "text_size",
          "preferences-text-size",
          [["small", "Small"], ["medium", "Medium"], ["large", "Large"]],
        );
        ensurePreferenceField(
          card,
          "Interface size",
          "ui_density",
          "preferences-interface-size",
          [["compact", "Compact tabs and buttons"], ["comfortable", "Comfortable"]],
        );

        const saveButton = card.querySelector<HTMLButtonElement>("button");
        if (saveButton) {
          saveButton.dataset.settingsAction = "save";
          saveButton.type = "button";
        }
      }

      const cards = Array.from(document.querySelectorAll<HTMLElement>(".settings-grid article"));
      for (const button of document.querySelectorAll<HTMLButtonElement>(".settings-grid button")) {
        button.type = "button";
        const text = (button.textContent ?? "").trim().toLowerCase();
        if (/privacy|confidentialité|privacidad|隐私|ameŋutinya/.test(text)) button.dataset.settingsAction = "privacy";
        else if (/connected device|appareil|dispositivo|设备|mɔ̃/.test(text)) button.dataset.settingsAction = "device";
        else if (/two-factor|two factor|two step|deux étapes|dos pasos|两步|verification for login|email verification/.test(text)) button.dataset.settingsAction = "two-step";
      }

      const accountCard = cards[0];
      if (accountCard) {
        const accountButtons = Array.from(accountCard.querySelectorAll<HTMLButtonElement>("button"));
        const securityButton = accountButtons.find((button) => /two|verification/i.test(button.textContent ?? ""));
        if (securityButton) securityButton.dataset.settingsAction = "two-step";
      }

      const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".employee-module-tabs button"));
      const communications = tabs.find((button) => /communication|comunicaciones|通讯|nkitahodi|kasemɔ|dɔmedzoe/i.test(button.textContent ?? ""));
      if (communications) {
        const icon = communications.querySelector("span");
        for (const node of Array.from(communications.childNodes)) {
          if (node !== icon && node.nodeType === Node.TEXT_NODE) node.textContent = "Comms";
        }
      }
    }

    function syncControls() {
      const card = settingsCard();
      if (!card) return;
      for (const [key, value] of Object.entries({
        language: preferences.language,
        theme: preferences.theme,
        accessibility: preferences.accessibility,
        text_size: preferences.text_size,
        ui_density: preferences.ui_density,
      })) {
        const select = card.querySelector<HTMLSelectElement>(`select[data-preference='${key}']`);
        if (select && select.value !== value) select.value = value;
      }
    }

    function refreshInterface() {
      withoutObserver(() => {
        decorateSettings();
        syncControls();
        translateVisibleText(preferences.language);
      });
    }

    function scheduleRefresh() {
      if (queued || stopped) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        refreshInterface();
      });
    }

    async function boot() {
      applyPreferences(preferences);
      const session = readSession();
      if (!session) {
        scheduleRefresh();
        return;
      }
      token = session.access_token;
      const profile = await fetchProfile(token, session.user.id);
      if (!profile || stopped) return;
      profileId = profile.id;
      organisationId = profile.organisation_id;
      email = profile.email || session.user.email || "";
      const rows = await listRowsWhereUnordered(token, "user_preferences", { profile_id: profileId }, "*", 1).catch(() => []);
      if (rows[0]) {
        preferences = { ...preferenceDefaults, ...rows[0] } as Preferences;
        exists = true;
      }
      applyPreferences(preferences);
      scheduleRefresh();
    }

    async function persist() {
      if (!profileId || !organisationId) throw new Error("Your account preferences could not be identified.");
      const payload = {
        ...preferences,
        profile_id: profileId,
        organisation_id: organisationId,
        updated_at: new Date().toISOString(),
      };
      if (exists) await updateRowsWhere(token, "user_preferences", "profile_id", profileId, payload);
      else {
        await createRow(token, "user_preferences", payload);
        exists = true;
      }
      applyPreferences(preferences);
    }

    function showMessage(button: HTMLElement, text: string, isError = false) {
      let note = button.parentElement?.querySelector<HTMLElement>(".runtime-preference-message");
      if (!note) {
        note = document.createElement("p");
        note.className = "runtime-preference-message";
        note.setAttribute("aria-live", "polite");
        button.parentElement?.insertBefore(note, button);
      }
      note.className = isError ? "form-error runtime-preference-message" : "form-message runtime-preference-message";
      note.textContent = text;
    }

    function readPreferenceControls() {
      const card = settingsCard();
      if (!card) return;
      const value = (key: string, fallback: string) => card.querySelector<HTMLSelectElement>(`select[data-preference='${key}']`)?.value || fallback;
      preferences = {
        ...preferences,
        language: value("language", preferences.language),
        theme: value("theme", preferences.theme) as Preferences["theme"],
        accessibility: value("accessibility", preferences.accessibility) as Preferences["accessibility"],
        text_size: value("text_size", preferences.text_size) as Preferences["text_size"],
        ui_density: value("ui_density", preferences.ui_density) as Preferences["ui_density"],
      };
    }

    async function savePreferences(button: HTMLElement) {
      readPreferenceControls();
      try {
        await persist();
        showMessage(button, "Preferences saved and applied across all dashboards.");
      } catch (cause) {
        showMessage(button, cause instanceof Error ? cause.message : "Preferences could not be saved.", true);
      }
    }

    function modalShell(eyebrow: string, title: string) {
      const wrapper = document.createElement("div");
      wrapper.className = "modal-backdrop";
      wrapper.innerHTML = `<section class="modal record-modal settings-modal" role="dialog" aria-modal="true"><button type="button" class="modal-close" aria-label="Close">×</button><span class="eyebrow">${eyebrow}</span><h2>${title}</h2><div class="settings-modal-body"></div></section>`;
      document.body.appendChild(wrapper);
      const close = () => wrapper.remove();
      wrapper.addEventListener("mousedown", (event) => { if (event.target === wrapper) close(); });
      wrapper.querySelector(".modal-close")?.addEventListener("click", close);
      scheduleRefresh();
      return { body: wrapper.querySelector(".settings-modal-body") as HTMLElement, close };
    }

    function openPrivacy() {
      const { body, close } = modalShell("Personal privacy", "Privacy settings");
      body.innerHTML = `<form class="privacy-form"><label for="runtime-profile-visibility">Profile visibility<select id="runtime-profile-visibility" name="profile_visibility"><option value="private">Private</option><option value="team">My team</option><option value="organisation">Organisation</option></select></label><div class="privacy-options">${[
        ["show_email", "Show email"],
        ["show_phone", "Show phone"],
        ["show_birthday", "Show birthday"],
        ["show_last_active", "Show last active"],
        ["allow_location_for_attendance", "Allow GPS for attendance"],
        ["allow_ai_personalisation", "Allow AI personalisation"],
      ].map(([key, label]) => `<label class="check" for="runtime-${key}"><input id="runtime-${key}" name="${key}" type="checkbox"><span>${label}</span></label>`).join("")}</div><p class="runtime-modal-message" hidden></p><div class="form-actions"><button type="button" class="secondary cancel">Cancel</button><button type="submit" class="primary">Save privacy</button></div></form>`;
      const form = body.querySelector("form")!;
      (form.elements.namedItem("profile_visibility") as HTMLSelectElement).value = preferences.profile_visibility;
      for (const key of ["show_email", "show_phone", "show_birthday", "show_last_active", "allow_location_for_attendance", "allow_ai_personalisation"] as const) {
        const input = form.elements.namedItem(key) as HTMLInputElement | null;
        if (input) input.checked = preferences[key];
      }
      body.querySelector(".cancel")?.addEventListener("click", close);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        preferences = {
          ...preferences,
          profile_visibility: String(data.get("profile_visibility")) as Preferences["profile_visibility"],
          show_email: data.has("show_email"),
          show_phone: data.has("show_phone"),
          show_birthday: data.has("show_birthday"),
          show_last_active: data.has("show_last_active"),
          allow_location_for_attendance: data.has("allow_location_for_attendance"),
          allow_ai_personalisation: data.has("allow_ai_personalisation"),
        };
        try {
          await persist();
          close();
        } catch (cause) {
          const note = body.querySelector<HTMLElement>(".runtime-modal-message")!;
          note.hidden = false;
          note.className = "form-error runtime-modal-message";
          note.textContent = cause instanceof Error ? cause.message : "Privacy settings could not be saved.";
        }
      });
    }

    function openDevice() {
      const { body, close } = modalShell("Active session", "Connected device");
      body.innerHTML = `<div class="device-details"><div><strong>Browser and device</strong><span>${navigator.userAgent}</span></div><div><strong>Platform</strong><span>${navigator.platform || "Current device"}</span></div><div><strong>Language</strong><span>${navigator.language}</span></div><div><strong>Last active</strong><span>${new Date().toLocaleString("en-GB")}</span></div></div><div class="form-actions"><button type="button" class="secondary close-device">Close</button></div>`;
      body.querySelector(".close-device")?.addEventListener("click", close);
    }

    async function openTwoStep() {
      const rows = await listRowsWhereUnordered(token, "profiles", { id: profileId }, "two_step_email_enabled,email", 1).catch(() => []);
      let enabled = Boolean(rows[0]?.two_step_email_enabled);
      let wanted = enabled;
      let sent = false;
      const address = String(rows[0]?.email || email || "");
      const { body } = modalShell("Account security", "Email two step verification");
      body.innerHTML = `<p class="muted">Require a six digit email code after your password is accepted.</p><div class="security-status"><strong>Status</strong><span class="status-pill ${enabled ? "active" : "inactive"}">${enabled ? "Enabled" : "Disabled"}</span></div><label class="check security-toggle" for="runtime-two-step-toggle"><input id="runtime-two-step-toggle" name="two_step_email_enabled" type="checkbox" class="two-step-toggle" ${enabled ? "checked" : ""}><span>Enable email verification for login</span></label><div class="two-step-code" hidden><p class="muted">Enter the code sent to <strong>${maskEmail(address)}</strong>.</p><label for="runtime-two-step-code">Verification code<input id="runtime-two-step-code" name="verification_code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></label><button class="secondary resend" type="button">Resend code</button></div><p class="two-step-note" hidden></p><div class="form-actions"><button type="button" class="primary save-security">${enabled ? "Enabled" : "Send verification code"}</button></div>`;
      const toggle = body.querySelector<HTMLInputElement>(".two-step-toggle")!;
      const codeBox = body.querySelector<HTMLElement>(".two-step-code")!;
      const input = codeBox.querySelector<HTMLInputElement>("input")!;
      const button = body.querySelector<HTMLButtonElement>(".save-security")!;
      const note = body.querySelector<HTMLElement>(".two-step-note")!;
      const show = (text: string, isError = false) => {
        note.hidden = false;
        note.className = isError ? "form-error two-step-note" : "form-message two-step-note";
        note.textContent = text;
      };
      const setBusy = (state: boolean) => {
        button.disabled = state;
        toggle.disabled = state;
        button.textContent = state ? "Please wait…" : !wanted ? "Disable verification" : enabled ? "Enabled" : sent ? "Verify and enable" : "Send verification code";
      };
      async function send() {
        const session = readSession();
        if (!session) throw new Error("Your session expired. Sign in again.");
        if (!address || address.endsWith("@saspeople.local")) throw new Error("Add a valid work email before enabling verification.");
        await sendEmailLoginCode(session, address);
        sent = true;
        codeBox.hidden = false;
        input.focus();
        show(`A six digit code was sent to ${maskEmail(address)}.`);
      }
      toggle.addEventListener("change", () => {
        wanted = toggle.checked;
        if (!wanted) {
          sent = false;
          input.value = "";
          codeBox.hidden = true;
        }
        setBusy(false);
      });
      body.querySelector(".resend")?.addEventListener("click", async () => {
        setBusy(true);
        try {
          await send();
        } catch (cause) {
          show(cause instanceof Error ? cause.message : "The code could not be sent.", true);
        } finally {
          setBusy(false);
        }
      });
      button.addEventListener("click", async () => {
        setBusy(true);
        try {
          if (!wanted) {
            await setEmailTwoStep(token, false);
            enabled = false;
            show("Email two step verification is disabled.");
            return;
          }
          if (enabled) {
            show("Email two step verification is already enabled.");
            return;
          }
          if (!sent) {
            await send();
            return;
          }
          const code = input.value.replace(/\D/g, "");
          if (code.length !== 6) throw new Error("Enter the complete six digit code.");
          const verified = await verifyEmailLoginCode(address, code);
          await setEmailTwoStep(verified.access_token, true);
          saveSession(verified, Boolean(localStorage.getItem("sas-people-session")));
          token = verified.access_token;
          enabled = true;
          wanted = true;
          codeBox.hidden = true;
          const status = body.querySelector<HTMLElement>(".security-status span")!;
          status.textContent = "Enabled";
          status.className = "status-pill active";
          show("Email two step verification is enabled.");
        } catch (cause) {
          show(cause instanceof Error ? cause.message : "Security setting could not be updated.", true);
        } finally {
          setBusy(false);
        }
      });
    }

    function handleChange(event: Event) {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[data-preference]");
      if (!select) return;
      const key = select.dataset.preference as keyof Preferences | undefined;
      if (!key) return;
      preferences = { ...preferences, [key]: select.value } as Preferences;
      applyPreferences(preferences);
      scheduleRefresh();
    }

    function handleClick(event: MouseEvent) {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
      const action = button?.dataset.settingsAction;
      if (!button || !action) return;
      event.preventDefault();
      if (action === "save") void savePreferences(button);
      else if (action === "privacy") openPrivacy();
      else if (action === "device") openDevice();
      else if (action === "two-step") void openTwoStep();
    }

    function handlePreferencesChanged(event: Event) {
      const detail = (event as CustomEvent<Preferences>).detail;
      if (detail) preferences = { ...preferences, ...detail };
      scheduleRefresh();
    }

    document.addEventListener("change", handleChange, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("sas-preferences-changed", handlePreferencesChanged);
    observer = new MutationObserver(scheduleRefresh);
    observe();
    void boot();

    return () => {
      stopped = true;
      observer?.disconnect();
      document.removeEventListener("change", handleChange, true);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("sas-preferences-changed", handlePreferencesChanged);
    };
  }, []);

  return null;
}
