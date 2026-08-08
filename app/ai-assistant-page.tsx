import { FormEvent, useCallback, useEffect, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { fetchProfile, getValidAccessToken, readSession } from "./lib/supabase-auth";
import { createRow, DataRow, listRowsWhere, readRpc } from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type AssistantRole = "admin" | "manager" | "hr";
type AssistantSummary = Record<string, number | string>;

const promptSets: Record<AssistantRole, string[]> = {
  admin: ["Give me an executive risk briefing", "Which approvals need attention?", "Show security and compliance priorities", "Summarise payroll readiness", "Create a handover checklist"],
  manager: ["Summarise my team priorities", "Which approvals need attention?", "Draft a one to one agenda", "Show overdue tasks and training", "Suggest a fair performance review structure"],
  hr: ["Summarise workforce risks", "Which HR approvals need attention?", "Draft an HR letter", "Create an onboarding checklist", "Show payroll and document readiness"],
};

type Props = {
  role: AssistantRole;
  accessToken?: string;
  profile?: UserProfile;
  onNavigate?: (label: string) => void;
};

export function AiAssistantPage({ role, accessToken: providedToken, profile: providedProfile, onNavigate }: Props) {
  const [accessToken, setAccessToken] = useState(providedToken ?? "");
  const [profile, setProfile] = useState<UserProfile | null>(providedProfile ?? null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [summary, setSummary] = useState<AssistantSummary>({});
  const [history, setHistory] = useState<DataRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (providedToken && providedProfile) {
      setAccessToken(providedToken);
      setProfile(providedProfile);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const session = readSession();
        if (!session) throw new Error("Sign in again to use the assistant.");
        const token = await getValidAccessToken(session.access_token);
        const currentProfile = await fetchProfile(token, session.user.id);
        if (!currentProfile) throw new Error("Your profile could not be loaded.");
        if (!cancelled) {
          setAccessToken(token);
          setProfile(currentProfile);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "The signed-in account could not be resolved.");
      }
    })();
    return () => { cancelled = true; };
  }, [providedToken, providedProfile]);

  const load = useCallback(async () => {
    if (!accessToken || !profile) return;
    setError("");
    try {
      const [context, activity] = await Promise.all([
        readRpc<AssistantSummary>(accessToken, "get_ai_assistant_context", {}),
        listRowsWhere(accessToken, "ai_assistant_logs", { profile_id: profile.id }, "*", 20),
      ]);
      setSummary(context);
      setHistory(activity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assistant workspace could not be loaded.");
    }
  }, [accessToken, profile]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("sas-data-changed", refresh);
    return () => window.removeEventListener("sas-data-changed", refresh);
  }, [load]);

  const metrics = Object.fromEntries(
    Object.entries(summary).filter(([, value]) => typeof value === "number"),
  ) as Record<string, number>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = question.trim();
    if (!clean || !accessToken || !profile) return;
    setBusy(true);
    setError("");
    try {
      const response = buildAnswer(clean, role, metrics);
      setAnswer(response);
      await createRow(accessToken, "ai_assistant_logs", {
        organisation_id: profile.organisation_id,
        profile_id: profile.id,
        assistant_role: role === "admin" ? "administrator" : role,
        question: clean,
        response,
        data_summary: JSON.stringify(metrics),
      });
      setHistory((current) => [{ question: clean, response, created_at: new Date().toISOString() }, ...current].slice(0, 20));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assistant could not prepare a response.");
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = role === "admin" ? "Admin" : role === "manager" ? "Manager" : "HR";

  return <section className="dashboard-workspace">
    <header className="page-header">
      <div>
        <span className="eyebrow">Secure live decision support</span>
        <h1><MenuIcon name={moduleIcon("AI HR Assistant")} />AI {roleLabel} Assistant</h1>
        <p className="muted">Uses aggregate records already authorised for this account. It cannot silently change data or bypass approvals.</p>
      </div>
      <button type="button" className="secondary" disabled={!accessToken || busy} onClick={() => void load()}>Refresh live data</button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dashboard-metric-grid">
      {Object.entries(metrics).slice(0, 8).map(([label, value]) =>
        <article className="card metric dashboard-metric-card" key={label}>
          <span>{label.replaceAll("_", " ")}</span><strong>{value}</strong><small>Live authorised records</small>
        </article>,
      )}
    </div>
    <div className="dashboard-content-grid">
      <article className="card panel assistant-panel">
        <h2>Ask the assistant</h2>
        <form className="assistant-prompt-form" onSubmit={submit}>
          <textarea maxLength={2000} aria-label="Assistant question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask for a summary, risk check, approval plan, letter structure or handover checklist…" />
          <button className="primary" disabled={busy || !accessToken || !question.trim()}>{busy ? "Analysing…" : "Generate guidance"}</button>
        </form>
        <div className="quick dashboard-quick-grid">
          {promptSets[role].map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}><span>AI</span>{prompt}</button>)}
        </div>
      </article>
      <article className="card panel">
        <h2>Response</h2>
        {answer ? <div className="ai-response">
          <div className="ai-response-copy">{answer.split("\n").map((line, index) => line ? <p key={`${line}-${index}`}>{line}</p> : <br key={index} />)}</div>
          {onNavigate && <div className="row-actions"><button type="button" className="secondary" onClick={() => onNavigate(suggestedModule(question, role))}>Open relevant module</button></div>}
          <small className="muted">Review facts, permissions and company policy before using this output.</small>
        </div> : <div className="empty-state"><h3>Ready to assist</h3><p>Select a prompt or enter your own request. Only aggregate, role-authorised live data is used.</p></div>}
      </article>
      <article className="card panel dashboard-wide-panel">
        <h2>Recent assistant activity</h2>
        {history.length ? <div className="activity">{history.slice(0, 8).map((row, index) =>
          <div className="activity-row" key={String(row.id ?? index)}>
            <div className="task-icon">AI</div>
            <p><strong>{String(row.question)}</strong><br /><small>{String(row.response).slice(0, 180)}</small></p>
            <time>{row.created_at ? new Date(String(row.created_at)).toLocaleString("en-GB") : ""}</time>
          </div>,
        )}</div> : <p className="muted">No assistant history yet.</p>}
      </article>
    </div>
  </section>;
}

