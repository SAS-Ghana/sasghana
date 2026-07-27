"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRow, createSignedStorageUrl, DataRow, deleteRow, listNamedRows, listRows, updateRow, uploadStorageFile } from "./lib/supabase-data";
import type { ModuleConfig } from "./workspace-config";

type Option = { value: string; label: string };

export function ModulePage({
  config,
  accessToken,
  organisationId,
  search,
}: {
  config: ModuleConfig;
  accessToken: string;
  organisationId: string;
  search: string;
}) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<DataRow | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [records, employeeRows, departmentRows, branchRows] = await Promise.all([
        listRows(accessToken, config.table),
        listNamedRows(accessToken, "employees", "id,first_name,last_name", "first_name"),
        listNamedRows(accessToken, "departments", "id,name"),
        listNamedRows(accessToken, "branches", "id,name"),
      ]);
      const employeeOptions = employeeRows.map((row) => ({
        value: String(row.id),
        label: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      }));
      setEmployees(employeeOptions);
      setDepartments(departmentRows.map((row) => ({ value: String(row.id), label: String(row.name) })));
      setBranches(branchRows.map((row) => ({ value: String(row.id), label: String(row.name) })));
      setRows(records.map((row) => enrichRow(row, employeeOptions)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, config.table]);

  useEffect(() => { void load(); }, [load]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query)));
  }, [rows, search]);

  async function remove(row: DataRow) {
    if (!window.confirm(`Delete this ${config.singular}? This action cannot be undone.`)) return;
    try {
      await deleteRow(accessToken, config.table, String(row.id));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
    }
  }

  function exportRecords(format:"csv"|"word"|"pdf"){
    const columns=config.columns;
    const rowsHtml=visibleRows.map(row=>`<tr>${columns.map(c=>`<td>${escapeHtml(formatValue(row[c.key]))}</td>`).join("")}</tr>`).join("");
    const table=`<table><thead><tr>${columns.map(c=>`<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    if(format==="pdf"){
      const popup=window.open("","_blank","width=1100,height=800");
      popup?.document.write(`<!doctype html><html><head><title>${escapeHtml(config.title)} report</title><style>body{font:12px Arial;padding:32px;color:#0b1426}h1{border-bottom:3px solid #00afe3;padding-bottom:12px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #d7dee8;text-align:left}th{background:#0b1426;color:#fff}</style></head><body><h1>${escapeHtml(config.title)} report</h1><p>Generated ${new Date().toLocaleString()}</p>${table}<script>window.onload=()=>window.print()</script></body></html>`);
      popup?.document.close();return;
    }
    const content=format==="csv"
      ?[columns.map(c=>csvCell(c.label)).join(","),...visibleRows.map(row=>columns.map(c=>csvCell(formatValue(row[c.key]))).join(","))].join("\n")
      :`<html><body><h1>${escapeHtml(config.title)} report</h1>${table}</body></html>`;
    const link=document.createElement("a");
    link.href=URL.createObjectURL(new Blob([content],{type:format==="csv"?"text/csv;charset=utf-8":"application/msword"}));
    link.download=`sas-${config.table}-${new Date().toISOString().slice(0,10)}.${format==="csv"?"csv":"doc"}`;
    link.click();URL.revokeObjectURL(link.href);
  }

  async function printRecord(row:DataRow) {
    let employeeRow=row;
    if(config.table==="payroll_records"){
      const employeeRows=await listRows(accessToken,"employees","*",500);
      employeeRow=employeeRows.find(item=>item.id===row.employee_id)??row;
    }
    const employee=employees.find(item=>item.value===String(row.employee_id))?.label??`${employeeRow.first_name??""} ${employeeRow.last_name??""}`.trim();
    let photo="";
    const photoPath=String(employeeRow.passport_photo_path??"");
    if(photoPath) try{photo=await createSignedStorageUrl(accessToken,"employee-media",photoPath);}catch{/* Letter can print without a photograph. */}
    const isPayroll=config.table==="payroll_records";
    const templates=await listRows(accessToken,"document_templates","*",100).catch(()=>[]);
    const template=templates.find(item=>item.template_type===(isPayroll?"payslip":"appointment_letter")&&item.status==="active");
    const defaultBody=isPayroll?`
      <h2>${employee}</h2><p>Pay period: <b>${row.pay_period}</b></p>
      <table><tr><td>Basic salary</td><td>${money(row.basic_salary)}</td></tr><tr><td>Allowances</td><td>${money(row.allowances)}</td></tr><tr><td>PAYE tax</td><td>${money(row.paye_tax)}</td></tr><tr><td>Employee SSNIT (5.5%)</td><td>${money(row.employee_ssnit)}</td></tr><tr><td>Tier 1</td><td>${money(row.tier_one)}</td></tr><tr><td>Tier 2</td><td>${money(row.tier_two)}</td></tr><tr><td>Tier 3</td><td>${money(row.tier_three)}</td></tr><tr class="total"><td>Net pay</td><td>${money(row.net_pay)}</td></tr></table>
    `:`<p>${new Date().toLocaleDateString("en-GB")}</p><h2>Dear ${employeeRow.first_name} ${employeeRow.last_name},</h2><h1>APPOINTMENT AS ${String(employeeRow.position_title??"EMPLOYEE").toUpperCase()}</h1><p>We are pleased to confirm your appointment with SAS Finance Group Ghana as <b>${employeeRow.position_title??"an employee"}</b>, commencing on <b>${employeeRow.start_date??"the agreed start date"}</b>.</p><p>Your employment is governed by your employment contract, SAS policies, confidentiality obligations, and applicable Ghanaian law.</p><p>We welcome you to SAS Finance Group Ghana and look forward to your contribution.</p><p class="signature">For: SAS Finance Group Ghana<br/><br/><b>Authorised Signatory</b></p>`;
    const title=mergeTemplate(String(template?.subject??(isPayroll?`Payslip — ${row.pay_period}`:"Appointment Letter")),employeeRow,row);
    const body=template?`<main class="template-copy">${escapeHtml(mergeTemplate(String(template.content),employeeRow,row))}</main>`:defaultBody;
    let signature="";
    if(template?.signature_path)try{signature=await createSignedStorageUrl(accessToken,"hr-media",String(template.signature_path));}catch{/* Signature stays optional. */}
    const popup=window.open("","_blank","width=900,height=900");
    popup?.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font:15px Arial;color:#0b1426;padding:48px;line-height:1.6}header{display:flex;justify-content:space-between;border-bottom:3px solid #00afe3;padding-bottom:18px;margin-bottom:34px}header img.logo{width:210px;object-fit:contain}.photo{width:110px;height:140px;object-fit:cover;border:1px solid #ccc}h1{font-size:20px;text-align:center;margin:34px 0}table{width:100%;border-collapse:collapse;margin-top:24px}td{padding:10px;border-bottom:1px solid #ddd}td:last-child{text-align:right}.total{font-size:18px;font-weight:bold}.signature{margin-top:50px;max-width:190px;max-height:90px}.template-copy{white-space:pre-wrap}@media print{button{display:none}}</style></head><body><header><img class="logo" src="/logo.png"/>${photo?`<img class="photo" src="${photo}"/>`:""}</header><h1>${escapeHtml(title)}</h1>${body}${signature?`<img class="signature" src="${signature}"/>`:""}<button onclick="window.print()">Print / Save PDF</button></body></html>`);
    popup?.document.close();
  }

  return <section>
    <header className="page-header">
      <div><span className="eyebrow">SAS People workspace</span><h1>{config.title}</h1><p className="muted">{config.subtitle}</p></div>
      <div className="page-actions"><button className="secondary" onClick={()=>exportRecords("csv")}>Excel / CSV</button><button className="secondary" onClick={()=>exportRecords("word")}>Word</button><button className="secondary" onClick={()=>exportRecords("pdf")}>PDF</button><button className="primary" onClick={() => setEditing(null)}>Add {config.singular}</button></div>
    </header>
    <div className="summary-strip">
      <div><strong>{rows.length}</strong><span>Total records</span></div>
      <div><strong>{rows.filter((row) => ["active","approved","completed","published","available","resolved","verified","present"].includes(String(row.status))).length}</strong><span>Active / completed</span></div>
      <div><strong>{rows.filter((row) => ["pending","in_progress","draft","open","needs_attention"].includes(String(row.status))).length}</strong><span>Needs attention</span></div>
    </div>
    {config.table==="leave_requests"&&<article className="card leave-calendar"><div className="panel-head"><div><h2>Who’s away</h2><p className="muted">Approved leave visible across the organisation</p></div></div><div className="calendar-events">{rows.filter(row=>row.status==="approved").length===0?<p className="muted">No approved leave is currently scheduled.</p>:rows.filter(row=>row.status==="approved").map(row=><div key={String(row.id)}><strong>{String(row.employee_name??"Employee")}</strong><span>{String(row.start_date)} — {String(row.end_date)}</span><small>{String(row.leave_type)}</small></div>)}</div></article>}
    <article className="card data-panel">
      <div className="panel-head"><div><h2>{config.title} register</h2><p className="muted">Live records from Supabase</p></div><button className="text-btn" onClick={() => void load()}>Refresh</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="empty-state">Loading records...</div> : visibleRows.length === 0 ? <div className="empty-state"><div className="empty-icon">{config.icon}</div><h3>No {config.title.toLowerCase()} yet</h3><p>Add the first record to begin. Nothing is pre-filled or simulated.</p></div> :
      <div className="table-scroll"><table className="data-table"><thead><tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={String(row.id)}>{config.columns.map((column) => <td key={column.key}>{formatValue(row[column.key])}</td>)}<td><div className="row-actions">{["employees","payroll_records"].includes(config.table)&&<button onClick={() => void printRecord(row)}>{config.table==="employees"?"Appointment letter":"Payslip"}</button>}<button onClick={() => setEditing(row)}>Edit</button><button className="danger" onClick={() => void remove(row)}>Delete</button></div></td></tr>)}</tbody></table></div>}
    </article>
    {editing !== undefined && <RecordDialog config={config} row={editing} accessToken={accessToken} organisationId={organisationId} employees={employees} departments={departments} branches={branches} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await load(); }} />}
  </section>;
}

