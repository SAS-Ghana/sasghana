import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listNamedRows, listRows, updateRow } from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";
import { RecordActions } from "./record-actions";

type Config = { title: string; subtitle: string; table: string; employeeKey?: string; columns: [string, string][]; approvalType?: "leave" | "expense" | "request"; action?: string };

type ManagerRequestRow = DataRow & { source_table?: string };

const configs: Record<string, Config> = {
  "Team Attendance": { title: "Team Attendance", subtitle: "Present, absent, late, break, remote and overtime records for your reporting line.", table: "attendance_records", columns: [["employee_name", "Employee"], ["attendance_date", "Date"], ["clock_in", "Clock in"], ["clock_out", "Clock out"], ["status", "Status"], ["notes", "Notes"]] },
  "Leave Approvals": { title: "Leave Approvals", subtitle: "Review team leave, add a manager comment and forward approved requests to HR.", table: "leave_requests", columns: [["employee_name", "Employee"], ["leave_type", "Leave type"], ["start_date", "Starts"], ["end_date", "Ends"], ["days", "Days"], ["workflow_stage", "Stage"], ["status", "Status"]], approvalType: "leave" },
  Tasks: { title: "Tasks and Work Management", subtitle: "Assign and monitor authorised team tasks, deadlines, priorities and workload.", table: "tasks", employeeKey: "assigned_to_employee_id", columns: [["employee_name", "Assigned to"], ["title", "Task"], ["priority", "Priority"], ["due_date", "Due"], ["progress", "Progress"], ["status", "Status"]], action: "Assign task" },
  "Shift & Schedules": { title: "Shift and Schedule Management", subtitle: "Review and assign team schedules, shifts, remote work and overtime coverage.", table: "shift_assignments", columns: [["employee_name", "Employee"], ["shift_date", "Date"], ["starts_at", "Starts"], ["ends_at", "Ends"], ["location", "Location"], ["status", "Status"]], action: "Assign shift" },
  "Employee Requests": { title: "Employee Requests", subtitle: "Review general, asset and transfer requests submitted by your team.", table: "manager_request_feed", columns: [["employee_name", "Employee"], ["request_type", "Request type"], ["subject", "Subject"], ["created_at", "Submitted"], ["priority", "Priority"], ["status", "Status"]], approvalType: "request" },
  "Expense Approvals": { title: "Expense Approvals", subtitle: "Review receipts and claims before approved items move to HR and Finance.", table: "expense_claims", columns: [["employee_name", "Employee"], ["category", "Category"], ["amount", "Amount"], ["expense_date", "Date"], ["receipt_url", "Receipt"], ["status", "Status"]], approvalType: "expense" },
  Documents: { title: "Team Documents", subtitle: "Track shared, signed, missing and expiring team documents without exposing restricted salary, tax or investigation files.", table: "employee_documents", columns: [["employee_name", "Employee"], ["document_name", "Document"], ["category", "Category"], ["expiry_date", "Expiry"], ["status", "Status"]], action: "Request document" },
  "Learning & Development": { title: "Learning and Development", subtitle: "Assign training, review progress, certifications, skills gaps and development plans.", table: "employee_training", columns: [["employee_name", "Employee"], ["course_name", "Training"], ["training_type", "Type"], ["status", "Status"], ["progress", "Progress"], ["due_date", "Due"]], action: "Assign training" },
  "Recruitment & Onboarding": { title: "Recruitment and Onboarding", subtitle: "Participate in authorised recruitment, interviews, onboarding tasks and probation completion.", table: "job_openings", columns: [["title", "Vacancy"], ["department_name", "Department"], ["location", "Location"], ["closing_date", "Closes"], ["status", "Status"]], action: "Submit recruitment request" },
  Assets: { title: "Team Assets", subtitle: "View assigned equipment, employee requests, handovers, returns and damaged items for your team.", table: "asset_requests", columns: [["employee_name", "Employee"], ["asset_type", "Requested asset"], ["reason", "Reason"], ["priority", "Priority"], ["status", "Status"]], approvalType: "request" },
  "Team Performance": { title: "Team Performance", subtitle: "Create and manage performance reviews for authorised team members.", table: "performance_reviews", columns: [["employee_name", "Employee"], ["review_type", "Review"], ["review_period", "Period"], ["due_date", "Due"], ["rating", "Rating"], ["status", "Status"]], action: "Start review" },
  "Reports & Analytics": { title: "Team Reports and Analytics", subtitle: "Team-scoped attendance, leave, performance, task, training, expense and headcount information.", table: "managed_team_directory", employeeKey: "id", columns: [["full_name", "Employee"], ["position_title", "Position"], ["department_name", "Department"], ["branch", "Branch"], ["employment_status", "Status"]] },
  Notifications: { title: "Manager Notifications", subtitle: "Leave, attendance, tasks, expenses, reviews, probation, documents, birthdays and training alerts.", table: "notifications", columns: [["title", "Notification"], ["body", "Message"], ["category", "Category"], ["created_at", "Received"], ["read_at", "Read"]] },
  "Team Communication": { title: "Team Communication", subtitle: "Send direct work messages to authorised team members and review sent messages.", table: "messages", employeeKey: "recipient_employee_id", columns: [["employee_name", "Recipient"], ["subject", "Subject"], ["body", "Message"], ["status", "Status"], ["created_at", "Sent"]], action: "Send message" },
};

