import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { callRpc, DataRow, listRows } from "./lib/supabase-data";
import { realtimeClient } from "./lib/supabase-realtime";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type ProcurementView = "requester" | "manager" | "procurement" | "admin";
type ReviewAction = "approve" | "deny" | "question" | "respond" | "admin_approve" | "admin_deny";
type ActionState = { row: DataRow; action: ReviewAction } | null;

const statusLabels: Record<string, string> = {
  pending_manager: "Manager / accounts review",
  pending_procurement: "Procurement review",
  clarification_requested: "Clarification requested",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
};

function money(value: unknown, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(Number(value ?? 0));
}

export function ProcurementWorkspace({ accessToken, profile, view }: {
  accessToken: string;
  profile: UserProfile;
  view: ProcurementView;
}) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<ActionState>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isAdmin = profile.roles.includes("SAS System Administrator");
  const isAccountantManager = profile.roles.includes("Accountant")
    && profile.roles.some((role) => ["Manager", "Line Manager", "Department Head"].includes(role));
  const canProcurement = isAdmin || profile.permissions.some((permission) => ["procurement.approve", "procurement.manage"].includes(permission));

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listRows(accessToken, "purchase_requests", "*", 500, "created_at"));
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
    const base = view === "requester" ? rows.filter((row) => String(row.requested_by) === profile.id) : rows;
    return base.filter((row) => {
      if (status !== "all" && String(row.status) !== status) return false;
      if (!query) return true;
      return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()));
    });
  }, [rows, view, profile.id, status, query]);

  const pendingManager = rows.filter((row) => row.status === "pending_manager").length;
  const pendingProcurement = rows.filter((row) => row.status === "pending_procurement").length;
  const clarification = rows.filter((row) => row.status === "clarification_requested").length;

  const pageTitle = view === "requester" ? "Purchase Requests"
    : view === "manager" ? "Purchase Approvals"
      : view === "procurement" ? "Procurement Review"
        : "Procurement Control";

  function openReview(row: DataRow, nextAction: ReviewAction) {
    setError("");
    setNotice("");
    setAction({ row, action: nextAction });
  }

  return <section>
    <header className="page-header procurement-header">
      <div>
        <span className="eyebrow">{view === "requester" ? "Employee purchasing" : view === "admin" ? "Administrator oversight" : "Controlled purchasing workflow"}</span>
        <h1><MenuIcon name={moduleIcon("Asset Management")} />{pageTitle}</h1>
        <p className="muted">Requests move from an Accountant who is also a Manager to Procurement, with clarification and administrator override fully tracked.</p>
      </div>
      <div className="row-actions">
        {view === "requester" && <button type="button" className="primary" onClick={() => setCreating(true)}>New purchase request</button>}
        <button type="button" className="secondary" onClick={() => void load()}>Refresh</button>
      </div>
    </header>

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <div className="workflow-kpis procurement-kpis">
      <article className="card"><span>Total requests</span><strong>{rows.length}</strong></article>
      <article className="card"><span>Manager / accounts</span><strong>{pendingManager}</strong></article>
      <article className="card"><span>Procurement</span><strong>{pendingProcurement}</strong></article>
      <article className="card"><span>Needs clarification</span><strong>{clarification}</strong></article>
    </div>

    {view === "manager" && !isAdmin && !isAccountantManager && <p className="form-message">This queue requires both Accountant and Manager role assignments. Ask an administrator to update your access.</p>}
    {view === "procurement" && !canProcurement && <p className="form-message">Procurement approval permission is required for decisions.</p>}

    <article className="card data-panel procurement-panel">
      <div className="filter-toolbar procurement-filters">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests..." aria-label="Search purchase requests" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter purchase request status">
          <option value="all">All statuses</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="procurement-grid">
        {scoped.map((row) => {
          const rowStatus = String(row.status ?? "pending_manager");
          const requesterOwns = String(row.requested_by) === profile.id;
          return <article className="procurement-card" key={String(row.id)}>
            <header>
              <div><span className="eyebrow">{String(row.request_number ?? "Purchase request")}</span><h3>{String(row.title)}</h3></div>
              <span className={`status-pill ${rowStatus}`}>{statusLabels[rowStatus] ?? rowStatus.replaceAll("_", " ")}</span>
            </header>
            <p>{String(row.description ?? "No additional description.")}</p>
            <dl>
              <div><dt>Quantity</dt><dd>{String(row.quantity ?? 1)}</dd></div>
              <div><dt>Unit estimate</dt><dd>{money(row.unit_estimated_cost, String(row.currency ?? "GHS"))}</dd></div>
              <div><dt>Estimated total</dt><dd>{money(row.estimated_total, String(row.currency ?? "GHS"))}</dd></div>
              <div><dt>Priority</dt><dd>{String(row.priority ?? "normal")}</dd></div>
            </dl>
            {row.manager_comment && <div className="procurement-note"><strong>Manager / Accounts</strong><span>{String(row.manager_comment)}</span></div>}
            {row.clarification_question && <div className="procurement-note question"><strong>Procurement question</strong><span>{String(row.clarification_question)}</span>{row.clarification_response && <em>Response: {String(row.clarification_response)}</em>}</div>}
            {row.procurement_comment && <div className="procurement-note"><strong>Procurement</strong><span>{String(row.procurement_comment)}</span></div>}
            {row.admin_comment && <div className="procurement-note admin"><strong>Administrator override</strong><span>{String(row.admin_comment)}</span></div>}
            <footer>
              {rowStatus === "pending_manager" && (isAdmin || isAccountantManager) && <>
                <button type="button" onClick={() => openReview(row, "approve")}>Approve to Procurement</button>
                <button type="button" className="danger" onClick={() => openReview(row, "deny")}>Deny</button>
              </>}
              {rowStatus === "pending_procurement" && canProcurement && <>
                <button type="button" onClick={() => openReview(row, "approve")}>Approve</button>
                <button type="button" onClick={() => openReview(row, "question")}>Send question</button>
                <button type="button" className="danger" onClick={() => openReview(row, "deny")}>Deny</button>
              </>}
              {rowStatus === "clarification_requested" && requesterOwns && <button type="button" onClick={() => openReview(row, "respond")}>Respond to Procurement</button>}
              {view === "admin" && isAdmin && <>
                <button type="button" onClick={() => openReview(row, "admin_approve")}>Admin approve</button>
                <button type="button" className="danger" onClick={() => openReview(row, "admin_deny")}>Admin deny</button>
              </>}
            </footer>
          </article>;
        })}
        {!scoped.length && <div className="empty-state"><h3>No purchase requests found</h3><p>Create a request or change the filters.</p></div>}
      </div>
    </article>

    {creating && <CreatePurchaseDialog
      accessToken={accessToken}
      onClose={() => setCreating(false)}
      onSaved={async () => { setCreating(false); await load(); setNotice("Purchase request submitted to Manager / Accounts."); }}
    />}

    {action && <ReviewDialog
      state={action}
      busy={busy === String(action.row.id)}
      onClose={() => setAction(null)}
      onSubmit={async (comment) => {
        const id = String(action.row.id);
        setBusy(id); setError(""); setNotice("");
        try {
          if (action.action === "respond") {
            await callRpc(accessToken, "respond_purchase_request", { p_request_id: id, p_response: comment });
          } else if (action.action === "admin_approve" || action.action === "admin_deny") {
            await callRpc(accessToken, "admin_override_purchase_request", {
              p_request_id: id,
              p_decision: action.action === "admin_approve" ? "approved" : "denied",
              p_comment: comment,
            });
          } else {
            await callRpc(accessToken, "review_purchase_request", { p_request_id: id, p_action: action.action, p_comment: comment || null });
          }
          setAction(null);
          await load();
          setNotice("Purchase request updated. The next participant has been notified.");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Purchase request could not be updated.");
        } finally {
          setBusy("");
        }
      }}
    />}
  </section>;
}

