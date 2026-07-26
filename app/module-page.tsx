"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRow, DataRow, deleteRow, listNamedRows, listRows, updateRow } from "./lib/supabase-data";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<DataRow | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [records, employeeRows, departmentRows] = await Promise.all([
        listRows(accessToken, config.table),
        listNamedRows(accessToken, "employees", "id,first_name,last_name", "first_name"),
        listNamedRows(accessToken, "departments", "id,name"),
      ]);
      const employeeOptions = employeeRows.map((row) => ({
        value: String(row.id),
        label: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      }));
      setEmployees(employeeOptions);
      setDepartments(departmentRows.map((row) => ({ value: String(row.id), label: String(row.name) })));
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

  return <section>
    <header className="page-header">
      <div><span className="eyebrow">SAS People workspace</span><h1>{config.title}</h1><p className="muted">{config.subtitle}</p></div>
      <button className="primary" onClick={() => setEditing(null)}>Add {config.singular}</button>
    </header>
    <div className="summary-strip">
      <div><strong>{rows.length}</strong><span>Total records</span></div>
      <div><strong>{rows.filter((row) => ["active","approved","completed","published","available","resolved","verified","present"].includes(String(row.status))).length}</strong><span>Active / completed</span></div>
      <div><strong>{rows.filter((row) => ["pending","in_progress","draft","open","needs_attention"].includes(String(row.status))).length}</strong><span>Needs attention</span></div>
    </div>
    <article className="card data-panel">
      <div className="panel-head"><div><h2>{config.title} register</h2><p className="muted">Live records from Supabase</p></div><button className="text-btn" onClick={() => void load()}>Refresh</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="empty-state">Loading records...</div> : visibleRows.length === 0 ? <div className="empty-state"><div className="empty-icon">{config.icon}</div><h3>No {config.title.toLowerCase()} yet</h3><p>Add the first record to begin. Nothing is pre-filled or simulated.</p></div> :
      <div className="table-scroll"><table className="data-table"><thead><tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={String(row.id)}>{config.columns.map((column) => <td key={column.key}>{formatValue(row[column.key])}</td>)}<td><div className="row-actions"><button onClick={() => setEditing(row)}>Edit</button><button className="danger" onClick={() => void remove(row)}>Delete</button></div></td></tr>)}</tbody></table></div>}
    </article>
    {editing !== undefined && <RecordDialog config={config} row={editing} accessToken={accessToken} organisationId={organisationId} employees={employees} departments={departments} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await load(); }} />}
  </section>;
}

function enrichRow(row: DataRow, employees: Option[]) {
  const employeeId = row.employee_id ?? row.assigned_employee_id;
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

function RecordDialog({
  config,row,accessToken,organisationId,employees,departments,onClose,onSaved,
}: {
  config: ModuleConfig; row: DataRow | null; accessToken: string; organisationId: string;
  employees: Option[]; departments: Option[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [values,setValues] = useState<Record<string,string>>(() => Object.fromEntries(config.fields.map((field) => [field.key, String(row?.[field.key] ?? defaultValue(field))])));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const payload: DataRow = { organisation_id: organisationId };
    for (const field of config.fields) {
      const value = values[field.key];
      payload[field.key] = value === "" ? null : field.type === "number" ? Number(value) : value;
    }
    try {
      if (row?.id) await updateRow(accessToken,config.table,String(row.id),payload);
      else await createRow(accessToken,config.table,payload);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.");
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop"><section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="record-title">
    <button className="modal-close" onClick={onClose} aria-label="Close">x</button>
    <span className="eyebrow">{row ? "Edit record" : "New record"}</span><h2 id="record-title">{row ? `Edit ${config.singular}` : `Add ${config.singular}`}</h2>
    <form onSubmit={submit} className="record-form">{config.fields.map((field) => {
      const relationOptions = field.relation === "employees" ? employees : field.relation === "departments" ? departments : null;
      const options = relationOptions ?? field.options?.map((option) => ({value:option,label:option.replaceAll("_"," ")}));
      return <label key={field.key}>{field.label}{field.required && " *"}
        {field.type === "textarea" ? <textarea value={values[field.key]} onChange={(event) => setValues({...values,[field.key]:event.target.value})} required={field.required}/> :
        options ? <select value={values[field.key]} onChange={(event) => setValues({...values,[field.key]:event.target.value})} required={field.required}><option value="">Select {field.label.toLowerCase()}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> :
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