export function ManagerSectionPage({ label, accessToken, profile }: { label: string; accessToken: string; profile: UserProfile }) {
  const config = configs[label];
  const [rows, setRows] = useState<ManagerRequestRow[]>([]);
  const [team, setTeam] = useState<DataRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!config) return;
    setLoading(true); setError("");
    try {
      const managedTeam = await listNamedRows(accessToken, "managed_team_directory", "*", "full_name");
      setTeam(managedTeam);
      const names = new Map(managedTeam.map((row) => [String(row.id), String(row.full_name)]));
      const ids = new Set(names.keys());

      let records: ManagerRequestRow[];
      if (config.table === "manager_request_feed") {
        const read = async (table: string) => listRows(accessToken, table, "*", 500).catch(() => [] as DataRow[]);
        const [general, assets, transfers, changes] = await Promise.all([read("hr_requests"), read("asset_requests"), read("transfer_requests"), read("employee_change_requests")]);
        records = [
          ...general.map((row) => ({ ...row, source_table: "hr_requests", request_type: row.request_type ?? "general", subject: row.subject ?? row.description ?? "Employee request" })),
          ...assets.map((row) => ({ ...row, source_table: "asset_requests", request_type: "asset", subject: row.asset_type ?? row.category ?? "Asset request" })),
          ...transfers.map((row) => ({ ...row, source_table: "transfer_requests", request_type: "transfer", subject: `${row.requested_department ?? ""} ${row.requested_branch ?? ""}`.trim() || "Transfer request", priority: "normal" })),
          ...changes.map((row) => ({ ...row, source_table: "employee_change_requests", request_type: "profile change", subject: row.field_name ?? "Profile update", priority: "normal" })),
        ].filter((row) => ids.has(String(row.employee_id)));
      } else if (config.table === "managed_team_directory") {
        records = managedTeam;
      } else {
        records = await listRows(accessToken, config.table, "*", 500);
        if (!["notifications", "job_openings"].includes(config.table)) {
          records = records.filter((row) => ids.has(String(row[config.employeeKey ?? "employee_id"] ?? row.employee_id ?? row.assigned_to_employee_id ?? row.subject_employee_id)));
        }
      }

      setRows(records.map((row) => {
        const employeeId = String(row[config.employeeKey ?? "employee_id"] ?? row.employee_id ?? row.assigned_to_employee_id ?? row.recipient_employee_id ?? row.subject_employee_id ?? "");
        return { ...row, employee_name: row.employee_name ?? names.get(employeeId) };
      }));
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "This manager section could not be loaded.");
    } finally { setLoading(false); }
  }, [accessToken, config]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);
  useEffect(() => { setSort(config?.columns[0]?.[0] ?? ""); setDirection("desc"); }, [config]);

  const statuses = useMemo(() => Array.from(new Set(rows.map((row) => String(row.status ?? "")).filter(Boolean))).sort(), [rows]);
  const visible = useMemo(() => rows.filter((row) => (status === "all" || String(row.status) === status) && (!query || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())))).sort((a, b) => sort ? String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, { numeric: true }) * (direction === "asc" ? 1 : -1) : 0), [rows, query, status, sort, direction]);

  async function decide(row: ManagerRequestRow, decision: "approve" | "return" | "reject") {
    if (!row.id || !config) return;
    const comment = window.prompt("Manager comment:", String(row.manager_comment ?? ""));
    if (comment === null) return;
    setBusy(String(row.id)); setError(""); setNotice("");
    try {
      let table = config.table;
      let update: DataRow = { manager_comment: comment.trim() || null };
      if (config.approvalType === "leave") {
        if (decision === "approve") update = { ...update, status: "pending", workflow_stage: "hr_review" };
        else update = { ...update, status: "rejected", workflow_stage: "completed" };
      } else if (config.approvalType === "expense") {
        update = { ...update, status: decision === "approve" ? "manager_approved" : decision === "return" ? "returned" : "rejected" };
      } else {
        table = String(row.source_table ?? config.table);
        if (table === "asset_requests") update = { ...update, status: decision === "approve" ? "approved" : "rejected" };
        else if (table === "transfer_requests" || table === "employee_change_requests") update = { ...update, status: decision === "approve" ? "manager_approved" : decision === "return" ? "returned" : "rejected", reviewed_by: profile.id, reviewed_at: new Date().toISOString() };
        else update = { ...update, status: decision === "approve" ? "in_progress" : decision === "return" ? "returned" : "rejected" };
      }
      await updateRow(accessToken, table, String(row.id), update);
      await load();
      setNotice(decision === "approve" && config.approvalType === "leave" ? "Leave request forwarded to HR." : `Request ${decision === "approve" ? "approved" : decision === "return" ? "returned" : "rejected"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The request could not be updated."); }
    finally { setBusy(""); }
  }

  async function updateOperationalState(row: ManagerRequestRow, next: string) {
    if (!row.id || !config) return;
    setBusy(String(row.id)); setError("");
    try {
      const update: DataRow = { status: next };
      if (next === "completed") { update.progress = 100; update.completed_at = new Date().toISOString(); }
      await updateRow(accessToken, config.table, String(row.id), update);
      await load(); setNotice(`Record updated to ${next.replaceAll("_", " ")}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The record could not be updated."); }
    finally { setBusy(""); }
  }

  if (!config) return <section className="card data-panel"><h2>{label}</h2><p className="muted">This manager feature is not enabled for this account.</p></section>;
  const canManageRows = label !== "Notifications" && config.table !== "managed_team_directory";

  return <section>
    <header className="page-header"><div><span className="eyebrow">Manager workspace</span><h1><MenuIcon name={moduleIcon(config.title)} />{config.title}</h1><p className="muted">{config.subtitle}</p></div><div className="page-actions">{config.action && <button className="primary" onClick={() => setDialog(true)}>{config.action}</button>}<button className="secondary" onClick={() => window.print()}>Print report</button><button className="secondary" onClick={() => void load()}>Refresh</button></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}
    <article className="card data-panel"><div className="filter-toolbar"><input aria-label="Search team records" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search authorised team records..." /><select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><button className="secondary" onClick={() => { setQuery(""); setStatus("all"); }}>Clear filters</button></div>
      {loading ? <div className="empty-state">Loading authorised records…</div> : visible.length === 0 ? <div className="empty-state"><h3>No records available</h3><p>No authorised team records currently match this section.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr>{config.columns.map(([, title]) => <th key={title}>{title}</th>)}{config.approvalType && <th>Decision</th>}{["Tasks", "Learning & Development"].includes(label) && <th>Actions</th>}{canManageRows && <th>Manage</th>}</tr></thead><tbody>{visible.map((row, index) => <tr key={String(row.id ?? index)}>{config.columns.map(([key]) => <td key={key}>{format(row[key])}</td>)}{config.approvalType && <td><div className="row-actions"><button disabled={busy === String(row.id)} onClick={() => void decide(row, "approve")}>{config.approvalType === "leave" ? "Forward to HR" : "Approve"}</button>{config.approvalType === "expense" && <button disabled={busy === String(row.id)} onClick={() => void decide(row, "return")}>Return</button>}<button className="danger" disabled={busy === String(row.id)} onClick={() => void decide(row, "reject")}>Reject</button></div></td>}{["Tasks", "Learning & Development"].includes(label) && <td><div className="row-actions"><button disabled={busy === String(row.id)} onClick={() => void updateOperationalState(row, "in_progress")}>Start</button><button disabled={busy === String(row.id)} onClick={() => void updateOperationalState(row, "completed")}>Complete</button></div></td>}{canManageRows && <td><div className="row-actions"><RecordActions accessToken={accessToken} table={String(row.source_table ?? config.table)} row={row} columns={config.columns} label={label} onReload={load} /></div></td>}</tr>)}</tbody></table></div>}
    </article>
    {dialog && <ManagerCreateDialog action={config.action ?? ""} accessToken={accessToken} profile={profile} team={team} onClose={() => setDialog(false)} onSaved={async (message) => { setDialog(false); await load(); setNotice(message); }} />}
  </section>;
}

