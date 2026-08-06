import { callRpc, createRow, DataRow, listRowsWhere, updateRowsWhere } from "./supabase-data";
import { publishableKey, serviceUrl } from "./supabase-config";

export type OrganisationConfig = {
  companyName: string;
  shortName: string;
  description: string;
  dashboardDescription: string;
  loginEyebrow: string;
  loginTitle: string;
  loginWelcome: string;
  logoUrl: string;
  loginLogoUrl: string;
  dashboardLogoUrl: string;
  faviconUrl: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  sidebar: string;
  documentPrimary: string;
  documentSecondary: string;
  documentBackground: string;
  currencyCode: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
  dateFormat: string;
};

export const defaultOrganisationConfig: OrganisationConfig = {
  companyName: "SAS Finance Group Ghana",
  shortName: "SAS Finance Group",
  description: "Employee Management and Onboarding Portal",
  dashboardDescription: "Private & confidential",
  loginEyebrow: "Private employee portal",
  loginTitle: "People operations, made effortless.",
  loginWelcome: "Secure employee management and onboarding for SAS Finance Group Ghana.",
  logoUrl: "",
  loginLogoUrl: "",
  dashboardLogoUrl: "",
  faviconUrl: "",
  website: "https://www.sasghana.com/",
  email: "",
  phone: "",
  address: "",
  primary: "#00AEEF",
  secondary: "#071426",
  accent: "#00AEEF",
  background: "#F4F7FB",
  surface: "#FFFFFF",
  sidebar: "#071426",
  documentPrimary: "#00AEEF",
  documentSecondary: "#071426",
  documentBackground: "#FFFFFF",
  currencyCode: "GHS",
  currencySymbol: "GH₵",
  locale: "en-GB",
  timezone: "Africa/Accra",
  dateFormat: "dd/MM/yyyy",
};

const keys: Record<keyof OrganisationConfig, string> = {
  companyName: "company.name",
  shortName: "company.short_name",
  description: "company.description",
  dashboardDescription: "company.dashboard_description",
  loginEyebrow: "login.eyebrow",
  loginTitle: "login.title",
  loginWelcome: "login.welcome",
  logoUrl: "company.logo_url",
  loginLogoUrl: "login.logo_url",
  dashboardLogoUrl: "dashboard.logo_url",
  faviconUrl: "company.favicon_url",
  website: "company.website",
  email: "company.email",
  phone: "company.phone",
  address: "company.address",
  primary: "theme.primary",
  secondary: "theme.secondary",
  accent: "theme.accent",
  background: "theme.background",
  surface: "theme.surface",
  sidebar: "theme.sidebar",
  documentPrimary: "document.primary_colour",
  documentSecondary: "document.secondary_colour",
  documentBackground: "document.background_colour",
  currencyCode: "regional.currency_code",
  currencySymbol: "regional.currency_symbol",
  locale: "regional.locale",
  timezone: "regional.timezone",
  dateFormat: "regional.date_format",
};

function fromPublicBranding(row: DataRow): OrganisationConfig {
  return {
    ...defaultOrganisationConfig,
    companyName: String(row.company_name ?? defaultOrganisationConfig.companyName),
    shortName: String(row.short_name ?? defaultOrganisationConfig.shortName),
    description: String(row.description ?? defaultOrganisationConfig.description),
    dashboardDescription: String(row.dashboard_description ?? defaultOrganisationConfig.dashboardDescription),
    loginEyebrow: String(row.login_eyebrow ?? defaultOrganisationConfig.loginEyebrow),
    loginTitle: String(row.login_title ?? defaultOrganisationConfig.loginTitle),
    loginWelcome: String(row.login_welcome ?? defaultOrganisationConfig.loginWelcome),
    logoUrl: String(row.logo_url ?? ""),
    loginLogoUrl: String(row.login_logo_url ?? row.logo_url ?? ""),
    dashboardLogoUrl: String(row.dashboard_logo_url ?? row.logo_url ?? ""),
    primary: String(row.primary_colour ?? defaultOrganisationConfig.primary),
    secondary: String(row.secondary_colour ?? defaultOrganisationConfig.secondary),
    accent: String(row.accent_colour ?? defaultOrganisationConfig.accent),
    background: String(row.background_colour ?? defaultOrganisationConfig.background),
    surface: String(row.surface_colour ?? defaultOrganisationConfig.surface),
    sidebar: String(row.sidebar_colour ?? defaultOrganisationConfig.sidebar),
  };
}

