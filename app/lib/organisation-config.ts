import { createRow, DataRow, listRowsWhere, updateRowsWhere } from "./supabase-data";

export type OrganisationConfig = {
  companyName: string;
  shortName: string;
  description: string;
  logoUrl: string;
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
  shortName: "SAS People",
  description: "Employee Management and Onboarding Portal",
  logoUrl: "",
  faviconUrl: "",
  website: "https://www.sasghana.com/",
  email: "",
  phone: "",
  address: "",
  primary: "#00AEE6",
  secondary: "#071426",
  accent: "#00AEE6",
  background: "#F4F7FB",
  surface: "#FFFFFF",
  sidebar: "#071426",
  documentPrimary: "#00AEE6",
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
  logoUrl: "company.logo_url",
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

export async function loadOrganisationConfig(accessToken: string, organisationId: string) {
  const rows = await listRowsWhere(accessToken, "system_settings", { organisation_id: organisationId }, "setting_key,setting_value,category", 500);
  const values = new Map(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? "")]));
  const config = { ...defaultOrganisationConfig };
  (Object.keys(keys) as (keyof OrganisationConfig)[]).forEach((property) => {
    const value = values.get(keys[property]);
    if (value !== undefined) config[property] = value;
  });
  return config;
}

export async function saveOrganisationConfig(accessToken: string, organisationId: string, config: OrganisationConfig) {
  for (const property of Object.keys(keys) as (keyof OrganisationConfig)[]) {
    const settingKey = keys[property];
    const existing = await listRowsWhere(accessToken, "system_settings", { organisation_id: organisationId, setting_key: settingKey }, "id", 1);
    const category = settingKey.split(".")[0];
    const payload: DataRow = {
      organisation_id: organisationId,
      setting_key: settingKey,
      setting_value: config[property],
      category,
      updated_at: new Date().toISOString(),
    };
    if (existing.length) await updateRowsWhere(accessToken, "system_settings", "id", String(existing[0].id), payload);
    else await createRow(accessToken, "system_settings", payload);
  }
}

export function applyOrganisationTheme(config: OrganisationConfig) {
  const root = document.documentElement;
  root.style.setProperty("--brand", config.primary);
  root.style.setProperty("--brand-strong", config.secondary);
  root.style.setProperty("--accent", config.accent);
  root.style.setProperty("--bg", config.background);
  root.style.setProperty("--surface", config.surface);
  root.style.setProperty("--sidebar", config.sidebar);
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
