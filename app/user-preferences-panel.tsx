import { FormEvent, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import {
  readSession,
  saveSession,
  sendEmailLoginCode,
  setEmailTwoStep,
  verifyEmailLoginCode,
} from "./lib/supabase-auth";
import {
  createRow,
  DataRow,
  listRowsWhereUnordered,
  updateRowsWhere,
} from "./lib/supabase-data";

export type Preferences = {
  language: string;
  theme: "system" | "light" | "dark";
  accessibility: "standard" | "large-text" | "high-contrast" | "reduced-motion";
  text_size: "small" | "medium" | "large";
  ui_density: "compact" | "comfortable";
  profile_visibility: "private" | "team" | "organisation";
  show_email: boolean;
  show_phone: boolean;
  show_birthday: boolean;
  show_last_active: boolean;
  allow_location_for_attendance: boolean;
  allow_ai_personalisation: boolean;
};

export const preferenceDefaults: Preferences = {
  language: "English",
  theme: "system",
  accessibility: "standard",
  text_size: "medium",
  ui_density: "comfortable",
  profile_visibility: "team",
  show_email: true,
  show_phone: false,
  show_birthday: false,
  show_last_active: true,
  allow_location_for_attendance: true,
  allow_ai_personalisation: true,
};

export const supportedLanguages = [
  ["English", "English"],
  ["French", "Français"],
  ["Spanish", "Español"],
  ["Chinese", "中文"],
  ["Twi", "Twi"],
  ["Ga", "Ga"],
  ["Ewe", "Eʋegbe"],
] as const;

const translations: Record<string, Record<string, string>> = {
  French: {
    Settings: "Paramètres",
    Preferences: "Préférences",
    Language: "Langue",
    Theme: "Thème",
    Accessibility: "Accessibilité",
    "Text size": "Taille du texte",
    "Interface size": "Taille de l’interface",
    "Save preferences": "Enregistrer les préférences",
    Notifications: "Notifications",
    "Notification preferences": "Préférences de notification",
    "Privacy settings": "Paramètres de confidentialité",
    "Connected devices": "Appareils connectés",
    "Change password": "Changer le mot de passe",
    "Sign out": "Se déconnecter",
    "Help Center": "Centre d’aide",
    Attendance: "Présence",
    Leave: "Congé",
    Payroll: "Paie",
    Documents: "Documents",
    Performance: "Performance",
    Benefits: "Avantages",
    Calendar: "Calendrier",
    Comms: "Comms",
    "My Profile": "Mon profil",
    Overview: "Aperçu",
    Tasks: "Tâches",
    Expenses: "Dépenses",
    Assets: "Actifs",
  },
  Spanish: {
    Settings: "Configuración",
    Preferences: "Preferencias",
    Language: "Idioma",
    Theme: "Tema",
    Accessibility: "Accesibilidad",
    "Text size": "Tamaño del texto",
    "Interface size": "Tamaño de la interfaz",
    "Save preferences": "Guardar preferencias",
    Notifications: "Notificaciones",
    "Notification preferences": "Preferencias de notificación",
    "Privacy settings": "Configuración de privacidad",
    "Connected devices": "Dispositivos conectados",
    "Change password": "Cambiar contraseña",
    "Sign out": "Cerrar sesión",
    "Help Center": "Centro de ayuda",
    Attendance: "Asistencia",
    Leave: "Permisos",
    Payroll: "Nómina",
    Documents: "Documentos",
    Performance: "Rendimiento",
    Benefits: "Beneficios",
    Calendar: "Calendario",
    Comms: "Comunicaciones",
    "My Profile": "Mi perfil",
    Overview: "Resumen",
    Tasks: "Tareas",
    Expenses: "Gastos",
    Assets: "Activos",
  },
  Chinese: {
    Settings: "设置",
    Preferences: "偏好设置",
    Language: "语言",
    Theme: "主题",
    Accessibility: "辅助功能",
    "Text size": "文字大小",
    "Interface size": "界面大小",
    "Save preferences": "保存偏好",
    Notifications: "通知",
    "Notification preferences": "通知偏好",
    "Privacy settings": "隐私设置",
    "Connected devices": "已连接设备",
    "Change password": "更改密码",
    "Sign out": "退出登录",
    "Help Center": "帮助中心",
    Attendance: "考勤",
    Leave: "请假",
    Payroll: "工资",
    Documents: "文件",
    Performance: "绩效",
    Benefits: "福利",
    Calendar: "日历",
    Comms: "通讯",
    "My Profile": "我的资料",
    Overview: "概览",
    Tasks: "任务",
    Expenses: "费用",
    Assets: "资产",
  },
  Twi: {
    Settings: "Nhyehyɛe",
    Preferences: "Apɛdeɛ",
    Language: "Kasa",
    Theme: "Ahwɛbea",
    Accessibility: "Mmoa",
    "Text size": "Nkyerɛwee kɛse",
    "Interface size": "Anim kɛse",
    "Save preferences": "Kora apɛdeɛ",
    Overview: "Nhwɛso",
    Attendance: "Adwuma mu ba",
    Leave: "Ahomegye",
    Payroll: "Akatua",
    Documents: "Nkrataa",
    Calendar: "Kalenda",
    Comms: "Nkitahodi",
  },
  Ga: {
    Settings: "Nɔŋtsɔɔmɔi",
    Preferences: "Bɔɔmɔi",
    Language: "Gbe",
    Theme: "Nifeemɔ",
    Accessibility: "Mliwalɔɔmɔ",
    "Text size": "Ŋmaa nibii kɛse",
    "Interface size": "Nifeemɔ kɛse",
    "Save preferences": "Kpɔ bɔɔmɔi",
    Overview: "Nhwɛso",
    Attendance: "Baamɔ",
    Leave: "Hɔlide",
    Payroll: "Haa shika",
    Documents: "Nkrataa",
    Calendar: "Kalenda",
    Comms: "Kasemɔ",
  },
  Ewe: {
    Settings: "Ɖoɖowɔwɔwo",
    Preferences: "Tiatiawo",
    Language: "Gbegbɔgblɔ",
    Theme: "Nɔnɔme",
    Accessibility: "Mɔɖeɖe",
    "Text size": "Nuŋɔŋlɔ ƒe lolome",
    "Interface size": "Dɔwɔƒe ƒe lolome",
    "Save preferences": "Dzra tiatiawo ɖo",
    Notifications: "Nyatakakawo",
    "Notification preferences": "Nyatakaka tiatiawo",
    "Privacy settings": "Ameŋutinya ɖoɖowo",
    "Connected devices": "Mɔ̃ siwo le kadodo me",
    "Change password": "Trɔ nya ɣaɣla",
    "Sign out": "Do go",
    "Help Center": "Kpekpeɖeŋuƒe",
    Overview: "Nukpɔkpɔ",
    Attendance: "Va dɔme",
    Leave: "Mɔɖeɖe",
    Payroll: "Fexexe",
    Documents: "Agbalẽwo",
    Calendar: "Kalenda",
    Comms: "Dɔmedzoe",
    "My Profile": "Nye Ŋutinyawo",
    Tasks: "Dɔdeasiwo",
    Expenses: "Gaxɔxɔwo",
    Assets: "Nuwo",
  },
};

const originalText = new WeakMap<Text, string>();
const translatableSelectors = [
  ".employee-module-tabs button",
  ".nav button",
  ".nav-label",
  ".account-menu button",
  ".page-header h1",
  ".page-header p",
  ".panel-head h2",
  ".panel-head p",
  ".employee-shortcuts button",
  ".settings-card h2",
  ".settings-card button",
  ".preferences-form label",
  ".privacy-form label",
  ".settings-modal h2",
  ".settings-modal button",
  ".settings-modal label",
  ".calendar-view-toggle button",
  ".calendar-month-nav button",
].join(",");

export function getStoredPreferences(): Preferences {
  if (typeof window === "undefined") return { ...preferenceDefaults };
  try {
    return {
      ...preferenceDefaults,
      ...JSON.parse(localStorage.getItem("sas-user-preferences") || "{}"),
    } as Preferences;
  } catch {
    return { ...preferenceDefaults };
  }
}

function translateDirectText(element: Element, language: string) {
  const map = translations[language] ?? {};
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType !== Node.TEXT_NODE) continue;
    const node = child as Text;
    const raw = node.textContent ?? "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!originalText.has(node)) originalText.set(node, trimmed);
    const original = originalText.get(node) ?? trimmed;
    const translated = language === "English" ? original : map[original] ?? original;
    if (translated !== trimmed) node.textContent = raw.replace(trimmed, translated);
  }
}