function buildAnswer(question: string, role: AssistantRole, summary: Record<string, number>) {
  const lower = question.toLowerCase();
  const n = (key: string) => summary[key] ?? 0;
  const scope = role === "manager" ? "your authorised team" : role === "admin" ? "the organisation" : "the authorised workforce";
  if (lower.includes("priority") || lower.includes("summarise") || lower.includes("risk") || lower.includes("briefing")) return `Executive summary
Across ${scope}: ${n("pending_leave")} pending leave request(s), ${n("expense_actions")} expense action(s), ${n("open_tasks")} open task(s), ${n("training_due")} active training item(s), ${n("reviews_due")} review(s), ${n("open_tickets")} support ticket(s), ${n("asset_requests")} asset request(s), and ${n("expiring_documents")} document(s) expiring within 30 days.

Recommended action
Start with critical or overdue records, confirm the accountable owner, record a due date, and preserve the decision trail. Escalate unresolved payroll, access-control, safety or employee-relations risks to an authorised reviewer.`;
  if (lower.includes("approval")) return `Approval workload
${n("pending_leave")} leave request(s), ${n("expense_actions")} expense claim(s), and ${n("asset_requests")} asset request(s) need attention.

Review checklist
Confirm balances, policy requirements, supporting evidence, team coverage, budget and reviewer comments before recording a decision. Never approve your own request or skip the configured sequence.`;
  if (lower.includes("onboarding")) return `Onboarding plan
${n("onboarding_active")} journey(s) are active. Verify employee and salary details, issue authorised documents, collect statutory and bank information, assign manager and department, prepare equipment, schedule orientation, assign mandatory training, and record probation milestones.`;
  if (lower.includes("one to one")) return `One-to-one agenda
Use the ${n("open_tasks")} open task(s) and ${n("training_due")} active training item(s) as context: wellbeing, progress, blockers, priorities, attendance or workload concerns, two-way feedback, development goals, then actions with owners and due dates.`;
  if (lower.includes("letter")) return "Document guidance\nUse Document Studio and select the employee so authorised merge fields fill live data. Verify the terms, recipient, effective date and signatory before issuing. Do not include salary or identity data unless the document purpose and recipient are authorised.";
  if (lower.includes("payroll") || lower.includes("salary") || lower.includes("tax")) return `Payroll readiness
${n("payroll_drafts")} payroll record(s) are not yet published. Confirm salary frequency, approved allowances and deductions, Ghana PAYE and SSNIT calculations, payment period, exceptions and authorised review before publication.`;
  if (lower.includes("performance")) return `Performance review
${n("reviews_due")} review(s) need attention. Use evidence-based goals and observable behaviours, balance strengths with development areas, include employee comments, and avoid unsupported or discriminatory conclusions.`;
  if (lower.includes("training") || lower.includes("overdue")) return `Work and learning
${n("training_due")} training assignment(s) and ${n("open_tasks")} task(s) remain active. Filter by due date, contact the accountable people, document blockers and record realistic revised deadlines where authorised.`;
  if (lower.includes("leave")) return `Leave review
${n("pending_leave")} request(s) are pending. Review the employee balance, dates, team coverage, notice period, evidence and comments, then follow the configured approval workflow.`;
  if (lower.includes("security") || lower.includes("compliance")) return `Security and compliance check
Confirm role assignments follow least privilege, review active sessions and audit events, keep sensitive exports restricted, and remove dormant access promptly. Current indicators include ${n("expiring_documents")} expiring document(s) and ${n("open_tickets")} unresolved support ticket(s).

Safe next step
Open Audit Logs and Roles & Permissions. Investigate unusual access or failed-login patterns before changing accounts; retain evidence and require authorised review for destructive actions.`;
  if (lower.includes("handover")) return `Handover checklist
1. Resolve or assign ${n("pending_leave")} leave, ${n("expense_actions")} expense and ${n("asset_requests")} asset action(s).
2. Publish only verified payroll and documents.
3. Confirm attendance exceptions, overdue tasks and open cases have owners.
4. Review backups, active sessions, roles and audit logs.
5. Record outstanding risks, owners, due dates and evidence links.`;
  return `Current authorised picture
${n("employees")} employee or team record(s), ${n("open_tasks")} open task(s), ${n("pending_leave")} pending leave request(s), ${n("open_tickets")} open support ticket(s), and ${n("published_announcements")} published announcement(s).

Guidance
For “${question}”, confirm the applicable policy and employee scope, use only verified records, obtain the required approval, communicate the outcome, and retain an audit trail. This assistant will not make the change automatically.`;
}

function suggestedModule(question: string, role: AssistantRole) {
  const lower = question.toLowerCase();
  if (lower.includes("security") || lower.includes("audit")) return role === "admin" ? "Audit Logs" : "Reports & Analytics";
  if (lower.includes("payroll") || lower.includes("salary") || lower.includes("tax")) return role === "hr" ? "Payroll Administration" : "Payroll & Payslips";
  if (lower.includes("leave")) return role === "manager" ? "Leave Approvals" : "Leave Management";
  if (lower.includes("training")) return "Learning & Development";
  if (lower.includes("approval")) return role === "admin" ? "Approval Workflows" : role === "hr" ? "Workflows & Approvals" : "Leave Approvals";
  return role === "admin" ? "Administrator Dashboard" : role === "hr" ? "HR Dashboard" : "Manager Dashboard";
}
