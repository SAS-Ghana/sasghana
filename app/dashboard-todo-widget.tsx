import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listRowsWhere, updateRow } from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";

type EditorState = { row?: DataRow } | null;

function dateValue(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function displayWhen(value: unknown) {
  if (!value) return "No due date";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "No due date" : date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function DashboardTodoWidget({ accessToken, profile, assignedTasks = [] }: { accessToken: string; profile: UserProfile; assignedTasks?: DataRow[] }) {
  const [todos, setTodos] = useState<DataRow[]>([]);
  const [history, setHistory] = useState<DataRow[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);
  const [historyTodo, setHistoryTodo] = useState<DataRow | null>(null);
  const [tab, setTab] = useState<"todos" | "tasks">("todos");
  const [showCompleted, setShowCompleted] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    setError("");
    try {
      const rows = await listRowsWhere(accessToken, "dashboard_todos", { owner_profile_id: profile.id }, "*", 250, "updated_at");
      setTodos(rows);
      setAvailable(true);
    } catch (cause) {
      setTodos([]);
      setAvailable(false);
      setError(cause instanceof Error ? cause.message : "Todo records could not be loaded.");
    }
  }, [accessToken, profile.id]);

  useEffect(() => { void load(); }, [load]);

  const visibleTodos = useMemo(() => todos.filter((row) => {
    const status = String(row.status ?? "open");
    if (status === "archived") return false;
    if (!showCompleted && status === "completed") return false;
    return true;
  }), [todos, showCompleted]);

  const openTasks = useMemo(() => assignedTasks.filter((row) => !["completed", "closed", "cancelled"].includes(String(row.status))).slice(0, 8), [assignedTasks]);

  async function patch(row: DataRow, change: DataRow, message: string) {
    const id = String(row.id ?? "");
    if (!id) return;
    setBusy(id); setError(""); setNotice("");
    try {
      await updateRow(accessToken, "dashboard_todos", id, change);
      await load();
      setNotice(message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Todo could not be updated."); }
    finally { setBusy(""); }
  }

  async function openHistory(row: DataRow) {
    const id = String(row.id ?? "");
    if (!id) return;
    setHistoryTodo(row); setHistory([]); setError("");
    try { setHistory(await listRowsWhere(accessToken, "dashboard_todo_history", { todo_id: id }, "*", 100, "created_at")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Todo history could not be loaded."); }
  }

  return <article className="card enterprise-widget dashboard-todo-widget">
    <header>
      <div><h2>Todo</h2><p>Create, edit, complete and review your Todo history</p></div>
      <div className="todo-header-actions">
        <button type="button" className={tab === "todos" ? "active" : ""} onClick={() => setTab("todos")}>My Todos</button>
        <button type="button" className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>Assigned Tasks</button>
        <button type="button" className="todo-add" onClick={() => setEditor({})} disabled={!available} aria-label="Add Todo">+</button>
      </div>
    </header>
    {notice && <p className="todo-notice">{notice}</p>}
    {error && <p className="todo-error" role="alert">{error}</p>}

    {tab === "todos" ? <>
      <div className="todo-toolbar"><label><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />Show completed</label><span>{todos.filter((row) => String(row.status) === "completed").length} completed</span></div>
      <div className="todo-list">
        {visibleTodos.map((row) => {
          const status = String(row.status ?? "open");
          const completed = status === "completed";
          return <div className={`todo-row ${completed ? "completed" : ""}`} key={String(row.id)}>
            <button type="button" className="todo-check" disabled={busy === String(row.id)} onClick={() => void patch(row, { status: completed ? "open" : "completed" }, completed ? "Todo reopened." : "Todo completed.")} aria-label={completed ? "Reopen Todo" : "Complete Todo"}>{completed ? "✓" : ""}</button>
            <div className="todo-copy"><strong>{String(row.title ?? "Todo")}</strong><small>{displayWhen(row.due_at)} · {String(row.priority ?? "normal")}</small>{row.description && <p>{String(row.description)}</p>}</div>
            <div className="todo-row-actions"><button type="button" onClick={() => setEditor({ row })}>Edit</button><button type="button" onClick={() => void openHistory(row)}>History</button><button type="button" onClick={() => void patch(row, { status: "archived" }, "Todo archived.")}>Archive</button></div>
          </div>;
        })}
        {!available && <div className="empty-widget"><strong>Todo setup is pending.</strong><p>The dashboard Todo migration needs to be applied to Supabase before Todos can be created.</p></div>}
        {available && !visibleTodos.length && <div className="empty-widget"><strong>No Todos yet</strong><p>Use + to create your first Todo.</p></div>}
      </div>
    </> : <div className="todo-list assigned-task-list">
      {openTasks.map((row) => <div className="todo-row" key={String(row.id)}><span className="todo-task-icon"><MenuIcon name="task" /></span><div className="todo-copy"><strong>{String(row.title ?? "Assigned task")}</strong><small>{displayWhen(row.due_date)} · {String(row.status ?? "open")}</small>{row.description && <p>{String(row.description)}</p>}</div></div>)}
      {!openTasks.length && <p className="empty-widget">No assigned tasks are currently open.</p>}
    </div>}

    {editor && <TodoEditor accessToken={accessToken} profile={profile} row={editor.row} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await load(); setNotice(editor.row ? "Todo updated." : "Todo created."); }} />}
    {historyTodo && <TodoHistory todo={historyTodo} rows={history} onClose={() => { setHistoryTodo(null); setHistory([]); }} />}
  </article>;
}

function TodoEditor({ accessToken, profile, row, onClose, onSaved }: { accessToken: string; profile: UserProfile; row?: DataRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(String(row?.title ?? ""));
  const [description, setDescription] = useState(String(row?.description ?? ""));
  const [priority, setPriority] = useState(String(row?.priority ?? "normal"));
  const [dueAt, setDueAt] = useState(dateValue(row?.due_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const payload: DataRow = { title: title.trim(), description: description.trim() || null, priority, due_at: dueAt ? new Date(dueAt).toISOString() : null };
    try {
      if (row?.id) await updateRow(accessToken, "dashboard_todos", String(row.id), payload);
      else await createRow(accessToken, "dashboard_todos", { ...payload, organisation_id: profile.organisation_id, owner_profile_id: profile.id, created_by: profile.id, status: "open" });
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Todo could not be saved."); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal todo-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={onClose}>×</button><span className="eyebrow">{row ? "Edit Todo" : "New Todo"}</span><h2>{row ? "Update Todo" : "Add Todo"}</h2><form className="record-form" onSubmit={submit}><label className="wide">Title<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Due date & time<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label><label className="wide">Notes<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>{error && <p className="form-error wide">{error}</p>}<div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save Todo"}</button></div></form></section></div>;
}

function TodoHistory({ todo, rows, onClose }: { todo: DataRow; rows: DataRow[]; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal todo-history-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={onClose}>×</button><span className="eyebrow">Todo history</span><h2>{String(todo.title ?? "Todo")}</h2><div className="todo-history-list">{rows.map((row) => <div key={String(row.id)}><span className="todo-history-dot" /><div><strong>{String(row.action ?? "updated").replaceAll("_", " ")}</strong><small>{row.created_at ? new Date(String(row.created_at)).toLocaleString("en-GB") : ""}</small></div></div>)}{!rows.length && <p className="empty-widget">No history has been recorded yet.</p>}</div></section></div>;
}