export function translateVisibleText(language: string) {
  if (typeof document === "undefined" || !document.body) return;
  for (const element of Array.from(document.querySelectorAll(translatableSelectors))) {
    translateDirectText(element, language);
  }
}

export function applyPreferences(preferences: Preferences) {
  if (typeof document === "undefined") return;
  localStorage.setItem("sas-user-preferences", JSON.stringify(preferences));
  const root = document.documentElement;
  root.dataset.theme = preferences.theme;
  root.dataset.accessibility = preferences.accessibility;
  root.dataset.textSize = preferences.text_size;
  root.dataset.density = preferences.ui_density;
  root.lang =
    ({ English: "en", French: "fr", Spanish: "es", Chinese: "zh", Twi: "tw", Ga: "gaa", Ewe: "ee" } as Record<string, string>)[preferences.language] || "en";
  root.classList.toggle("large-text", preferences.accessibility === "large-text");
  root.classList.toggle("high-contrast", preferences.accessibility === "high-contrast");
  root.classList.toggle("reduced-motion", preferences.accessibility === "reduced-motion");
  translateVisibleText(preferences.language);
  window.dispatchEvent(new CustomEvent("sas-preferences-changed", { detail: preferences }));
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return domain ? `${name.slice(0, 2)}***@${domain}` : "your registered email";
}

