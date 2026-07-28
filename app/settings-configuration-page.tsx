import { FormEvent, useCallback, useEffect, useState } from "react";
import { callRpc, DataRow, createRow, deleteRow, listRows, listRowsWhere, updateRow } from "./lib/supabase-data";
import {
  applyOrganisationTheme,
  defaultOrganisationConfig,
  loadOrganisationConfig,
  OrganisationConfig,
  saveOrganisationConfig,
} from "./lib/organisation-config";

const sections = [
  ["organisation", "Organisation", "Company profile, logo and descriptions"],
  ["appearance", "Appearance", "Colours, light and dark presentation"],
  ["regional", "Regional", "Currency, locale, time zone and dates"],
  ["master", "Master data", "Departments, categories and reusable dropdown values"],
  ["documents", "Documents", "Letter templates, wording and document colours"],
  ["working", "Working hours", "Company working days and times"],
  ["security", "Security", "Login history, sessions, roles and account access"],
  ["backup", "Backup & restore", "Data protection and recovery tools"],
] as const;

type SectionId = typeof sections[number][0];

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB");
}

export function SettingsConfigurationPage({ accessToken, organisationId }: { accessToken: string; organisationId: string }) {
  const [section, setSection] = useState<SectionId>("organisation");
  const [config, setConfig] = useState<OrganisationConfig>(defaultOrganisationConfig);
  const [masterRows, setMasterRows] = useState<DataRow[]>([]);
  const [loginRows, setLoginRows] = useState<DataRow[]>([]);
  const [sessionRows, setSessionRows] = useState<DataRow[]>([]);
  const [type, setType] = useState("job_title");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);

  const reloadMasterData = useCallback(async (nextType = type) => {
    setMasterRows(await listRowsWhere(accessToken, "master_data", { organisation_id: organisationId, data_type: nextType }, "*", 500));
  }, [accessToken, organisationId, type]);

  const reloadSecurity = useCallback(async () => {
    setSecurityBusy(true);
    setError("");
    try {
      const [logins, sessions] = await Promise.all([
        listRows(accessToken, "login_history_feed", "*", 500),
        listRows(accessToken, "security_session_feed", "*", 500, "last_seen_at"),
      ]);
      setLoginRows(logins);
      setSessionRows(sessions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Security history could not be loaded.");
    } finally {
      setSecurityBusy(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await loadOrganisationConfig(accessToken, organisationId);
        setConfig(loaded);
        applyOrganisationTheme(loaded);
        await reloadMasterData();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Settings could not be loaded.");
      }
    })();
  }, [accessToken, organisationId, reloadMasterData]);

  useEffect(() => {
    if (section === "security") void reloadSecurity();
  }, [section, reloadSecurity]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await saveOrganisationConfig(accessToken, organisationId, config);
      applyOrganisationTheme(config);
      setNotice("Company settings saved and applied across SAS People.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Settings could not be saved.");
    }
  }

  async function addMasterValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setError("");
    setNotice("");
    try {
      await createRow(accessToken, "master_data", {
        organisation_id: organisationId,
        data_type: type,
        name: name.trim(),
        description: description.trim() || null,
        status: "active",
      });
      setName("");
      setDescription("");
      await reloadMasterData();
      setNotice("New master data option created. It is now available in connected forms.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The option could not be created.");
    }
  }

  async function revokeSession(row: DataRow) {
    if (!row.id || row.revoked_at) return;
    if (!window.confirm(`Sign out ${String(row.display_name ?? row.username ?? "this user")} from this device?`)) return;
    setSecurityBusy(true);
    setError("");
    setNotice("");
    try {
      const revoked = await callRpc<boolean>(accessToken, "revoke_user_session", { p_session_id: String(row.id) });
      if (!revoked) throw new Error("The session was already signed out or could not be found.");
      await reloadSecurity();
      setNotice("The selected device session was revoked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be revoked.");
    } finally {
      setSecurityBusy(false);
    }
  }

  const successfulLogins = loginRows.filter((row) => row.outcome === "success").length;
  const failedLogins = loginRows.filter((row) => row.outcome === "failed").length;
  const activeSessions = sessionRows.filter((row) => !row.revoked_at).length;

  return <section>
    <header className="page-header"><div><span className="eyebrow">System configuration</span><h1>Settings centre</h1><p className="muted">Manage company details, appearance, regional formats, forms and reusable options from one place.</p></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <div className="settings-centre">
      <nav className="settings-cards" aria-label="Settings sections">
        {sections.map(([id, title, detail]) => <button type="button" key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); setError(""); setNotice(""); }}><strong>{title}</strong><span>{detail}</span></button>)}
      </nav>

      <article className="card settings-panel">
        {(section === "organisation" || section === "appearance" || section === "regional" || section === "documents") && <form onSubmit={save} className="settings-form">
          {section === "organisation" && <>
            <h2>Company branding</h2><p className="muted">Changes apply to every authorised dashboard, report and document.</p>
            <label htmlFor="settings-company-name">Company name<input id="settings-company-name" name="company_name" value={config.companyName} onChange={(event) => setConfig({ ...config, companyName: event.target.value })} /></label>
            <label htmlFor="settings-application-name">Application name<input id="settings-application-name" name="application_name" value={config.shortName} onChange={(event) => setConfig({ ...config, shortName: event.target.value })} /></label>
            <label htmlFor="settings-description">Description<textarea id="settings-description" name="description" value={config.description} onChange={(event) => setConfig({ ...config, description: event.target.value })} /></label>
            <label htmlFor="settings-logo-url">Logo URL<input id="settings-logo-url" name="logo_url" value={config.logoUrl} onChange={(event) => setConfig({ ...config, logoUrl: event.target.value })} /></label>
            <label htmlFor="settings-website">Website<input id="settings-website" name="website" value={config.website} onChange={(event) => setConfig({ ...config, website: event.target.value })} /></label>
            <label htmlFor="settings-email">Email<input id="settings-email" name="email" type="email" value={config.email} onChange={(event) => setConfig({ ...config, email: event.target.value })} /></label>
            <label htmlFor="settings-phone">Phone<input id="settings-phone" name="phone" value={config.phone} onChange={(event) => setConfig({ ...config, phone: event.target.value })} /></label>
            <label htmlFor="settings-address">Address<textarea id="settings-address" name="address" value={config.address} onChange={(event) => setConfig({ ...config, address: event.target.value })} /></label>
          </>}

          {section === "appearance" && <><h2>Appearance</h2><div className="colour-grid">
            {([['primary', 'Primary'], ['secondary', 'Secondary'], ['accent', 'Accent'], ['sidebar', 'Sidebar'], ['background', 'Background'], ['surface', 'Cards and forms']] as const).map(([key, label]) => <label key={key} htmlFor={`colour-${key}`}>{label}<input id={`colour-${key}`} name={`${key}_colour_picker`} type="color" value={String(config[key])} onChange={(event) => setConfig({ ...config, [key]: event.target.value })} /><input name={`${key}_colour`} value={String(config[key])} onChange={(event) => setConfig({ ...config, [key]: event.target.value })} /></label>)}
          </div><div className="theme-preview" style={{ background: config.background }}><aside style={{ background: config.sidebar, color: '#fff' }}>SAS People</aside><main style={{ background: config.surface }}><strong style={{ color: config.primary }}>{config.companyName}</strong><button type="button" style={{ background: config.primary }}>Primary action</button></main></div></>}

          {section === "regional" && <><h2>Currency and regional formats</h2>
            <label htmlFor="settings-currency-code">Currency code<input id="settings-currency-code" name="currency_code" value={config.currencyCode} onChange={(event) => setConfig({ ...config, currencyCode: event.target.value.toUpperCase() })} /></label>
            <label htmlFor="settings-currency-symbol">Currency symbol<input id="settings-currency-symbol" name="currency_symbol" value={config.currencySymbol} onChange={(event) => setConfig({ ...config, currencySymbol: event.target.value })} /></label>
            <label htmlFor="settings-locale">Locale<input id="settings-locale" name="locale" value={config.locale} onChange={(event) => setConfig({ ...config, locale: event.target.value })} /></label>
            <label htmlFor="settings-timezone">Time zone<input id="settings-timezone" name="timezone" value={config.timezone} onChange={(event) => setConfig({ ...config, timezone: event.target.value })} /></label>
            <label htmlFor="settings-date-format">Date format<input id="settings-date-format" name="date_format" value={config.dateFormat} onChange={(event) => setConfig({ ...config, dateFormat: event.target.value })} /></label>
          </>}

          {section === "documents" && <><h2>Document appearance</h2><div className="colour-grid">
            <label htmlFor="document-primary">Primary colour<input id="document-primary" name="document_primary" type="color" value={config.documentPrimary} onChange={(event) => setConfig({ ...config, documentPrimary: event.target.value })} /></label>
            <label htmlFor="document-secondary">Secondary colour<input id="document-secondary" name="document_secondary" type="color" value={config.documentSecondary} onChange={(event) => setConfig({ ...config, documentSecondary: event.target.value })} /></label>
            <label htmlFor="document-background">Background colour<input id="document-background" name="document_background" type="color" value={config.documentBackground} onChange={(event) => setConfig({ ...config, documentBackground: event.target.value })} /></label>
          </div></>}
          <button type="submit" className="primary">Save settings</button>
        </form>}

        {section === "master" && <div><h2>Master data</h2><p className="muted">These options power searchable dropdowns across every dashboard and form.</p>
          <div className="filter-toolbar"><label htmlFor="master-data-type" className="sr-only">Master data type</label><select id="master-data-type" name="master_data_type" value={type} onChange={(event) => { setType(event.target.value); void reloadMasterData(event.target.value); }}>{['job_title', 'employment_type', 'document_category', 'asset_category', 'leave_category', 'employee_category', 'education_level', 'skill', 'branch', 'office_location'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div>
          <form onSubmit={addMasterValue} className="inline-master-form"><label htmlFor="master-data-name" className="sr-only">Name</label><input id="master-data-name" name="name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} /><label htmlFor="master-data-description" className="sr-only">Description</label><input id="master-data-description" name="description" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} /><button type="submit" className="primary">Add option</button></form>
          <div className="master-list">{masterRows.map((row) => <div key={String(row.id)}><div><strong>{String(row.name)}</strong><small>{String(row.description ?? '')}</small></div><select aria-label={`Status for ${String(row.name)}`} value={String(row.status)} onChange={async (event) => { await updateRow(accessToken, 'master_data', String(row.id), { status: event.target.value }); await reloadMasterData(); }}><option>active</option><option>inactive</option><option>archived</option></select><button type="button" className="danger" onClick={async () => { if (window.confirm('Archive this option?')) { await deleteRow(accessToken, 'master_data', String(row.id)); await reloadMasterData(); } }}>Remove</button></div>)}</div>
        </div>}

        {section === "working" && <Empty title="Working hours" text="Configure working days, start and end times, grace periods and attendance rules from Attendance Management." />}

        {section === "security" && <div className="security-settings-panel">
          <div className="panel-head"><div><h2>Security and login history</h2><p className="muted">Review successful and failed logins, active browser sessions and recently used devices.</p></div><button type="button" className="secondary" disabled={securityBusy} onClick={() => void reloadSecurity()}>{securityBusy ? "Refreshing…" : "Refresh security"}</button></div>
          <div className="summary-strip"><div><strong>{successfulLogins}</strong><span>Successful logins</span></div><div><strong>{failedLogins}</strong><span>Failed logins</span></div><div><strong>{activeSessions}</strong><span>Active sessions</span></div></div>

          <h3>Recent login history</h3>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Date & time</th><th>Account</th><th>Result</th><th>Device</th></tr></thead><tbody>{loginRows.slice(0, 100).map((row) => <tr key={String(row.id)}><td>{formatDate(row.created_at)}</td><td><strong>{String(row.actor_name ?? row.actor_username ?? "Account")}</strong><small className="table-subline">{String(row.actor_email ?? "—")}</small></td><td><span className={`status-pill ${row.outcome}`}>{String(row.outcome)}</span></td><td><span className="audit-agent">{String(row.user_agent ?? "Not supplied")}</span></td></tr>)}</tbody></table></div>
          {!loginRows.length && !securityBusy && <div className="empty-state compact"><h3>No login records</h3><p>New successful and failed login attempts will appear here.</p></div>}

          <h3>Connected devices and sessions</h3>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Account</th><th>Device</th><th>Last active</th><th>Status</th><th>Action</th></tr></thead><tbody>{sessionRows.map((row) => <tr key={String(row.id)}><td><strong>{String(row.display_name ?? row.username)}</strong><small className="table-subline">{String(row.email ?? "—")}</small></td><td>{String(row.device_name ?? "Browser device")}<small className="table-subline audit-agent">{String(row.user_agent ?? "")}</small></td><td>{formatDate(row.last_seen_at)}</td><td><span className={`status-pill ${row.revoked_at ? "inactive" : "active"}`}>{row.revoked_at ? "Revoked" : "Active"}</span></td><td>{!row.revoked_at ? <button type="button" className="danger" disabled={securityBusy} onClick={() => void revokeSession(row)}>Sign out device</button> : "—"}</td></tr>)}</tbody></table></div>
          {!sessionRows.length && !securityBusy && <div className="empty-state compact"><h3>No recorded sessions</h3><p>Sessions will appear after users sign in on the updated application.</p></div>}
        </div>}

        {section === "backup" && <Empty title="Backup & restore" text="Create secure backups, review deletion requests and restore approved recovery points here." />}
      </article>
    </div>
  </section>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><h2>{title}</h2><p>{text}</p></div>; }
