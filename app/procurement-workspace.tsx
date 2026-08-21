import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { callRpc, DataRow, listRows, updateRow } from "./lib/supabase-data";
import { realtimeClient } from "./lib/supabase-realtime";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type ProcurementView = "requester" | "manager" | "procurement" | "admin";
type EffectiveView = ProcurementView | "accounts";
type ReviewAction = "manager_approve" | "manager_deny" | "accounts_pay" | "accounts_return" | "accounts_deny" | "procurement_approve" | "procurement_deny" | "question" | "respond" | "admin_approve" | "admin_deny";
type ActionState = { row: DataRow; action: ReviewAction } | null;

const statusLabels: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", pending_manager: "Manager review", manager_review: "Manager review",
  accounts_review: "Accounts payment", pending_procurement: "Procurement review", procurement_review: "Procurement review",
  clarification_requested: "Clarification requested", approved: "Approved", ordered: "Ordered", received: "Received",
  completed: "Completed", rejected: "Rejected", denied: "Denied", cancelled: "Cancelled",
};

function money(value: unknown, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(Number(value ?? 0));
}

function profileName(profiles: DataRow[], id: unknown) {
  const profile = profiles.find((row) => String(row.id) === String(id ?? ""));
  return String(profile?.display_name ?? profile?.username ?? "—");
}

