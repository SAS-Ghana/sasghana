import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRow, createSignedStorageUrl, DataRow, listNamedRows, listRows, updateRow, uploadStorageFile } from "./lib/supabase-data";
import { money, printTemplateDocument, renderTemplateContent } from "./lib/document-templates";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

const mergeFields = [
  "{{today}}", "{{employee.full_name}}", "{{employee.employee_number}}", "{{employee.position_title}}",
  "{{employee.department}}", "{{employee.start_date}}", "{{employee.work_email}}", "{{employee.salary_amount}}",
  "{{employee.salary_frequency}}", "{{employee.monthly_salary}}", "{{employee.annual_salary}}", "{{employee.salary_currency}}",
  "{{payroll.pay_period}}", "{{payroll.basic_salary}}", "{{payroll.allowances}}", "{{payroll.paye_tax}}",
  "{{payroll.employee_ssnit}}", "{{payroll.tier_one}}", "{{payroll.tier_two}}", "{{payroll.tier_three}}", "{{payroll.net_pay}}",
];

export function DocumentStudio({ accessToken, organisationId }: { accessToken: string; organisationId: string }) {
  const [templates, setTemplates] = useState<DataRow[]>([]);
  const [employees, setEmployees] = useState<DataRow[]>([]);
  const [payroll, setPayroll] = useState<DataRow[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selected, setSelected] = useState<DataRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name: "", template_type: "appointment_letter", subject: "", content: "", status: "active" });
  const [signature, setSignature] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [templateRows, employeeRows, payrollRows] = await Promise.all([
        listRows(accessToken, "document_templates", "*", 200),
        listNamedRows(accessToken, "employees", "id,first_name,middle_name,last_name,employee_number,position_title,department_id,department_name,start_date,work_email,basic_salary,salary_frequency,salary_currency,monthly_salary,annual_salary", "first_name"),
        listRows(accessToken, "payroll_records", "*", 1000),
      ]);
      setTemplates(templateRows);
      setEmployees(employeeRows);
      setPayroll(payrollRows);
      if (!selectedEmployeeId && employeeRows[0]?.id) setSelectedEmployeeId(String(employeeRows[0].id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document Studio could not be loaded."); }
  }, [accessToken, selectedEmployeeId]);

  useEffect(() => { void load(); }, [load]);

  const selectedEmployee = useMemo(() => employees.find((employee) => String(employee.id) === selectedEmployeeId) ?? null, [employees, selectedEmployeeId]);
  const selectedPayroll = useMemo(() => payroll.filter((row) => String(row.employee_id) === selectedEmployeeId).sort((a, b) => String(b.pay_period ?? b.created_at ?? "").localeCompare(String(a.pay_period ?? a.created_at ?? "")))[0] ?? null, [payroll, selectedEmployeeId]);

  function edit(template: DataRow) {
    setSelected(template);
    setValues({ name: String(template.name), template_type: String(template.template_type), subject: String(template.subject ?? ""), content: String(template.content ?? ""), status: String(template.status ?? "active") });
    setEditing(true);
  }
  function create() { setSelected(null); setValues({ name: "", template_type: "appointment_letter", subject: "", content: "", status: "active" }); setEditing(true); }

  async function save(event: FormEvent) {
    event.preventDefault(); setMessage(""); setError(""); setBusy("template");
    try {
      let signaturePath = String(selected?.signature_path ?? "");
      if (signature) {
        signaturePath = `${organisationId}/signatures/${Date.now()}-${signature.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        await uploadStorageFile(accessToken, "hr-media", signaturePath, signature);
      }
      const payload: DataRow = { ...values, organisation_id: organisationId, signature_path: signaturePath || null };
      if (selected?.id) await updateRow(accessToken, "document_templates", String(selected.id), payload);
      else await createRow(accessToken, "document_templates", payload);
      setEditing(false); setSignature(null); setMessage("Template saved to Supabase."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Template could not be saved."); }
    finally { setBusy(""); }
  }

  function renderContent(template: DataRow) {
    if (!selectedEmployee) throw new Error("Select an employee before previewing or generating a document.");
    return renderTemplateContent(String(template.content ?? ""), selectedEmployee, selectedPayroll);
  }

  async function preview(template: DataRow) {
    setError("");
    try {
      const content = renderContent(template);
      let signatureUrl = "";
      if (template.signature_path) try { signatureUrl = await createSignedStorageUrl(accessToken, "hr-media", String(template.signature_path)); } catch { /* optional signature */ }
      printTemplateDocument(String(template.name), content, signatureUrl || undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document preview could not be generated."); }
  }

  async function generate(template: DataRow) {
    if (!selectedEmployee?.id) return setError("Select an employee before generating a document.");
    setBusy(String(template.id)); setError(""); setMessage("");
    try {
      const content = renderContent(template);
      await createRow(accessToken, "employee_documents", {
        organisation_id: organisationId,
        employee_id: selectedEmployee.id,
        document_name: String(template.name),
        category: String(template.template_type ?? "generated_document"),
        status: "issued",
        confidentiality: ["payslip", "employment_contract", "appointment_letter"].includes(String(template.template_type)) ? "confidential" : "internal",
        issued_date: new Date().toISOString().slice(0, 10),
        signature_status: template.signature_path ? "signed" : "not_required",
        template_id: template.id,
        generated_content: content,
      });
      setMessage(`${String(template.name)} generated for ${String(selectedEmployee.first_name)} ${String(selectedEmployee.last_name)} and added to the employee document record.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document could not be generated."); }
    finally { setBusy(""); }
  }

  return <section>
    <header className="page-header"><div><span className="eyebrow">Documents</span><h1><MenuIcon name={moduleIcon("Documents & Templates")} />Document Studio</h1><p className="muted">Design and generate appointment letters, contracts, payslips and forms using live employee salary and payroll data.</p></div><button className="primary" onClick={create}>Create template</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-message" aria-live="polite">{message}</p>}
    <article className="card data-panel document-generation-context"><div><h2>Generate for employee</h2><p className="muted">Salary and payroll merge fields use the selected employee's authorised record.</p></div><label>Employee<select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={String(employee.id)} value={String(employee.id)}>{String(employee.first_name)} {String(employee.last_name)} · {String(employee.employee_number)}</option>)}</select></label>{selectedEmployee && <div className="salary-preview"><span>Monthly salary <strong>{money(selectedEmployee.monthly_salary ?? selectedEmployee.basic_salary, String(selectedEmployee.salary_currency ?? "GHS"))}</strong></span><span>Annual salary <strong>{money(selectedEmployee.annual_salary, String(selectedEmployee.salary_currency ?? "GHS"))}</strong></span><small>{selectedPayroll ? `Latest payroll: ${String(selectedPayroll.pay_period)}` : "No published payroll record yet; profile salary will be used."}</small></div>}</article>
    <article className="card data-panel"><div className="panel-head"><div><h2>Saved templates</h2><p className="muted">Merge fields fill employee and payroll data automatically.</p></div></div><div className="template-grid">{templates.map((template) => <article key={String(template.id)}><span>{String(template.template_type).replaceAll("_", " ")}</span><h3>{String(template.name)}</h3><p>{String(template.subject ?? "No subject")}</p><div className="row-actions"><button onClick={() => void preview(template)}>Preview</button><button className="primary" disabled={busy === String(template.id)} onClick={() => void generate(template)}>{busy === String(template.id) ? "Generating…" : "Generate"}</button><button onClick={() => edit(template)}>Design</button></div></article>)}</div></article>
    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}><section className="modal document-designer" role="dialog" aria-modal="true" aria-labelledby="designer-title"><button type="button" className="modal-close" onClick={() => setEditing(false)} aria-label="Close">×</button><span className="eyebrow">Template designer</span><h2 id="designer-title">{selected ? "Edit template" : "Create template"}</h2><form onSubmit={save} className="record-form"><label>Template name *<input required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label><label>Document type *<select value={values.template_type} onChange={(event) => setValues({ ...values, template_type: event.target.value })}><option value="appointment_letter">Appointment letter</option><option value="payslip">Payslip</option><option value="employment_contract">Employment contract</option><option value="confirmation_letter">Confirmation letter</option><option value="probation_review">Probation review</option><option value="custom">Custom document</option></select></label><label className="wide">Subject / heading<input value={values.subject} onChange={(event) => setValues({ ...values, subject: event.target.value })} /></label><label className="wide">Document text *<textarea className="template-editor" required value={values.content} onChange={(event) => setValues({ ...values, content: event.target.value })} /></label><div className="wide merge-fields"><strong>Insertable merge fields</strong><div>{mergeFields.map((field) => <button type="button" key={field} onClick={() => setValues({ ...values, content: `${values.content}${values.content ? " " : ""}${field}` })}>{field}</button>)}</div></div><label>Upload e-signature<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setSignature(event.target.files?.[0] ?? null)} /></label><label>Status<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label><div className="form-actions wide"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button className="primary" disabled={busy === "template"}>{busy === "template" ? "Saving…" : "Save template"}</button></div></form></section></div>}
  </section>;
}
