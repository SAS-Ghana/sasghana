import { FormEvent, useEffect, useState } from "react";
import { DataRow, createRow, deleteRow, listRowsWhere, updateRow } from "./lib/supabase-data";
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
  ["security", "Security", "Roles, permissions and account access"],
  ["backup", "Backup & restore", "Data protection and recovery tools"],
] as const;

type SectionId = typeof sections[number][0];

export function SettingsConfigurationPage({ accessToken, organisationId }: { accessToken: string; organisationId: string }) {
  const [section, setSection] = useState<SectionId>("organisation");
  const [config, setConfig] = useState<OrganisationConfig>(defaultOrganisationConfig);
  const [masterRows, setMasterRows] = useState<DataRow[]>([]);
  const [type, setType] = useState("job_title");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function reloadMasterData(nextType = type) {
    setMasterRows(await listRowsWhere(accessToken, "master_data", { organisation_id: organisationId, data_type: nextType }, "*", 500));
  }

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
  }, [accessToken, organisationId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await saveOrganisationConfig(accessToken, organisationId, config);
      applyOrganisationTheme(config);
      setNotice("Company settings saved and applied across SAS People.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Settings could not be saved.");
    }
  }

  async function addMasterValue(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
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
      setNotice("New master-data option created. It is now available in connected forms.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The option could not be created.");
    }
  }

  return <section>
    <header className="page-header"><div><span className="eyebrow">System configuration</span><h1>Settings centre</h1><p className="muted">Manage company details, appearance, regional formats, forms and reusable options from one place.</p></div></header>
    {error && <p className="form-error">{error}</p>}{notice && <p className="form-message">{notice}</p>}
    <div className="settings-centre">
      <nav className="settings-cards" aria-label="Settings sections">
        {sections.map(([id, title, detail]) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><strong>{title}</strong><span>{detail}</span></button>)}
      </nav>
      <article className="card settings-panel">
        {(section === "organisation" || section === "appearance" || section === "regional" || section === "documents") && <form onSubmit={save} className="settings-form">
          {section === "organisation" && <>
            <h2>Company branding</h2><p className="muted">Changes apply to every authorised dashboard, report and document.</p>
            <label>Company name<input value={config.companyName} onChange={e => setConfig({...config, companyName:e.target.value})}/></label>
            <label>Application name<input value={config.shortName} onChange={e => setConfig({...config, shortName:e.target.value})}/></label>
            <label>Description<textarea value={config.description} onChange={e => setConfig({...config, description:e.target.value})}/></label>
            <label>Logo URL<input value={config.logoUrl} onChange={e => setConfig({...config, logoUrl:e.target.value})}/></label>
            <label>Website<input value={config.website} onChange={e => setConfig({...config, website:e.target.value})}/></label>
            <label>Email<input value={config.email} onChange={e => setConfig({...config, email:e.target.value})}/></label>
            <label>Phone<input value={config.phone} onChange={e => setConfig({...config, phone:e.target.value})}/></label>
            <label>Address<textarea value={config.address} onChange={e => setConfig({...config, address:e.target.value})}/></label>
          </>}
          {section === "appearance" && <><h2>Appearance</h2><div className="colour-grid">
            {[['primary','Primary'],['secondary','Secondary'],['accent','Accent'],['sidebar','Sidebar'],['background','Background'],['surface','Cards and forms']].map(([key,label]) => <label key={key}>{label}<input type="color" value={config[key as keyof OrganisationConfig]} onChange={e => setConfig({...config,[key]:e.target.value})}/><input value={config[key as keyof OrganisationConfig]} onChange={e => setConfig({...config,[key]:e.target.value})}/></label>)}
          </div><div className="theme-preview" style={{background:config.background}}><aside style={{background:config.sidebar,color:'#fff'}}>SAS People</aside><main style={{background:config.surface}}><strong style={{color:config.primary}}>{config.companyName}</strong><button style={{background:config.primary}}>Primary action</button></main></div></>}
          {section === "regional" && <><h2>Currency and regional formats</h2>
            <label>Currency code<input value={config.currencyCode} onChange={e => setConfig({...config,currencyCode:e.target.value.toUpperCase()})}/></label>
            <label>Currency symbol<input value={config.currencySymbol} onChange={e => setConfig({...config,currencySymbol:e.target.value})}/></label>
            <label>Locale<input value={config.locale} onChange={e => setConfig({...config,locale:e.target.value})}/></label>
            <label>Time zone<input value={config.timezone} onChange={e => setConfig({...config,timezone:e.target.value})}/></label>
            <label>Date format<input value={config.dateFormat} onChange={e => setConfig({...config,dateFormat:e.target.value})}/></label>
          </>}
          {section === "documents" && <><h2>Document appearance</h2><div className="colour-grid">
            <label>Primary colour<input type="color" value={config.documentPrimary} onChange={e => setConfig({...config,documentPrimary:e.target.value})}/></label>
            <label>Secondary colour<input type="color" value={config.documentSecondary} onChange={e => setConfig({...config,documentSecondary:e.target.value})}/></label>
            <label>Background colour<input type="color" value={config.documentBackground} onChange={e => setConfig({...config,documentBackground:e.target.value})}/></label>
          </div></>}
          <button className="primary">Save settings</button>
        </form>}
        {section === "master" && <div><h2>Master data</h2><p className="muted">These options power searchable dropdowns across every dashboard and form.</p>
          <div className="filter-toolbar"><select value={type} onChange={e=>{setType(e.target.value);void reloadMasterData(e.target.value);}}>{['job_title','employment_type','document_category','asset_category','leave_category','employee_category','education_level','skill','branch','office_location'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></div>
          <form onSubmit={addMasterValue} className="inline-master-form"><input placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/><input placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)}/><button className="primary">Add option</button></form>
          <div className="master-list">{masterRows.map(row=><div key={String(row.id)}><div><strong>{String(row.name)}</strong><small>{String(row.description??'')}</small></div><select value={String(row.status)} onChange={async e=>{await updateRow(accessToken,'master_data',String(row.id),{status:e.target.value});await reloadMasterData();}}><option>active</option><option>inactive</option><option>archived</option></select><button className="danger" onClick={async()=>{if(confirm('Archive this option?')){await deleteRow(accessToken,'master_data',String(row.id));await reloadMasterData();}}}>Remove</button></div>)}</div>
        </div>}
        {section === "working" && <Empty title="Working hours" text="Configure working days, start and end times, grace periods and attendance rules here."/>}
        {section === "security" && <Empty title="Security" text="Manage roles, permissions, password policy, sessions and access reviews here."/>}
        {section === "backup" && <Empty title="Backup & restore" text="Create secure backups, review deletion requests and restore approved recovery points here."/>}
      </article>
    </div>
  </section>;
}

function Empty({title,text}:{title:string;text:string}){return <div className="empty-state"><h2>{title}</h2><p>{text}</p></div>}
