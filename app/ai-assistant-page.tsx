import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { fetchProfile, getValidAccessToken, readSession } from "./lib/supabase-auth";
import { createRow, DataRow, listNamedRows, listRows, listRowsWhere } from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type AssistantRole = "manager" | "hr";
type WorkspaceData = Record<string, DataRow[]>;

const promptSets: Record<AssistantRole, string[]> = {
  manager: ["Summarise my team priorities", "Which approvals need attention?", "Draft a one to one agenda", "Show overdue tasks and training", "Suggest a fair performance review structure"],
  hr: ["Summarise workforce risks", "Which HR approvals need attention?", "Draft an HR letter", "Create an onboarding checklist", "Show payroll and document readiness"],
};

export function AiAssistantPage({ role, accessToken: providedToken, profile: providedProfile }: { role: AssistantRole; accessToken?: string; profile?: UserProfile }) {
  const [accessToken, setAccessToken] = useState(providedToken ?? "");
  const [profile, setProfile] = useState<UserProfile | null>(providedProfile ?? null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [data, setData] = useState<WorkspaceData>({});
  const [history, setHistory] = useState<DataRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (providedToken && providedProfile) { setAccessToken(providedToken); setProfile(providedProfile); return; }
    let cancelled = false;
    void (async () => {
      try {
        const session = readSession();
        if (!session) throw new Error("Sign in again to use the assistant.");
        const token = await getValidAccessToken(session.access_token);
        const currentProfile = await fetchProfile(token, session.user.id);
        if (!currentProfile) throw new Error("Your profile could not be loaded.");
        if (!cancelled) { setAccessToken(token); setProfile(currentProfile); }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "The signed-in account could not be resolved."); }
    })();
    return () => { cancelled = true; };
  }, [providedToken, providedProfile]);

  const load = useCallback(async () => {
    if (!accessToken || !profile) return;
    setError("");
    const issues: string[] = [];
    const read = async (table: string, limit = 500) => {
      try { return await listRows(accessToken, table, "*", limit); }
      catch (cause) { issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }
    };
    try {
      let teamRows: DataRow[] = [];
      let teamIds: Set<string> | null = null;
      if (role === "manager") {
        teamRows = await listNamedRows(accessToken, "managed_team_directory", "*", "full_name");
        teamIds = new Set(teamRows.map((row) => String(row.id)));
      }
      const [employees, leave, expenses, tasks, training, reviews, onboarding, offboarding, documents, tickets, jobs, announcements, meetings, payroll, assetRequests, benefits] = await Promise.all([
        read("employees"), read("leave_requests"), read("expense_claims"), read("tasks"), read("employee_training"), read("performance_reviews"),
        read("employee_onboarding"), read("employee_offboarding"), read("employee_documents"), read("support_tickets"), read("job_openings"),
        read("announcements", 100), read("meetings", 200), read("payroll_records"), read("asset_requests"), read("employee_benefits"),
      ]);
      const scope = (rows: DataRow[], key = "employee_id") => role === "manager" && teamIds ? rows.filter((row) => teamIds.has(String(row[key] ?? row.employee_id ?? row.assigned_to_employee_id))) : rows;
      setData({
        team: role === "manager" ? teamRows : employees,
        employees: scope(employees, "id"), leave: scope(leave), expenses: scope(expenses), tasks: scope(tasks, "assigned_to_employee_id"),
        training: scope(training), reviews: scope(reviews), onboarding: scope(onboarding), offboarding: scope(offboarding), documents: scope(documents),
        tickets: scope(tickets), jobs, announcements, meetings, payroll: scope(payroll), assetRequests: scope(assetRequests), benefits: scope(benefits),
      });
      setHistory(await listRowsWhere(accessToken, "ai_assistant_logs", { profile_id: profile.id }, "*", 20));
      if (issues.length) setError(`Some live data could not be loaded. ${issues.slice(0, 3).join(" · ")}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assistant workspace could not be loaded."); }
  }, [accessToken, profile, role]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener("sas-data-changed", refresh); return () => window.removeEventListener("sas-data-changed", refresh); }, [load]);

  const summary = useMemo(() => makeSummary(data), [data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = question.trim();
    if (!clean || !accessToken || !profile) return;
    setBusy(true); setError("");
    try {
      const response = buildAnswer(clean, role, data, summary);
      setAnswer(response);
      await createRow(accessToken, "ai_assistant_logs", { organisation_id: profile.organisation_id, profile_id: profile.id, assistant_role: role, question: clean, response, data_summary: JSON.stringify(summary) });
      setHistory((current) => [{ question: clean, response, created_at: new Date().toISOString() }, ...current].slice(0, 20));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assistant could not prepare a response."); }
    finally { setBusy(false); }
  }

  return <section className="dashboard-workspace">
    <header className="page-header"><div><span className="eyebrow">Live Supabase assistance</span><h1><MenuIcon name={moduleIcon("AI HR Assistant")} />AI {role === "manager" ? "Manager" : "HR"} Assistant</h1><p className="muted">Guidance is generated from the records this account is authorised to access. Final employment decisions remain with authorised people.</p></div><button className="secondary" disabled={!accessToken} onClick={() => void load()}>Refresh live data</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dashboard-metric-grid">{Object.entries(summary).slice(0, 8).map(([label, value]) => <article className="card metric dashboard-metric-card" key={label}><span>{label.replaceAll("_", " ")}</span><strong>{value}</strong><small>Live authorised records</small></article>)}</div>
    <div className="dashboard-content-grid">
      <article className="card panel assistant-panel"><h2>Ask the assistant</h2><form className="assistant-prompt-form" onSubmit={submit}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Describe the task, document or decision support you need…" /><button className="primary" disabled={busy || !accessToken}>{busy ? "Analysing…" : "Generate guidance"}</button></form><div className="quick dashboard-quick-grid">{promptSets[role].map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}><span>AI</span>{prompt}</button>)}</div></article>
      <article className="card panel"><h2>Response</h2>{answer ? <div className="ai-response"><p>{answer}</p><small className="muted">Review facts, permissions and company policy before using this output.</small></div> : <div className="empty-state"><h3>Ready to assist</h3><p>Select a prompt or enter your own request. The response will use current Supabase records.</p></div>}</article>
      <article className="card panel dashboard-wide-panel"><h2>Recent assistant activity</h2>{history.length ? <div className="activity">{history.slice(0, 8).map((row, index) => <div className="activity-row" key={String(row.id ?? index)}><div className="task-icon">AI</div><p><strong>{String(row.question)}</strong><br /><small>{String(row.response).slice(0, 160)}</small></p><time>{row.created_at ? new Date(String(row.created_at)).toLocaleString("en-GB") : ""}</time></div>)}</div> : <p className="muted">No assistant history yet.</p>}</article>
    </div>
  </section>;
}

function makeSummary(data: WorkspaceData) {
  const open = (rows: DataRow[] = []) => rows.filter((row) => !["completed", "closed", "resolved", "rejected", "cancelled", "archived", "reimbursed", "fulfilled"].includes(String(row.status))).length;
  return {
    employees: (data.team ?? data.employees ?? []).length,
    pending_leave: (data.leave ?? []).filter((row) => String(row.status) === "pending").length,
    expense_actions: (data.expenses ?? []).filter((row) => ["submitted", "manager_approved", "hr_approved", "finance_review", "returned"].includes(String(row.status))).length,
    open_tasks: open(data.tasks),
    training_due: open(data.training),
    reviews_due: open(data.reviews),
    onboarding_active: open(data.onboarding),
    open_tickets: open(data.tickets),
    expiring_documents: (data.documents ?? []).filter((row) => row.expiry_date && new Date(String(row.expiry_date)).getTime() - Date.now() <= 30 * 86400000 && new Date(String(row.expiry_date)).getTime() >= Date.now()).length,
    payroll_drafts: (data.payroll ?? []).filter((row) => ["draft", "calculated", "approved"].includes(String(row.status))).length,
    asset_requests: open(data.assetRequests),
    active_benefits: (data.benefits ?? []).filter((row) => String(row.status) === "active").length,
  };
}

function buildAnswer(question: string, role: AssistantRole, data: WorkspaceData, summary: Record<string, number>) {
  const lower = question.toLowerCase();
  if (lower.includes("priority") || lower.includes("summarise") || lower.includes("risk")) return `${role === "manager" ? "Team" : "Workforce"} priorities from current records: ${summary.pending_leave} pending leave request(s), ${summary.expense_actions} expense claim(s) needing action, ${summary.open_tasks} open task(s), ${summary.training_due} training assignment(s) still active, ${summary.reviews_due} review(s) due, ${summary.open_tickets} open support ticket(s), ${summary.asset_requests} asset request(s), and ${summary.expiring_documents} document(s) expiring within 30 days. Review the highest urgency and oldest submissions first.`;
  if (lower.includes("approval")) return `Current approval workload: ${summary.pending_leave} leave request(s), ${summary.expense_actions} expense claim(s), and ${summary.asset_requests} asset request(s). Confirm balances, policy requirements, supporting evidence, team coverage, budget and comments before recording a decision.`;
  if (lower.includes("onboarding")) return `There are ${summary.onboarding_active} active onboarding journey(s). Suggested checklist: verify employee and salary details, issue appointment or contract documents, collect statutory and bank information, assign manager and department, prepare equipment, schedule orientation, assign mandatory training, and record probation milestones.`;
  if (lower.includes("one to one")) return `Suggested agenda based on ${summary.open_tasks} open task(s) and ${summary.training_due} active training item(s): wellbeing check, progress since the previous meeting, current blockers, task priorities, attendance or workload concerns, feedback in both directions, development goals, agreed actions, owners and due dates.`;
  if (lower.includes("letter")) return `Use Document Studio and select the employee so live name, employee number, position, start date, monthly salary, annual salary, PAYE, SSNIT and net pay fields are merged. Verify the authorised terms and signatory before issuing the letter.`;
  if (lower.includes("payroll") || lower.includes("salary") || lower.includes("tax")) return `There are ${summary.payroll_drafts} payroll record(s) not yet published. Employee salary profiles feed compensation and payroll calculations. Confirm basic salary, frequency, allowances, benefits and deductions before calculating Ghana PAYE and SSNIT, then publish only after authorised review.`;
  if (lower.includes("performance")) return `There are ${summary.reviews_due} review(s) requiring attention. Use evidence-based goals, observable behaviours, balanced strengths and development areas, employee comments and specific next steps. Avoid unsupported or discriminatory conclusions.`;
  if (lower.includes("training") || lower.includes("overdue")) return `${summary.training_due} training assignment(s) and ${summary.open_tasks} task(s) remain active. Filter the Learning and Tasks modules by due date, contact employees with overdue items and record realistic revised deadlines where authorised.`;
  if (lower.includes("leave")) return `${summary.pending_leave} leave request(s) are pending. Review the employee balance, dates, team coverage, notice period, supporting documents and comments, then route the request through the configured approval workflow.`;
  const announcements = (data.announcements ?? []).filter((row) => String(row.status) === "published").length;
  return `Current authorised data includes ${summary.employees} employee or team record(s), ${summary.open_tasks} open task(s), ${summary.pending_leave} pending leave request(s), ${summary.open_tickets} open support ticket(s), and ${announcements} published announcement(s). Confirm the relevant policy and employee scope, document the reasoning, obtain required approvals and retain an audit trail for: ${question}`;
}
