import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { UserProfile } from "./lib/supabase-auth";
import { callRpc, DataRow, listRows, updateRow } from "./lib/supabase-data";
import { realtimeClient } from "./lib/supabase-realtime";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

export function NotificationsPage({ accessToken, profile, onNavigate }: {
  accessToken: string;
  profile: UserProfile;
  onNavigate: (target: string) => void;
}) {
  const [items, setItems] = useState<DataRow[]>([]);
  const [selected, setSelected] = useState<DataRow | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setItems(await listRows(accessToken, "notifications", "*", 500, "created_at")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Notifications could not be loaded."); }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const client = realtimeClient(accessToken);
    const channel = client.channel(`notification-page-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${profile.id}` }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [accessToken, profile.id, load]);

  const visible = useMemo(() => items.filter((item) => {
    if (filter === "unread" && item.is_read) return false;
    if (filter === "read" && !item.is_read) return false;
    if (filter === "archived" && !item.archived_at) return false;
    if (filter !== "archived" && item.archived_at) return false;
    if (!query) return true;
    return `${item.title ?? ""} ${item.body ?? ""} ${item.category ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }), [items, query, filter]);

  async function patch(item: DataRow, changes: DataRow) {
    setBusy(String(item.id));
    try { await updateRow(accessToken, "notifications", String(item.id), changes); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Notification could not be updated."); }
    finally { setBusy(""); }
  }

  async function openNotification(item: DataRow) {
    setSelected(item);
    if (!item.is_read) await patch(item, { is_read: true, read_at: new Date().toISOString() });
  }

  const unread = items.filter((item) => !item.is_read && !item.archived_at).length;

  return <section>
    <header className="page-header">
      <div><span className="eyebrow">Action centre</span><h1><MenuIcon name={moduleIcon("Notifications")} />Notifications</h1><p className="muted">Read full messages, keep important alerts, and go directly to the page that needs your attention.</p></div>
      <div className="row-actions"><button type="button" className="secondary" onClick={() => void callRpc(accessToken, "mark_all_my_notifications_read", {}).then(load)}>Mark all read</button><button type="button" className="secondary" onClick={() => void load()}>Refresh</button></div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="summary-strip"><div><strong>{unread}</strong><span>Unread</span></div><div><strong>{items.length}</strong><span>Total</span></div></div>
    <article className="card data-panel notifications-workspace">
      <div className="filter-toolbar notifications-page-filters">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notifications..." aria-label="Search notifications" />
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter notifications"><option value="all">All active</option><option value="unread">Unread</option><option value="read">Read</option><option value="archived">Archived</option></select>
      </div>
      <div className="notifications-page-list">
        {visible.map((item) => <article className={item.is_read ? "" : "unread"} key={String(item.id)}>
          <button type="button" className="notification-page-main" onClick={() => void openNotification(item)}>
            <span className={`notification-type priority-${String(item.priority ?? "normal")}`}>{String(item.category ?? "general").slice(0, 1).toUpperCase()}</span>
            <span><strong>{String(item.title)}</strong><small>{String(item.body)}</small><time>{new Date(String(item.created_at)).toLocaleString()}</time></span>
            <span className="read-more">Read full message</span>
          </button>
          <div className="notification-actions">
            <button type="button" disabled={busy === String(item.id)} onClick={() => void patch(item, { is_read: !item.is_read, read_at: item.is_read ? null : new Date().toISOString() })}>{item.is_read ? "Mark unread" : "Mark read"}</button>
            <button type="button" disabled={busy === String(item.id)} onClick={() => void patch(item, { pinned: !item.pinned })}>{item.pinned ? "Unpin" : "Pin"}</button>
            <button type="button" disabled={busy === String(item.id)} onClick={() => void patch(item, { archived_at: item.archived_at ? null : new Date().toISOString() })}>{item.archived_at ? "Restore" : "Archive"}</button>
          </div>
        </article>)}
        {!visible.length && <div className="empty-state"><h3>No matching notifications</h3><p>New alerts and required actions will appear here.</p></div>}
      </div>
    </article>
    {selected && <NotificationDetail item={selected} onClose={() => setSelected(null)} onNavigate={(target) => { setSelected(null); onNavigate(target); }} />}
  </section>;
}

export function NotificationDetail({ item, onClose, onNavigate }: {
  item: DataRow;
  onClose: () => void;
  onNavigate: (target: string) => void;
}) {
  const target = String(item.action_url ?? "").trim();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return createPortal(<div className="modal-backdrop notification-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal notification-detail-modal" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
      <span className="eyebrow">{String(item.category ?? "Notification")}</span>
      <h2 id="notification-detail-title">{String(item.title)}</h2>
      <p className="notification-full-body">{String(item.body)}</p>
      <time>{new Date(String(item.created_at)).toLocaleString()}</time>
      <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Close</button>{target && <button type="button" className="primary" onClick={() => onNavigate(target)}>Open related page</button>}</div>
    </section>
  </div>, document.body);
}