export function ProcurementWorkspace({ accessToken, profile, view }: { accessToken: string; profile: UserProfile; view: ProcurementView }) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [profiles, setProfiles] = useState<DataRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<ActionState>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isAdmin = profile.roles.includes("SAS System Administrator");
  const isAccountant = profile.roles.some((role) => /accountant|finance officer|payroll officer/i.test(role)) || profile.permissions.some((permission) => permission.startsWith("accounts."));
  const canProcurement = isAdmin || profile.roles.includes("Procurement Officer") || profile.permissions.some((permission) => ["procurement.approve", "procurement.manage"].includes(permission));
  const effectiveView: EffectiveView = view === "manager" && isAccountant ? "accounts" : view;

  const load = useCallback(async () => {
    setError("");
    try {
      const [requests, people] = await Promise.all([
        listRows(accessToken, "purchase_requests", "*", 500, "created_at"),
        listRows(accessToken, "profiles", "*", 500, "display_name").catch(() => []),
      ]);
      setRows(requests); setProfiles(people);
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "Purchase requests could not be loaded.");
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const client = realtimeClient(accessToken);
    const channel = client.channel(`purchase-requests-${profile.organisation_id}-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests", filter: `organisation_id=eq.${profile.organisation_id}` }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [accessToken, profile.id, profile.organisation_id, load]);

  const scoped = useMemo(() => {
    let base = effectiveView === "requester" ? rows.filter((row) => String(row.requested_by) === profile.id) : rows;
    if (effectiveView === "manager") base = base.filter((row) => ["pending_manager", "manager_review", "clarification_requested", "accounts_review", "pending_procurement", "approved", "denied"].includes(String(row.status)));
    if (effectiveView === "accounts") base = base.filter((row) => ["accounts_review", "pending_procurement", "approved", "denied"].includes(String(row.status)));
    if (effectiveView === "procurement") base = base.filter((row) => ["pending_procurement", "procurement_review", "clarification_requested", "approved", "ordered", "received", "completed", "denied"].includes(String(row.status)));
    return base.filter((row) => {
      if (status !== "all" && String(row.status) !== status) return false;
      if (!query) return true;
      return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()));
    });
  }, [rows, effectiveView, profile.id, status, query]);

  const pendingManager = rows.filter((row) => ["pending_manager", "manager_review"].includes(String(row.status))).length;
  const pendingAccounts = rows.filter((row) => String(row.status) === "accounts_review").length;
  const pendingProcurement = rows.filter((row) => ["pending_procurement", "procurement_review"].includes(String(row.status))).length;
  const clarification = rows.filter((row) => row.status === "clarification_requested").length;

  const pageTitle = effectiveView === "requester" ? "Purchase Requests" : effectiveView === "manager" ? "Purchase Approvals" : effectiveView === "accounts" ? "Accounts Purchase Payments" : effectiveView === "procurement" ? "Procurement Review" : "Procurement Control";
  const subtitle = effectiveView === "accounts"
    ? "Review manager-approved requests, confirm the approving officer, record payment and release funded requests to Procurement."
    : "Controlled workflow: Employee → Manager → Accounts → Procurement, with clarification, payment and administrator override tracked.";

  function openReview(row: DataRow, nextAction: ReviewAction) { setError(""); setNotice(""); setAction({ row, action: nextAction }); }

  async function completeAction(comment: string, paymentReference: string) {
    if (!action) return;
    const id = String(action.row.id); setBusy(id); setError(""); setNotice("");
    try {
      if (action.action === "respond") {
        await callRpc(accessToken, "respond_purchase_request", { p_request_id: id, p_response: comment });
      } else if (action.action === "admin_approve" || action.action === "admin_deny") {
        await callRpc(accessToken, "admin_override_purchase_request", { p_request_id: id, p_decision: action.action === "admin_approve" ? "approved" : "denied", p_comment: comment });
      } else if (action.action === "manager_approve") {
        await callRpc(accessToken, "review_purchase_request", { p_request_id: id, p_action: "approve", p_comment: comment || null });
        // Compatibility fallback for databases where the Accounts-routing migration has not yet run.
        try { await updateRow(accessToken, "purchase_requests", id, { status: "accounts_review", current_stage: "accounts", manager_comment: comment || null, manager_reviewed_by: profile.id, manager_reviewed_at: new Date().toISOString() }); } catch { /* DB trigger handles this on migrated environments. */ }
      } else if (action.action === "manager_deny") {
        await callRpc(accessToken, "review_purchase_request", { p_request_id: id, p_action: "deny", p_comment: comment || null });
      } else if (["accounts_pay", "accounts_return", "accounts_deny"].includes(action.action)) {
        const rpcAction = action.action === "accounts_pay" ? "pay_and_send" : action.action === "accounts_return" ? "return" : "reject";
        try {
          await callRpc(accessToken, "process_purchase_request_accounts", { p_request_id: id, p_action: rpcAction, p_comment: comment || null, p_payment_reference: paymentReference || null });
        } catch {
          // Backward-compatible fallback: preserve the reference in the existing accounts_comment field.
          const nextStatus = action.action === "accounts_pay" ? "pending_procurement" : action.action === "accounts_return" ? "pending_manager" : "denied";
          await updateRow(accessToken, "purchase_requests", id, { status: nextStatus, current_stage: action.action === "accounts_pay" ? "procurement" : action.action === "accounts_return" ? "manager" : "closed", accounts_comment: [comment, paymentReference ? `Payment reference: ${paymentReference}` : ""].filter(Boolean).join(" · ") });
        }
      } else if (action.action === "question") {
        await callRpc(accessToken, "review_purchase_request", { p_request_id: id, p_action: "question", p_comment: comment });
      } else if (action.action === "procurement_approve" || action.action === "procurement_deny") {
        await callRpc(accessToken, "review_purchase_request", { p_request_id: id, p_action: action.action === "procurement_approve" ? "approve" : "deny", p_comment: comment || null });
      }
      setAction(null); await load();
      setNotice(action.action === "accounts_pay" ? "Payment recorded. The funded request has been sent to Procurement." : "Purchase request updated and the next participant has been notified.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Purchase request could not be updated."); }
    finally { setBusy(""); }
  }

  return <section>
    <header className="page-header procurement-header"><div><span className="eyebrow">{effectiveView === "accounts" ? "Finance & Accounts" : effectiveView === "requester" ? "Employee purchasing" : effectiveView === "admin" ? "Administrator oversight" : "Controlled purchasing workflow"}</span><h1><MenuIcon name={moduleIcon("Asset Management")} />{pageTitle}</h1><p className="muted">{subtitle}</p></div><div className="row-actions">{effectiveView === "requester" && <button type="button" className="primary" onClick={() => setCreating(true)}>New purchase request</button>}<button type="button" className="secondary" onClick={() => void load()}>Refresh</button></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}
    <div className="workflow-kpis procurement-kpis"><article className="card"><span>Total requests</span><strong>{rows.length}</strong></article><article className="card"><span>Manager review</span><strong>{pendingManager}</strong></article><article className="card"><span>Accounts payment</span><strong>{pendingAccounts}</strong></article><article className="card"><span>Procurement</span><strong>{pendingProcurement}</strong></article><article className="card"><span>Clarification</span><strong>{clarification}</strong></article></div>
    {effectiveView === "procurement" && !canProcurement && <p className="form-message">Procurement approval permission is required for decisions.</p>}
    <article className="card data-panel procurement-panel"><div className="filter-toolbar procurement-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests..." aria-label="Search purchase requests" /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter purchase request status"><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="procurement-grid">{scoped.map((row) => { const rowStatus=String(row.status ?? "pending_manager"); const requesterOwns=String(row.requested_by)===profile.id; const managerName=profileName(profiles,row.manager_reviewed_by); const accountsName=profileName(profiles,row.accounts_reviewed_by ?? row.payment_paid_by); return <article className="procurement-card" key={String(row.id)}><header><div><span className="eyebrow">{String(row.request_number ?? "Purchase request")}</span><h3>{String(row.title)}</h3></div><span className={`status-pill ${rowStatus}`}>{statusLabels[rowStatus] ?? rowStatus.replaceAll("_", " ")}</span></header><p>{String(row.description ?? "No additional description.")}</p><dl><div><dt>Requested by</dt><dd>{profileName(profiles,row.requested_by)}</dd></div><div><dt>Quantity</dt><dd>{String(row.quantity ?? 1)}</dd></div><div><dt>Unit estimate</dt><dd>{money(row.unit_estimated_cost,String(row.currency ?? "GHS"))}</dd></div><div><dt>Estimated total</dt><dd>{money(row.estimated_total,String(row.currency ?? "GHS"))}</dd></div><div><dt>Priority</dt><dd>{String(row.priority ?? "normal")}</dd></div><div><dt>Current stage</dt><dd>{String(row.current_stage ?? rowStatus).replaceAll("_", " ")}</dd></div></dl>
        {row.manager_reviewed_by && <div className="procurement-note"><strong>Manager approval</strong><span>{managerName}{row.manager_reviewed_at ? ` · ${new Date(String(row.manager_reviewed_at)).toLocaleString()}` : ""}</span>{row.manager_comment && <em>{String(row.manager_comment)}</em>}</div>}
        {row.accounts_comment && <div className="procurement-note"><strong>Accounts</strong><span>{accountsName !== "—" ? accountsName : "Accounts review"}{row.payment_status ? ` · ${String(row.payment_status)}` : ""}</span><em>{String(row.accounts_comment)}</em>{row.payment_reference && <em>Payment reference: {String(row.payment_reference)}</em>}</div>}
        {row.clarification_question && <div className="procurement-note question"><strong>Procurement question</strong><span>{String(row.clarification_question)}</span>{row.clarification_response && <em>Response: {String(row.clarification_response)}</em>}</div>}
        {row.procurement_comment && <div className="procurement-note"><strong>Procurement</strong><span>{String(row.procurement_comment)}</span></div>}{row.admin_comment && <div className="procurement-note admin"><strong>Administrator override</strong><span>{String(row.admin_comment)}</span></div>}
        <footer>{rowStatus === "pending_manager" && effectiveView === "manager" && <><button type="button" onClick={() => openReview(row,"manager_approve")}>Approve to Accounts</button><button type="button" className="danger" onClick={() => openReview(row,"manager_deny")}>Deny</button></>}{rowStatus === "accounts_review" && effectiveView === "accounts" && <><button type="button" onClick={() => openReview(row,"accounts_pay")}>Pay & Send to Procurement</button><button type="button" onClick={() => openReview(row,"accounts_return")}>Return to Manager</button><button type="button" className="danger" onClick={() => openReview(row,"accounts_deny")}>Reject</button></>}{rowStatus === "pending_procurement" && effectiveView === "procurement" && canProcurement && <><button type="button" onClick={() => openReview(row,"procurement_approve")}>Approve / Proceed</button><button type="button" onClick={() => openReview(row,"question")}>Send question</button><button type="button" className="danger" onClick={() => openReview(row,"procurement_deny")}>Deny</button></>}{rowStatus === "clarification_requested" && requesterOwns && <button type="button" onClick={() => openReview(row,"respond")}>Respond to Procurement</button>}{effectiveView === "admin" && isAdmin && <><button type="button" onClick={() => openReview(row,"admin_approve")}>Admin approve</button><button type="button" className="danger" onClick={() => openReview(row,"admin_deny")}>Admin deny</button></>}</footer></article>; })}{!scoped.length && <div className="empty-state"><h3>No purchase requests found</h3><p>Create a request or change the filters.</p></div>}</div>
    </article>
    {creating && <CreatePurchaseDialog accessToken={accessToken} onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await load(); setNotice("Purchase request submitted to your Manager for approval."); }} />}
    {action && <ReviewDialog state={action} busy={busy === String(action.row.id)} onClose={() => setAction(null)} onSubmit={completeAction} />}
  </section>;
}

function CreatePurchaseDialog({ accessToken,onClose,onSaved }: { accessToken:string; onClose:()=>void; onSaved:()=>Promise<void> }) {
  const [title,setTitle]=useState(""); const [description,setDescription]=useState(""); const [quantity,setQuantity]=useState("1"); const [unitCost,setUnitCost]=useState("0"); const [priority,setPriority]=useState("normal"); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{await callRpc(accessToken,"submit_purchase_request",{p_title:title.trim(),p_description:description.trim()||null,p_quantity:Number(quantity),p_unit_estimated_cost:Number(unitCost),p_priority:priority});await onSaved();}catch(cause){setError(cause instanceof Error?cause.message:"Purchase request could not be submitted.");}finally{setBusy(false);}}
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="modal record-modal" role="dialog" aria-modal="true"><button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button><span className="eyebrow">New purchase request</span><h2>Request an item</h2><form className="record-form" onSubmit={submit}><label>Item or request title<input required value={title} onChange={(event)=>setTitle(event.target.value)} /></label><label>Priority<select value={priority} onChange={(event)=>setPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Quantity<input required type="number" min="1" value={quantity} onChange={(event)=>setQuantity(event.target.value)} /></label><label>Estimated unit cost (GHS)<input required type="number" min="0" step="0.01" value={unitCost} onChange={(event)=>setUnitCost(event.target.value)} /></label><label className="wide">Business reason / description<textarea value={description} onChange={(event)=>setDescription(event.target.value)} /></label>{error&&<p className="form-error wide">{error}</p>}<div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy?"Submitting…":"Submit request"}</button></div></form></section></div>;
}

function ReviewDialog({ state,busy,onClose,onSubmit }: { state:NonNullable<ActionState>; busy:boolean; onClose:()=>void; onSubmit:(comment:string,paymentReference:string)=>Promise<void> }) {
  const [comment,setComment]=useState(""); const [paymentReference,setPaymentReference]=useState(""); const isPayment=state.action==="accounts_pay"; const required=["manager_deny","accounts_return","accounts_deny","procurement_deny","question","respond","admin_approve","admin_deny"].includes(state.action);
  const heading=isPayment?"Record payment and release to Procurement":state.action==="manager_approve"?"Approve request to Accounts":state.action==="manager_deny"?"Deny purchase request":state.action==="accounts_return"?"Return request to Manager":state.action==="accounts_deny"?"Reject payment request":state.action==="question"?"Send a question to the requester":state.action==="respond"?"Reply to Procurement":state.action.startsWith("admin_")?"Administrator override":state.action==="procurement_approve"?"Approve procurement action":"Review purchase request";
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="modal record-modal" role="dialog" aria-modal="true"><button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button><span className="eyebrow">{String(state.row.request_number ?? "Purchase request")}</span><h2>{heading}</h2><p className="muted">{String(state.row.title)} · {money(state.row.estimated_total,String(state.row.currency ?? "GHS"))}</p>{isPayment&&<label>Payment reference / voucher / transfer ID<input autoFocus required value={paymentReference} onChange={(event)=>setPaymentReference(event.target.value)} placeholder="e.g. GCB-TRX-00124" /></label>}<label>{state.action==="question"?"Question":state.action==="respond"?"Response":"Review note"}<textarea autoFocus={!isPayment} required={required} value={comment} onChange={(event)=>setComment(event.target.value)} /></label><div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={busy || (required&&!comment.trim()) || (isPayment&&!paymentReference.trim())} onClick={()=>void onSubmit(comment.trim(),paymentReference.trim())}>{busy?"Saving…":isPayment?"Confirm Payment & Send":"Confirm"}</button></div></section></div>;
}
