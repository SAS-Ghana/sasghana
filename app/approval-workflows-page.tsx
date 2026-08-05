import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRow, DataRow, listRows, updateRow } from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type Step = { role: string; label: string; days: number };
type WorkflowDraft = { id?: string; name: string; workflow_type: string; description: string; status: string; steps: Step[] };

const emptyStep = (): Step => ({ role: "manager", label: "Manager approval", days: 2 });
const emptyDraft = (): WorkflowDraft => ({ name: "", workflow_type: "", description: "", status: "active", steps: [emptyStep()] });

function stepsOf(row: DataRow): Step[] {
  const value = row.steps;
  if (Array.isArray(value)) return value as Step[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as Step[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normaliseSteps(steps: Step[]) {
  return steps.map((step, index) => ({
    role: step.role.trim() || "approver",
    label: step.label.trim() || `Approval step ${index + 1}`,
    days: Math.max(1, Number(step.days) || 1),
  }));
}

export function ApprovalWorkflowsPage({ accessToken, organisationId, scope = "administrator" }: { accessToken: string; organisationId: string; scope?: "administrator" | "hr" }) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listRows(accessToken, "approval_workflows", "*", 500, "updated_at"));
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "Approval workflows could not be loaded.");
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter((row) =>
    (status === "all" || String(row.status) === status) &&
    (!query || `${row.name ?? ""} ${row.workflow_type ?? ""} ${row.description ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  ), [rows, status, query]);

  const workflowTypes = useMemo(() => Array.from(new Set(rows.map((row) => String(row.workflow_type ?? "").trim()).filter(Boolean))).sort(), [rows]);
  const active = rows.filter((row) => row.status === "active").length;
  const stepCount = rows.reduce((total, row) => total + stepsOf(row).length, 0);

  function openNew() {
    setError("");
    setNotice("");
    setDraft(emptyDraft());
  }

  function openEdit(row: DataRow) {
    setError("");
    setNotice("");
    setDraft({
      id: String(row.id),
      name: String(row.name ?? ""),
      workflow_type: String(row.workflow_type ?? ""),
      description: String(row.description ?? ""),
      status: String(row.status ?? "active"),
      steps: stepsOf(row).length ? stepsOf(row) : [emptyStep()],
    });
  }

  function updateStep(index: number, change: Partial<Step>) {
    if (!draft) return;
    setDraft({ ...draft, steps: draft.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...change } : step) });
  }

  function removeStep(index: number) {
    if (!draft || draft.steps.length === 1) return;
    setDraft({ ...draft, steps: draft.steps.filter((_, stepIndex) => stepIndex !== index) });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const workflowType = draft.workflow_type.trim();
    if (!workflowType) return setError("Enter a workflow type.");
    if (!draft.steps.length) return setError("Add at least one approval step.");

    setBusy(draft.id ?? "create");
    setError("");
    setNotice("");
    try {
      const steps = normaliseSteps(draft.steps);
      const payload: DataRow = {
        organisation_id: organisationId,
        name: draft.name.trim(),
        workflow_type: workflowType.toLowerCase().replace(/\s+/g, "_"),
        description: draft.description.trim() || null,
        status: draft.status,
        steps: steps as unknown as DataRow[string],
      };
      if (draft.id) await updateRow(accessToken, "approval_workflows", draft.id, payload);
      else await createRow(accessToken, "approval_workflows", payload);
      setDraft(null);
      await load();
      setNotice(draft.id ? "Workflow updated from Supabase." : "Workflow created and stored in Supabase.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workflow could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function change(row: DataRow, next: string) {
    if (!row.id) return;
    setBusy(String(row.id));
    setError("");
    setNotice("");
    try {
      await updateRow(accessToken, "approval_workflows", String(row.id), { status: next });
      await load();
      setNotice(`Workflow moved to ${next.replaceAll("_", " ")}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workflow could not be updated.");
    } finally {
      setBusy("");
    }
  }

  return <section>
    <header className="page-header"><div><span className="eyebrow">{scope === "hr" ? "HR workflow administration" : "Organization workflow control"}</span><h1><MenuIcon name={moduleIcon("Approval Workflows")} />Approval Workflows</h1><p className="muted">A written record of your approval routes and expected turnaround, for reference and planning.</p></div><div className="row-actions"><button type="button" className="primary" onClick={openNew}>Create workflow</button><button type="button" className="secondary" onClick={() => void load()}>Refresh</button></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <article className="card data-panel"><h2>How approvals actually work today</h2><p className="muted">The routes below run automatically, independent of anything recorded on this page — this page is a reference and planning tool, not a live workflow engine yet.</p>
      <div className="master-list">
        <div><strong>Leave requests</strong><span>Employee submits → Manager reviews → HR gives the final decision.</span></div>
        <div><strong>Expense claims</strong><span>Employee submits → moves through Manager, Finance and Accounts review stages in order.</span></div>
        <div><strong>Profile change requests</strong><span>Employee requests a change → HR or an Administrator approves or rejects it directly.</span></div>
        <div><strong>Asset and transfer requests</strong><span>Employee submits → Manager approves, returns or rejects it.</span></div>
      </div>
    </article>

    <div className="workflow-kpis"><article className="card"><span>Recorded workflows</span><strong>{rows.length}</strong></article><article className="card"><span>Active</span><strong>{active}</strong></article><article className="card"><span>Approval steps</span><strong>{stepCount}</strong></article><article className="card"><span>Workflow types</span><strong>{workflowTypes.length}</strong></article></div>

    <div className="filter-toolbar"><input id="workflow-search" name="workflow_search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows..." /><select id="workflow-status" name="workflow_status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></div>

    <div className="workflow-grid">{visible.map((row) => {
      const workflowSteps = stepsOf(row);
      return <article className="workflow-card" key={String(row.id)}><header><div><span className="eyebrow">{String(row.workflow_type ?? "workflow").replaceAll("_", " ")}</span><h3>{String(row.name)}</h3></div><span className={`status-pill ${String(row.status)}`}>{String(row.status)}</span></header><p>{String(row.description ?? "No description supplied.")}</p><div className="workflow-steps">{workflowSteps.length ? workflowSteps.map((step, index) => <span className="workflow-step" key={`${step.role}-${index}`}>{index + 1}. {step.label || step.role} · {step.days || 1}d</span>) : <span className="muted">No approval steps configured.</span>}</div><footer><button type="button" disabled={busy === String(row.id)} onClick={() => openEdit(row)}>Edit</button><button type="button" disabled={busy === String(row.id)} onClick={() => void change(row, row.status === "active" ? "inactive" : "active")}>{row.status === "active" ? "Disable" : "Activate"}</button><button type="button" disabled={busy === String(row.id)} onClick={() => void change(row, "draft")}>Move to draft</button><button type="button" onClick={() => window.print()}>Print</button></footer></article>;
    })}</div>

    {!visible.length && <article className="card empty-state"><h3>No workflows found</h3><p>Create a workflow or change the filters.</p></article>}

    {draft && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}><section className="modal record-modal workflow-editor" role="dialog" aria-modal="true" aria-labelledby="workflow-editor-title"><button type="button" className="modal-close" onClick={() => setDraft(null)}>×</button><span className="eyebrow">Workflow reference entry</span><h2 id="workflow-editor-title">{draft.id ? "Edit approval workflow" : "Create approval workflow"}</h2><form className="record-form" onSubmit={save}>
      <label htmlFor="workflow-name">Workflow name<input id="workflow-name" name="workflow_name" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Annual leave approval" /></label>
      <label htmlFor="workflow-type">Workflow type<input id="workflow-type" name="workflow_type" list="workflow-types" required value={draft.workflow_type} onChange={(event) => setDraft({ ...draft, workflow_type: event.target.value })} placeholder="leave, expense, transfer..." /><datalist id="workflow-types">{workflowTypes.map((type) => <option key={type} value={type} />)}</datalist></label>
      <label className="wide" htmlFor="workflow-description">Description<textarea id="workflow-description" name="description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Explain when this workflow applies." /></label>
      <label htmlFor="workflow-editor-status">Status<select id="workflow-editor-status" name="status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>

      <fieldset className="wide workflow-step-editor"><legend>Approval route</legend>{draft.steps.map((step, index) => <div className="workflow-step-row" key={index}><span className="workflow-step-number">{index + 1}</span><label>Approver role<input name={`step_${index}_role`} required value={step.role} onChange={(event) => updateStep(index, { role: event.target.value })} placeholder="manager, hr, administrator" /></label><label>Step label<input name={`step_${index}_label`} required value={step.label} onChange={(event) => updateStep(index, { label: event.target.value })} placeholder="Manager approval" /></label><label>Deadline days<input name={`step_${index}_days`} type="number" min="1" max="365" required value={step.days} onChange={(event) => updateStep(index, { days: Number(event.target.value) })} /></label><button type="button" className="danger" disabled={draft.steps.length === 1} onClick={() => removeStep(index)}>Remove</button></div>)}<button type="button" className="secondary" onClick={() => setDraft({ ...draft, steps: [...draft.steps, emptyStep()] })}>Add approval step</button></fieldset>

      <div className="form-actions wide"><button type="button" className="secondary" onClick={() => setDraft(null)}>Cancel</button><button type="submit" className="primary" disabled={Boolean(busy)}>{busy ? "Saving…" : draft.id ? "Save workflow" : "Create workflow"}</button></div>
    </form></section></div>}
  </section>;
}