function enrichRow(row: DataRow, employees: Option[]) {
  const employeeId = row.employee_id ?? row.assigned_employee_id ?? row.assigned_to_employee_id;
  const employee = employees.find((item) => item.value === String(employeeId));
  return employee ? { ...row, employee_name: employee.label } : row;
}

function formatValue(value: DataRow[string]) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString();
  return text.replaceAll("_", " ");
}

function money(value:DataRow[string]){return new Intl.NumberFormat("en-GH",{style:"currency",currency:"GHS"}).format(Number(value??0));}
function csvCell(value:string){return `"${value.replaceAll('"','""')}"`;}
function mergeTemplate(template:string,employee:DataRow,payroll:DataRow){
  const values:Record<string,string>={
    "{{today}}":new Date().toLocaleDateString("en-GB"),
    "{{employee.full_name}}":`${employee.first_name??""} ${employee.last_name??""}`.trim(),
    "{{employee.employee_number}}":String(employee.employee_number??""),
    "{{employee.position_title}}":String(employee.position_title??""),
    "{{employee.department}}":String(employee.department_name??""),
    "{{employee.start_date}}":String(employee.start_date??""),
    "{{employee.work_email}}":String(employee.work_email??""),
    "{{payroll.pay_period}}":String(payroll.pay_period??""),
    "{{payroll.basic_salary}}":money(payroll.basic_salary),
    "{{payroll.allowances}}":money(payroll.allowances),
    "{{payroll.paye_tax}}":money(payroll.paye_tax),
    "{{payroll.employee_ssnit}}":money(payroll.employee_ssnit),
    "{{payroll.tier_one}}":money(payroll.tier_one),
    "{{payroll.tier_two}}":money(payroll.tier_two),
    "{{payroll.tier_three}}":money(payroll.tier_three),
    "{{payroll.net_pay}}":money(payroll.net_pay),
  };
  return Object.entries(values).reduce((content,[field,value])=>content.replaceAll(field,value),template);
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]??char));}