export async function loadPublicBranding() {
  const response = await fetch(`${serviceUrl}/rest/v1/public_branding?select=*&is_default=eq.true&limit=1`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
  });
  if (!response.ok) return defaultOrganisationConfig;
  const rows = await response.json() as DataRow[];
  return rows[0] ? fromPublicBranding(rows[0]) : defaultOrganisationConfig;
}

export async function loadOrganisationConfig(accessToken: string, organisationId: string) {
  const [rows, brandingRows] = await Promise.all([
    listRowsWhere(accessToken, "system_settings", { organisation_id: organisationId }, "setting_key,setting_value,category", 500),
    listRowsWhere(accessToken, "public_branding", { organisation_id: organisationId }, "*", 1),
  ]);
  const config = brandingRows[0] ? fromPublicBranding(brandingRows[0]) : { ...defaultOrganisationConfig };
  const values = new Map(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? "")]));
  (Object.keys(keys) as (keyof OrganisationConfig)[]).forEach((property) => {
    const value = values.get(keys[property]);
    if (value !== undefined) config[property] = value;
  });
  return config;
}

export async function saveOrganisationConfig(accessToken: string, organisationId: string, config: OrganisationConfig) {
  await Promise.all((Object.keys(keys) as (keyof OrganisationConfig)[]).map(async (property) => {
    const settingKey = keys[property];
    const existing = await listRowsWhere(accessToken, "system_settings", { organisation_id: organisationId, setting_key: settingKey }, "id", 1);
    const payload: DataRow = {
      organisation_id: organisationId,
      setting_key: settingKey,
      setting_value: config[property],
      category: settingKey.split(".")[0],
      updated_at: new Date().toISOString(),
    };
    if (existing.length) await updateRowsWhere(accessToken, "system_settings", "id", String(existing[0].id), payload);
    else await createRow(accessToken, "system_settings", payload);
  }));

  const branding: DataRow = {
    organisation_id: organisationId,
    company_name: config.companyName,
    short_name: config.shortName,
    description: config.description,
    dashboard_description: config.dashboardDescription,
    login_eyebrow: config.loginEyebrow,
    login_title: config.loginTitle,
    login_welcome: config.loginWelcome,
    logo_url: config.logoUrl || null,
    login_logo_url: config.loginLogoUrl || null,
    dashboard_logo_url: config.dashboardLogoUrl || null,
    primary_colour: config.primary,
    secondary_colour: config.secondary,
    accent_colour: config.accent,
    background_colour: config.background,
    surface_colour: config.surface,
    sidebar_colour: config.sidebar,
    is_default: true,
    updated_at: new Date().toISOString(),
  };
  await callRpc(accessToken, "save_public_branding", { p_branding: branding });
  window.dispatchEvent(new Event("sas-branding-changed"));
}

export function applyOrganisationTheme(config: OrganisationConfig) {
  const root = document.documentElement;
  root.style.setProperty("--brand", config.primary);
  root.style.setProperty("--brand-strong", config.secondary);
  root.style.setProperty("--accent", config.accent);
  root.style.setProperty("--navy", config.secondary);
  root.style.setProperty("--configured-bg", config.background);
  root.style.setProperty("--configured-surface", config.surface);
  root.style.setProperty("--configured-sidebar", config.sidebar);
  // Never pin semantic light surfaces inline: inline values override the user's dark/system
  // preference and create white cards with white text. Theme selectors own these tokens.
  root.style.removeProperty("--bg");
  root.style.removeProperty("--surface");
  root.style.removeProperty("--surface-2");
  root.style.removeProperty("--text");
  root.style.removeProperty("--muted");
  root.style.removeProperty("--line");
  document.title = `${config.shortName} · ${config.companyName}`;
  if (config.faviconUrl) {
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = config.faviconUrl;
  }
}

export function formatCompanyMoney(value: number, config: OrganisationConfig) {
  return new Intl.NumberFormat(config.locale || "en-GB", {
    style: "currency",
    currency: config.currencyCode || "GHS",
  }).format(value);
}