function ManagerCreateDialog({ action, accessToken, profile, team, onClose, onSaved }: { action: string; accessToken: string; profile: UserProfile; team: DataRow[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({ priority: "normal", training_type: "course", review_type: "quarterly" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const employeeId = values.employee_id;
      if (["Assign task", "Assign shift", "Assign training", "Start review", "Send message", "Request document"].includes(action) && !employeeId) throw new Error("Select a team member.");
      if (action === "Assign task") await createRow(accessToken, "tasks", { organisation_id: profile.organisation_id, assigned_to_employee_id: employeeId, assigned_by: profile.id, title: values.title, description: values.description || null, priority: values.priority, due_date: values.due_date || null, category: "manager", status: "not_started", progress: 0 });
      else if (action === "Assign training") await createRow(accessToken, "employee_training", { organisation_id: profile.organisation_id, employee_id: employeeId, assigned_by: profile.id, course_name: values.course_name, training_type: values.training_type, due_date: values.due_date || null, status: "assigned", progress: 0, certificate_status: "not_issued" });
      else if (action === "Assign shift") {
        const starts = new Date(values.starts_at), ends = new Date(values.ends_at);
        if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) throw new Error("The shift end time must be after the start time.");
        await createRow(accessToken, "shift_assignments", { organisation_id: profile.organisation_id, employee_id: employeeId, shift_date: starts.toISOString().slice(0, 10), starts_at: starts.toISOString(), ends_at: ends.toISOString(), location: values.location || null, remote_allowed: values.remote_allowed === "yes", assigned_by: profile.id, status: "published" });
      } else if (action === "Start review") await createRow(accessToken, "performance_reviews", { organisation_id: profile.organisation_id, employee_id: employeeId, reviewer_id: profile.id, review_type: values.review_type, review_period: values.review_period, due_date: values.due_date || null, status: "draft" });
      else if (action === "Send message") await createRow(accessToken, "messages", { organisation_id: profile.organisation_id, sender_profile_id: profile.id, sender_employee_id: profile.employee_id || null, recipient_employee_id: employeeId, sender_name: profile.display_name, subject: values.subject || null, body: values.body, status: "sent" });
      else if (action === "Request document") await createRow(accessToken, "hr_requests", { organisation_id: profile.organisation_id, employee_id: employeeId, request_type: "document", subject: values.subject, description: values.description || null, priority: values.priority, status: "open", assigned_to: null });
      else if (action === "Submit recruitment request") await createRow(accessToken, "hr_requests", { organisation_id: profile.organisation_id, employee_id: profile.employee_id || null, request_type: "recruitment", subject: values.subject, description: values.description || null, priority: values.priority, status: "open" });
      await onSaved(`${action} saved successfully.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `${action} could not be completed.`); }
    finally { setBusy(false); }
  }

  const employeeSelect = <label>Team member<select required value={values.employee_id ?? ""} onChange={(event) => setValues({ ...values, employee_id: event.target.value })}><option value="">Select employee</option>{team.map((person) => <option key={String(person.id)} value={String(person.id)}>{String(person.full_name)} · {String(person.position_title ?? "Team member")}</option>)}</select></label>;

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal record-modal" role="dialog" aria-modal="true"><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Manager action</span><h2>{action}</h2><form className="record-form" onSubmit={submit}>
    {action !== "Submit recruitment request" && employeeSelect}
    {action === "Assign task" && <><label>Task title<input required value={values.title ?? ""} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label><label>Priority<select value={values.priority} onChange={(event) => setValues({ ...values, priority: event.target.value })}><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label><label>Due date<input type="date" value={values.due_date ?? ""} onChange={(event) => setValues({ ...values, due_date: event.target.value })} /></label><label className="wide">Description<textarea value={values.description ?? ""} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label></>}
    {action === "Assign training" && <><label>Course name<input required value={values.course_name ?? ""} onChange={(event) => setValues({ ...values, course_name: event.target.value })} /></label><label>Training type<select value={values.training_type} onChange={(event) => setValues({ ...values, training_type: event.target.value })}><option value="course">Course</option><option value="workshop">Workshop</option><option value="certification">Certification</option><option value="coaching">Coaching</option></select></label><label>Due date<input type="date" value={values.due_date ?? ""} onChange={(event) => setValues({ ...values, due_date: event.target.value })} /></label></>}
    {action === "Assign shift" && <><label>Starts<input required type="datetime-local" value={values.starts_at ?? ""} onChange={(event) => setValues({ ...values, starts_at: event.target.value })} /></label><label>Ends<input required type="datetime-local" value={values.ends_at ?? ""} onChange={(event) => setValues({ ...values, ends_at: event.target.value })} /></label><label>Location<input value={values.location ?? ""} onChange={(event) => setValues({ ...values, location: event.target.value })} /></label><label>Remote allowed<select value={values.remote_allowed ?? "no"} onChange={(event) => setValues({ ...values, remote_allowed: event.target.value })}><option value="no">No</option><option value="yes">Yes</option></select></label></>}
    {action === "Start review" && <><label>Review type<select value={values.review_type} onChange={(event) => setValues({ ...values, review_type: event.target.value })}><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="probation">Probation</option><option value="project">Project</option></select></label><label>Review period<input required value={values.review_period ?? ""} onChange={(event) => setValues({ ...values, review_period: event.target.value })} placeholder="2026 Q3" /></label><label>Due date<input type="date" value={values.due_date ?? ""} onChange={(event) => setValues({ ...values, due_date: event.target.value })} /></label></>}
    {action === "Send message" && <><label>Subject<input value={values.subject ?? ""} onChange={(event) => setValues({ ...values, subject: event.target.value })} /></label><label className="wide">Message<textarea required value={values.body ?? ""} onChange={(event) => setValues({ ...values, body: event.target.value })} /></label></>}
    {["Request document", "Submit recruitment request"].includes(action) && <><label>Subject<input required value={values.subject ?? ""} onChange={(event) => setValues({ ...values, subject: event.target.value })} /></label><label>Priority<select value={values.priority} onChange={(event) => setValues({ ...values, priority: event.target.value })}><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label><label className="wide">Details<textarea required value={values.description ?? ""} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label></>}
    {error && <p className="form-error wide" role="alert">{error}</p>}<div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : action}</button></div>
  </form></section></div>;
}

function format(value: unknown) { if (value === null || value === undefined || value === "") return "—"; const text = String(value); if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString("en-GB"); return text.replaceAll("_", " "); }