function RecordDialog({
  config,row,accessToken,organisationId,employees,departments,branches,onClose,onSaved,
}: {
  config: ModuleConfig; row: DataRow | null; accessToken: string; organisationId: string;
  employees: Option[]; departments: Option[]; branches: Option[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [values,setValues] = useState<Record<string,string>>(() => Object.fromEntries(config.fields.map((field) => [field.key, String(row?.[field.key] ?? defaultValue(field))])));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [file,setFile]=useState<File|null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const payload: DataRow = { organisation_id: organisationId };
    for (const field of config.fields) {
      if(field.type==="file") continue;
      const value = values[field.key];
      payload[field.key] = value === "" ? null : field.type === "number" ? Number(value) : value === "true" ? true : value === "false" ? false : value;
    }
    try {
      let recordId=String(row?.id??"");
      if (row?.id) await updateRow(accessToken,config.table,recordId,payload);
      else {
        const created=await createRow(accessToken,config.table,payload);
        recordId=String(created[0]?.id??"");
      }
      if(file&&config.table==="employees"&&recordId){
        const extension=file.name.split(".").pop()?.toLowerCase()??"jpg";
        const path=`${organisationId}/${recordId}/passport.${extension}`;
        await uploadStorageFile(accessToken,"employee-media",path,file);
        await updateRow(accessToken,"employees",recordId,{passport_photo_path:path});
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.");
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="record-title">
    <button className="modal-close" onClick={onClose} aria-label="Close">x</button>
    <span className="eyebrow">{row ? "Edit record" : "New record"}</span><h2 id="record-title">{row ? `Edit ${config.singular}` : `Add ${config.singular}`}</h2>
    <form onSubmit={submit} className="record-form">{config.fields.map((field) => {
      const relationOptions = field.relation === "employees" ? employees : field.relation === "departments" ? departments : field.relation === "branches" ? branches : null;
      const options = relationOptions ?? field.options?.map((option) => ({value:option,label:option.replaceAll("_"," ")}));
      return <label key={field.key}>{field.label}{field.required && " *"}
        {field.type === "textarea" ? <textarea value={values[field.key]} onChange={(event) => setValues({...values,[field.key]:event.target.value})} required={field.required}/> :
        options ? <select value={values[field.key]} onChange={(event) => setValues({...values,[field.key]:event.target.value})} required={field.required}><option value="">Select {field.label.toLowerCase()}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> :
        field.type==="file" ? <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>setFile(event.target.files?.[0]??null)} required={field.required&&!row?.[field.key]}/> :
        <input type={field.type ?? "text"} value={values[field.key]} onChange={(event) => setValues({...values,[field.key]:event.target.value})} required={field.required}/>}
      </label>;
    })}
    {error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving..." : "Save to Supabase"}</button></div></form>
  </section></div>;
}

function defaultValue(field: ModuleConfig["fields"][number]) {
  if (field.key === "status") return field.options?.[0] ?? "";
  if (field.key === "progress") return "0";
  if (field.key === "days") return "1";
  return "";
}