export function UserPreferencesPanel({
  accessToken,
  profile,
  onPassword,
  onNotifications,
  onLogout,
  onProfile,
}: {
  accessToken: string;
  profile: UserProfile;
  onPassword?: () => void;
  onNotifications?: () => void;
  onLogout?: () => void;
  onProfile?: () => void;
}) {
  const [values, setValues] = useState<Preferences>(() => getStoredPreferences());
  const [exists, setExists] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"privacy" | "device" | "two-step" | null>(null);
  const [twoStepEnabled, setTwoStepEnabled] = useState(Boolean(profile.two_step_email_enabled));
  const [twoStepWanted, setTwoStepWanted] = useState(Boolean(profile.two_step_email_enabled));
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityError, setSecurityError] = useState("");

  const t = (text: string) => translations[values.language]?.[text] ?? text;

  useEffect(() => {
    void (async () => {
      try {
        const rows = await listRowsWhereUnordered(accessToken, "user_preferences", { profile_id: profile.id }, "*", 1);
        if (rows[0]) {
          const next = { ...preferenceDefaults, ...rows[0] } as Preferences;
          setValues(next);
          setExists(true);
          applyPreferences(next);
        } else {
          applyPreferences(values);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Preferences could not be loaded.");
      }
    })();
    // Loading is keyed to the signed-in account. Local values are intentionally used as a fast first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, profile.id]);

  useEffect(() => {
    applyPreferences(values);
  }, [values.language, values.theme, values.accessibility, values.text_size, values.ui_density]);

  async function persistPreferences(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload: DataRow = {
        ...values,
        profile_id: profile.id,
        organisation_id: profile.organisation_id,
        updated_at: new Date().toISOString(),
      };
      if (exists) await updateRowsWhere(accessToken, "user_preferences", "profile_id", profile.id, payload);
      else {
        await createRow(accessToken, "user_preferences", payload);
        setExists(true);
      }
      applyPreferences(values);
      setNotice("Preferences saved and applied across your dashboards.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preferences could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const device = useMemo(
    () => ({
      browser: navigator.userAgent,
      platform: navigator.platform || "Current device",
      language: navigator.language,
      lastActive: new Date().toLocaleString("en-GB"),
    }),
    [],
  );

  async function sendCode() {
    setBusy(true);
    setSecurityError("");
    setSecurityMessage("");
    try {
      const session = readSession();
      const email = profile.email || session?.user.email || "";
      if (!session) throw new Error("Your session has expired. Sign in again.");
      if (!email) throw new Error("Add a valid work email before enabling verification.");
      await sendEmailLoginCode(session, email);
      setCodeSent(true);
      setSecurityMessage(`A six digit code was sent to ${maskEmail(email)}.`);
    } catch (cause) {
      setSecurityError(cause instanceof Error ? cause.message : "The verification code could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTwoStep() {
    setBusy(true);
    setSecurityError("");
    setSecurityMessage("");
    try {
      if (!twoStepWanted) {
        await setEmailTwoStep(accessToken, false);
        setTwoStepEnabled(false);
        setCodeSent(false);
        setCode("");
        setSecurityMessage("Email two step verification is disabled.");
        return;
      }
      if (twoStepEnabled) {
        setSecurityMessage("Email two step verification is already enabled.");
        return;
      }
      if (!codeSent) {
        await sendCode();
        return;
      }
      if (code.length !== 6) throw new Error("Enter the complete six digit code.");
      const email = profile.email || readSession()?.user.email || "";
      const verified = await verifyEmailLoginCode(email, code);
      await setEmailTwoStep(verified.access_token, true);
      saveSession(verified, Boolean(localStorage.getItem("sas-people-session")));
      setTwoStepEnabled(true);
      setTwoStepWanted(true);
      setCodeSent(false);
      setCode("");
      setSecurityMessage("Email two step verification is enabled. Future logins will require a code.");
    } catch (cause) {
      setSecurityError(cause instanceof Error ? cause.message : "Security preference could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{t("Settings")}</h1>
          <p className="muted">Personal preferences, account security, privacy and connected devices.</p>
        </div>
      </header>

      <div className="settings-grid user-settings-live">
        <article className="card data-panel settings-card">
          <h2>Profile and account</h2>
          <p className="breakable">{profile.email || profile.username}</p>
          {onProfile && <button type="button" className="secondary" onClick={onProfile}>Edit profile request</button>}
          <button type="button" className="secondary" onClick={onPassword}>{t("Change password")}</button>
          <button type="button" className="secondary" onClick={() => setModal("two-step")}>Email two step verification</button>
        </article>

        <article className="card data-panel settings-card">
          <h2>{t("Preferences")}</h2>
          <form className="preferences-form" onSubmit={persistPreferences}>
            <label htmlFor="preferences-language">
              {t("Language")}
              <select id="preferences-language" name="language" value={values.language} onChange={(event) => setValues({ ...values, language: event.target.value })}>
                {supportedLanguages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label htmlFor="preferences-theme">
              {t("Theme")}
              <select id="preferences-theme" name="theme" value={values.theme} onChange={(event) => setValues({ ...values, theme: event.target.value as Preferences["theme"] })}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label htmlFor="preferences-accessibility">
              {t("Accessibility")}
              <select id="preferences-accessibility" name="accessibility" value={values.accessibility} onChange={(event) => setValues({ ...values, accessibility: event.target.value as Preferences["accessibility"] })}>
                <option value="standard">Standard</option>
                <option value="large-text">Large text</option>
                <option value="high-contrast">High contrast</option>
                <option value="reduced-motion">Reduced motion</option>
              </select>
            </label>
            <label htmlFor="preferences-text-size">
              {t("Text size")}
              <select id="preferences-text-size" name="text_size" value={values.text_size} onChange={(event) => setValues({ ...values, text_size: event.target.value as Preferences["text_size"] })}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
            <label htmlFor="preferences-interface-size">
              {t("Interface size")}
              <select id="preferences-interface-size" name="ui_density" value={values.ui_density} onChange={(event) => setValues({ ...values, ui_density: event.target.value as Preferences["ui_density"] })}>
                <option value="compact">Compact tabs and buttons</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="form-message" aria-live="polite">{notice}</p>}
            <button className="primary" disabled={busy}>{busy ? "Saving…" : t("Save preferences")}</button>
          </form>
        </article>

        <article className="card data-panel settings-card">
          <h2>Notifications and privacy</h2>
          <button type="button" className="secondary" onClick={onNotifications}>{t("Notification preferences")}</button>
          <button type="button" className="secondary" onClick={() => setModal("privacy")}>{t("Privacy settings")}</button>
          <button type="button" className="secondary" onClick={() => setModal("device")}>{t("Connected devices")}</button>
          <button type="button" className="danger" onClick={onLogout}>{t("Sign out")}</button>
        </article>
      </div>

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <section className="modal record-modal settings-modal" role="dialog" aria-modal="true">
            <button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(null)}>×</button>

            {modal === "privacy" && (
              <>
                <span className="eyebrow">Personal privacy</span>
                <h2>{t("Privacy settings")}</h2>
                <form className="privacy-form" onSubmit={async (event) => { if (await persistPreferences(event)) setModal(null); }}>
                  <label htmlFor="privacy-profile-visibility">
                    Profile visibility
                    <select id="privacy-profile-visibility" name="profile_visibility" value={values.profile_visibility} onChange={(event) => setValues({ ...values, profile_visibility: event.target.value as Preferences["profile_visibility"] })}>
                      <option value="private">Private</option>
                      <option value="team">My team</option>
                      <option value="organisation">Organisation</option>
                    </select>
                  </label>
                  <div className="privacy-options">
                    {([
                      ["show_email", "Show email"],
                      ["show_phone", "Show phone"],
                      ["show_birthday", "Show birthday"],
                      ["show_last_active", "Show last active"],
                      ["allow_location_for_attendance", "Allow GPS for attendance"],
                      ["allow_ai_personalisation", "Allow AI personalisation"],
                    ] as const).map(([key, label]) => (
                      <label className="check" htmlFor={`privacy-${key}`} key={key}>
                        <input id={`privacy-${key}`} name={key} type="checkbox" checked={Boolean(values[key])} onChange={(event) => setValues({ ...values, [key]: event.target.checked })} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="form-actions">
                    <button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button>
                    <button className="primary" disabled={busy}>Save privacy</button>
                  </div>
                </form>
              </>
            )}

            {modal === "device" && (
              <>
                <span className="eyebrow">Active session</span>
                <h2>Connected device</h2>
                <div className="device-details">
                  <div><strong>Browser and device</strong><span>{device.browser}</span></div>
                  <div><strong>Platform</strong><span>{device.platform}</span></div>
                  <div><strong>Language</strong><span>{device.language}</span></div>
                  <div><strong>Last active</strong><span>{device.lastActive}</span></div>
                </div>
                <div className="form-actions">
                  <button type="button" className="secondary" onClick={() => setModal(null)}>Close</button>
                  <button type="button" className="danger" onClick={onLogout}>Sign out this device</button>
                </div>
              </>
            )}

            {modal === "two-step" && (
              <>
                <span className="eyebrow">Account security</span>
                <h2>Email two step verification</h2>
                <p className="muted">Require a six digit email code after your password is accepted.</p>
                <div className="security-status">
                  <strong>Status</strong>
                  <span className={`status-pill ${twoStepEnabled ? "active" : "inactive"}`}>{twoStepEnabled ? "Enabled" : "Disabled"}</span>
                </div>
                <label className="check security-toggle" htmlFor="two-step-enabled">
                  <input id="two-step-enabled" name="two_step_email_enabled" type="checkbox" checked={twoStepWanted} onChange={(event) => {
                    setTwoStepWanted(event.target.checked);
                    setSecurityError("");
                    setSecurityMessage("");
                    if (!event.target.checked) {
                      setCodeSent(false);
                      setCode("");
                    }
                  }} />
                  <span>Enable email verification for login</span>
                </label>
                {twoStepWanted && !twoStepEnabled && codeSent && (
                  <label htmlFor="two-step-code">
                    Verification code
                    <input id="two-step-code" name="verification_code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                  </label>
                )}
                {securityError && <p className="form-error" role="alert">{securityError}</p>}
                {securityMessage && <p className="form-message" aria-live="polite">{securityMessage}</p>}
                <div className="form-actions">
                  <button type="button" className="secondary" onClick={() => setModal(null)}>Close</button>
                  {twoStepWanted && !twoStepEnabled && codeSent && <button type="button" className="secondary" disabled={busy} onClick={() => void sendCode()}>Resend code</button>}
                  <button type="button" className="primary" disabled={busy} onClick={() => void saveTwoStep()}>
                    {busy ? "Please wait…" : !twoStepWanted ? "Disable verification" : twoStepEnabled ? "Enabled" : codeSent ? "Verify and enable" : "Send verification code"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