function CreatePurchaseDialog({ accessToken, onClose, onSaved }: {
  accessToken: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await callRpc(accessToken, "submit_purchase_request", {
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_quantity: Number(quantity),
        p_unit_estimated_cost: Number(unitCost),
        p_priority: priority,
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Purchase request could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="new-purchase-title">
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
      <span className="eyebrow">New purchase request</span>
      <h2 id="new-purchase-title">Request an item</h2>
      <form className="record-form" onSubmit={submit}>
        <label>Item or request title<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Office chairs, laptop, stationery…" /></label>
        <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label>Quantity<input required type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label>Estimated unit cost (GHS)<input required type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>
        <label className="wide">Business reason / description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain what is needed and why." /></label>
        {error && <p className="form-error wide" role="alert">{error}</p>}
        <div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button></div>
      </form>
    </section>
  </div>;
}

function ReviewDialog({ state, busy, onClose, onSubmit }: {
  state: NonNullable<ActionState>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const required = ["deny", "question", "respond", "admin_approve", "admin_deny"].includes(state.action);
  const heading = state.action === "question" ? "Send a question to the requester"
    : state.action === "respond" ? "Reply to Procurement"
      : state.action.startsWith("admin_") ? "Administrator override"
        : state.action === "approve" ? "Approve purchase request"
          : "Deny purchase request";

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-review-title">
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
      <span className="eyebrow">{String(state.row.request_number ?? "Purchase request")}</span>
      <h2 id="purchase-review-title">{heading}</h2>
      <p className="muted">{String(state.row.title)}</p>
      <label>{state.action === "question" ? "Question" : state.action === "respond" ? "Response" : "Review note"}<textarea autoFocus required={required} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={required ? "Required" : "Optional note"} /></label>
      <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={busy || (required && !comment.trim())} onClick={() => void onSubmit(comment.trim())}>{busy ? "Saving…" : "Confirm"}</button></div>
    </section>
  </div>;
}
