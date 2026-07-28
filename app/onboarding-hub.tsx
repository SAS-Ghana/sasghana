import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listNamedRows, listRows, updateRow } from "./lib/supabase-data";

type Data = { journeys: DataRow[]; templates: DataRow[]; items: DataRow[]; employees: DataRow[]; policies: DataRow[]; assets: DataRow[]; documents: DataRow[] };
const empty: Data = { journeys: [], templates: [], items: [], employees: [], policies: [], assets: [], documents: [] };

export function OnboardingHub({ accessToken, profile }: { accessToken: string; profile: UserProfile }) {
  const [data, setData] = useState<Data>(empty);
  const [tab, setTab] = useState<"journeys" | "templates" | "compliance">("journeys");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [itemTemplate, setItemTemplate] = useState<DataRow | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const canManage = profile.permissions.includes("onboarding.manage") || profile.permissions.includes("onboarding.templates") || profile.roles.includes("SAS System Administrator") || ["administrator", "hr"].includes(String(profile.account_type).toLowerCase());

  const load = useCallback(async () => {
    setError("");
    const issues: string[] = [];
    const read = async (table: string, limit = 500) => {
      try { return await listRows(accessToken, table, "*", limit); }
      catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }
    };
    const [journeys, templates, items, employees, policies, assets, documents] = await Promise.all([
      read("employee_onboarding"), read("onboarding_templates", 200), read("onboarding_template_items", 1000),
      listNamedRows(accessToken, "employees", "id,first_name,last_name,employee_number,position_title,employment_status,start_date", "first_name").catch((cause) => { issues.push(`employees: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }),
      read("policies"), read("assets"), read("employee_documents"),
    ]);
    setData({ journeys, templates, items, employees, policies, assets, documents });
    if (issues.length) setError(`Some onboarding data could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);

  const employeeName = (id: unknown) => { const employee = data.employees.find((row) => String(row.id) === String(id)); return employee ? `${employee.first_name} ${employee.last_name}` : "Employee"; };
  const templateName = (id: unknown) => String(data.templates.find((row) => String(row.id) === String(id))?.name ?? "No template");
  const active = data.journeys.filter((row) => String(row.status) !== "completed");
  const overdue = active.filter((row) => String(row.status) === "overdue" || (row.due_date && String(row.due_date) < new Date().toISOString().slice(0, 10))).length;
  const completed = data.journeys.filter((row) => String(row.status) === "completed").length;

  async function changeJourney(row: DataRow, status: string, progress?: number) {
    if (!row.id) return;
    setBusy(String(row.id)); setError(""); setNotice("");
    try {
      await updateRow(accessToken, "employee_onboarding", String(row.id), { status, progress: progress ?? Number(row.progress ?? 0) });
      await load();
      setNotice(`Onboarding journey updated to ${status.replaceAll("_", " ")}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Onboarding journey could not be updated."); }
    finally { setBusy(""); }
  }

  return <section className="dashboard-workspace">
    <header className="page-header"><div><span className="eyebrow">Employee lifecycle</span><h1>Onboarding command centre</h1><p className="muted">Start employee journeys, reuse checklists, issue documents, assign assets, training and first-week work.</p></div>{canManage && <div className="page-actions"><button className="primary" onClick={() => setJourneyOpen(true)}>Start onboarding</button><button className="secondary" onClick={() => setTemplateOpen(true)}>Create template</button></div>}</header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}
    <div className="performance-metrics"><article><span>Active journeys</span><strong>{active.length}</strong><p>{overdue} overdue</p></article><article><span>Completed</span><strong>{completed}</strong><p>Closed onboarding journeys</p></article><article><span>Reusable templates</span><strong>{data.templates.length}</strong><p>{data.items.length} checklist items</p></article><article><span>Published policies</span><strong>{data.policies.filter((row) => row.status === "published").length}</strong><p>Available for acknowledgement</p></article><article><span>Available assets</span><strong>{data.assets.filter((row) => row.status === "available").length}</strong><p>Ready for assignment</p></article></div>
    <div className="segmented"><button className={tab === "journeys" ? "active" : ""} onClick={() => setTab("journeys")}>Employee journeys</button><button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>Templates & checklists</button><button className={tab === "compliance" ? "active" : ""} onClick={() => setTab("compliance")}>Compliance readiness</button></div>

    {tab === "journeys" && <div className="journey-grid">{data.journeys.map((journey) => <article className="card journey-card" key={String(journey.id)}><div><span className={`status-pill ${journey.status}`}>{String(journey.status).replaceAll("_", " ")}</span><strong>{employeeName(journey.employee_id)}</strong><small>{templateName(journey.template_id)} · due {String(journey.due_date || "not set")}</small></div><div className="progress-track"><i style={{ width: `${Number(journey.progress || 0)}%` }} /></div><p>{Number(journey.progress || 0)}% complete</p>{canManage && <div className="row-actions"><button disabled={busy === String(journey.id)} onClick={() => void changeJourney(journey, "in_progress", Math.max(10, Number(journey.progress ?? 0)))}>Start</button><button disabled={busy === String(journey.id)} onClick={() => { const result = window.prompt("Enter progress percentage (0 to 100):", String(journey.progress ?? 0)); if (result !== null) void changeJourney(journey, Number(result) >= 100 ? "completed" : "in_progress", Math.min(100, Math.max(0, Number(result) || 0))); }}>Update progress</button><button disabled={busy === String(journey.id)} onClick={() => void changeJourney(journey, "needs_attention")}>Needs attention</button><button disabled={busy === String(journey.id)} onClick={() => void changeJourney(journey, "completed", 100)}>Complete</button></div>}</article>)}{!data.journeys.length && <div className="card empty-state"><h3>No onboarding journeys</h3><p>Create a template, then use Start onboarding to assign it to an employee.</p>{canManage && <button className="primary" onClick={() => setJourneyOpen(true)}>Start first journey</button>}</div>}</div>}

    {tab === "templates" && <div className="template-grid">{data.templates.map((template) => <article key={String(template.id)}><span>{String(template.status)}</span><h3>{String(template.name)}</h3><p>{data.items.filter((item) => String(item.template_id) === String(template.id)).length} structured steps</p><div className="template-item-list">{data.items.filter((item) => String(item.template_id) === String(template.id)).slice(0, 8).map((item) => <small key={String(item.id)}><b>{String(item.item_type).replaceAll("_", " ")}</b>{String(item.title)}</small>)}</div>{canManage && <button className="secondary" onClick={() => setItemTemplate(template)}>Add checklist item</button>}</article>)}</div>}

    {tab === "compliance" && <div className="compliance-grid"><article className="card portal-panel"><h2>Policy acknowledgements</h2><strong>{data.policies.filter((row) => row.requires_acknowledgement).length}</strong><p>Policies requiring employee acceptance can be added to any onboarding template.</p></article><article className="card portal-panel"><h2>Employee documents</h2><strong>{data.documents.filter((row) => row.status === "verified" || row.status === "issued").length}/{data.documents.length}</strong><p>Verified identity, tax, bank and employment documents.</p></article><article className="card portal-panel"><h2>Asset readiness</h2><strong>{data.assets.filter((row) => row.status === "available").length}</strong><p>Laptops, access cards and equipment ready for assignment.</p></article></div>}

    {journeyOpen && <JourneyDialog accessToken={accessToken} profile={profile} employees={data.employees} templates={data.templates} onClose={() => setJourneyOpen(false)} onSaved={async () => { setJourneyOpen(false); await load(); setNotice("Employee onboarding journey started."); }} />}
    {templateOpen && <TemplateDialog accessToken={accessToken} profile={profile} onClose={() => setTemplateOpen(false)} onSaved={async () => { setTemplateOpen(false); await load(); setNotice("Onboarding template created."); }} />}
    {itemTemplate && <ItemDialog accessToken={accessToken} profile={profile} template={itemTemplate} policies={data.policies} onClose={() => setItemTemplate(null)} onSaved={async () => { setItemTemplate(null); await load(); setNotice("Checklist item added."); }} />}
  </section>;
}

function JourneyDialog({ accessToken, profile, employees, templates, onClose, onSaved }: { accessToken: string; profile: UserProfile; employees: DataRow[]; templates: DataRow[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState({ employee_id: "", template_id: "", due_date: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availableEmployees = useMemo(() => employees.filter((row) => !["terminated", "archived"].includes(String(row.employment_status))), [employees]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await createRow(accessToken, "employee_onboarding", { organisation_id: profile.organisation_id, employee_id: values.employee_id, template_id: values.template_id || null, status: "not_started", progress: 0, assigned_to: profile.id, due_date: values.due_date || null, notes: values.notes.trim() || null });
      await onSaved();
    } catch (cause) { const text = cause instanceof Error ? cause.message : "Journey could not be started."; setError(/duplicate|unique/i.test(text) ? "This employee already has an active onboarding journey." : text); }
    finally { setBusy(false); }
  }
  return <Modal title="Start employee onboarding" onClose={onClose}><form className="record-form" onSubmit={submit}><label>Employee<select required value={values.employee_id} onChange={(event) => setValues({ ...values, employee_id: event.target.value })}><option value="">Select employee</option>{availableEmployees.map((employee) => <option key={String(employee.id)} value={String(employee.id)}>{String(employee.first_name)} {String(employee.last_name)} · {String(employee.employee_number)}</option>)}</select></label><label>Checklist template<select value={values.template_id} onChange={(event) => setValues({ ...values, template_id: event.target.value })}><option value="">No template</option>{templates.filter((row) => String(row.status) === "active").map((template) => <option key={String(template.id)} value={String(template.id)}>{String(template.name)}</option>)}</select></label><label>Due date<input type="date" value={values.due_date} onChange={(event) => setValues({ ...values, due_date: event.target.value })} /></label><label className="wide">Notes<textarea value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} /></label>{error && <p className="form-error wide" role="alert">{error}</p>}<Actions busy={busy} onClose={onClose} label="Start onboarding" /></form></Modal>;
}

function TemplateDialog({ accessToken, profile, onClose, onSaved }: { accessToken: string; profile: UserProfile; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(""); const [type, setType] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await createRow(accessToken, "onboarding_templates", { organisation_id: profile.organisation_id, name: name.trim(), employment_type: type || null, status: "active", created_by: profile.id }); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Template could not be saved."); } finally { setBusy(false); } }
  return <Modal title="Create onboarding template" onClose={onClose}><form className="record-form" onSubmit={submit}><label>Template name<input required placeholder="Permanent employee onboarding" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Employment type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option><option>Full time</option><option>Part time</option><option>Contract</option><option>Internship</option></select></label>{error && <p className="form-error wide">{error}</p>}<Actions busy={busy} onClose={onClose} label="Create template" /></form></Modal>;
}

function ItemDialog({ accessToken, profile, template, policies, onClose, onSaved }: { accessToken: string; profile: UserProfile; template: DataRow; policies: DataRow[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState({ title: "", item_type: "company_details", instructions: "", due_offset_days: "0", policy_id: "", requires_acknowledgement: false });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await createRow(accessToken, "onboarding_template_items", { ...values, policy_id: values.policy_id || null, due_offset_days: Number(values.due_offset_days), organisation_id: profile.organisation_id, template_id: template.id, assignee_type: "employee" }); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Checklist item could not be saved."); } finally { setBusy(false); } }
  return <Modal title="Add onboarding item" onClose={onClose}><form className="record-form" onSubmit={submit}><label>Step title<input required value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label><label>Step type<select value={values.item_type} onChange={(event) => setValues({ ...values, item_type: event.target.value })}>{["company_details", "form", "document", "acceptance_letter", "policy", "compliance", "asset", "training", "meeting", "task"].map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select></label>{values.item_type === "policy" && <label>Policy<select value={values.policy_id} onChange={(event) => setValues({ ...values, policy_id: event.target.value })}><option value="">Select policy</option>{policies.map((policy) => <option value={String(policy.id)} key={String(policy.id)}>{String(policy.title)}</option>)}</select></label>}<label className="wide">Instructions<textarea value={values.instructions} onChange={(event) => setValues({ ...values, instructions: event.target.value })} /></label><label>Due days after start<input type="number" min="0" value={values.due_offset_days} onChange={(event) => setValues({ ...values, due_offset_days: event.target.value })} /></label><label className="check"><input type="checkbox" checked={values.requires_acknowledgement} onChange={(event) => setValues({ ...values, requires_acknowledgement: event.target.checked })} /> Employee must acknowledge or accept</label>{error && <p className="form-error wide">{error}</p>}<Actions busy={busy} onClose={onClose} label="Add checklist item" /></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal record-modal" role="dialog" aria-modal="true"><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Onboarding workflow</span><h2>{title}</h2>{children}</section></div>; }
function Actions({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) { return <div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : label}</button></div>; }
