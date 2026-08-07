import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { callRpc, DataRow, deleteRow, listRows } from "./lib/supabase-data";

const backupSelect = "id,backup_type,status,requested_by,completed_at,restore_tested_at,notes,created_at,record_count,checksum,approved_at,operation_type,file_name";
const deletedSelect = "id,table_name,original_id,record_label,deleted_by,deleted_at,status,restored_at";

export function BackupCenter({ accessToken, profile, embedded = false }: {
  accessToken: string;
  profile: UserProfile;
  embedded?: boolean;
}) {
  const [records, setRecords] = useState<DataRow[]>([]);
  const [deleted, setDeleted] = useState<DataRow[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    const [backupRows, deletedRows] = await Promise.all([
      listRows(accessToken, "backup_records", backupSelect, 100),
      listRows(accessToken, "deleted_records", deletedSelect, 250, "deleted_at"),
    ]);
    setRecords(backupRows);
    setDeleted(deletedRows);
  }, [accessToken]);

  useEffect(() => {
    void Promise.resolve().then(load).catch((cause) => setError(cause instanceof Error ? cause.message : "Recovery information could not be loaded."));
  }, [load]);

  async function createRecoveryPoint() {
    const notes = window.prompt("Optional note for this recovery point:", "Before administrative changes");
    if (notes === null) return;
    setBusy("create"); setError(""); setNotice("");
    try {
      await callRpc<string>(accessToken, "create_organisation_recovery_point", { p_notes: notes.trim() || null });
      setNotice("Secure recovery point created and integrity checked.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery point could not be created.");
    } finally { setBusy(""); }
  }

  async function download() {
    setBusy("download"); setError(""); setNotice("");
    try {
      const backup = await callRpc<Record<string, unknown>>(accessToken, "export_organisation_backup", {});
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sas-people-complete-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Complete organisation backup downloaded.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backup could not be created.");
    } finally { setBusy(""); }
  }

  async function restoreUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !window.confirm("Restore this backup into the live organisation? Matching records will be updated and missing records recreated.")) return;
    setBusy("upload"); setError(""); setNotice("");
    try {
      const backup = JSON.parse(await file.text()) as Record<string, unknown>;
      const restored = await callRpc<number>(accessToken, "restore_organisation_backup", { backup });
      setNotice(`${restored} organisation records were inserted or updated.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backup could not be restored.");
    } finally { setBusy(""); }
  }

  async function restorePoint(row: DataRow) {
    if (!window.confirm("Restore this approved recovery point into the live organisation?")) return;
    const id = String(row.id);
    setBusy(id); setError(""); setNotice("");
    try {
      const restored = await callRpc<number>(accessToken, "restore_organisation_recovery_point", { p_record_id: id });
      setNotice(`${restored} records were recovered from the selected recovery point.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery point could not be restored.");
    } finally { setBusy(""); }
  }

  async function restoreDeleted(row: DataRow) {
    if (!window.confirm(`Restore ${String(row.record_label ?? row.original_id)} to ${String(row.table_name)}?`)) return;
    const id = String(row.id);
    setBusy(id); setError(""); setNotice("");
    try {
      const table = await callRpc<string>(accessToken, "restore_deleted_record", { p_deleted_id: id });
      setNotice(`Deleted ${table} record restored successfully.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Deleted record could not be restored.");
    } finally { setBusy(""); }
  }

  async function purgeDeleted(row: DataRow) {
    if (!window.confirm("Permanently remove this recovery copy? The deletion timestamp and full details remain in the administrator audit log.")) return;
    const id = String(row.id);
    setBusy(id); setError(""); setNotice("");
    try {
      await callRpc<string>(accessToken, "purge_deleted_record", { p_deleted_id: id });
      setNotice("Recovery copy permanently removed; its audit evidence was retained.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery copy could not be removed.");
    } finally { setBusy(""); }
  }

  async function removeHistory(row: DataRow) {
    if (!window.confirm("Remove this backup-history entry? The action will still be retained in the audit and recovery logs.")) return;
    const id = String(row.id);
    setBusy(id); setError("");
    try {
      await deleteRow(accessToken, "backup_records", id);
      setNotice("Backup history entry moved to the recovery bin.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backup history entry could not be removed.");
    } finally { setBusy(""); }
  }

  return <section className={embedded ? "backup-center embedded" : "backup-center"}>
    <div className="panel-head backup-center-heading">
      <div><h2>Backup &amp; restore</h2><p className="muted">Secure recovery points, portable backups and deletion review for {profile.display_name}.</p></div>
      <div className="row-actions">
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>{busy === "upload" ? "Restoring…" : "Upload backup"}</button>
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void download()}>{busy === "download" ? "Preparing…" : "Download backup"}</button>
        <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void createRecoveryPoint()}>{busy === "create" ? "Creating…" : "Create recovery point"}</button>
        <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={restoreUpload} />
      </div>
    </div>
    <aside className="backup-explainer"><strong>Protected recovery design</strong><p>Recovery snapshots are organisation-scoped, checksum verified and visible only to authorised administrators. Password hashes are never exported.</p></aside>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <div className="summary-strip recovery-summary">
      <div><strong>{records.filter((row) => row.backup_type === "recovery_point").length}</strong><span>Recovery points</span></div>
      <div><strong>{deleted.filter((row) => row.status === "pending").length}</strong><span>Deletion reviews</span></div>
      <div><strong>{deleted.filter((row) => row.status === "restored").length}</strong><span>Restored records</span></div>
    </div>

    <div className="recovery-section">
      <div className="panel-head"><div><h3>Approved recovery points</h3><p className="muted">Restore an in-database snapshot or review downloadable backup history.</p></div><button type="button" className="text-btn" onClick={() => void load()}>Refresh</button></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Type</th><th>Status</th><th>Created</th><th>Records</th><th>Integrity</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
        {records.map((row) => <tr key={String(row.id)}><td>{String(row.backup_type).replaceAll("_", " ")}</td><td><span className={`status-pill ${row.status}`}>{String(row.status)}</span></td><td>{new Date(String(row.created_at)).toLocaleString()}</td><td>{String(row.record_count ?? "—")}</td><td>{row.checksum ? "Verified" : "Portable file"}</td><td>{String(row.notes ?? "—")}</td><td><div className="row-actions">{row.backup_type === "recovery_point" && <button type="button" disabled={busy === String(row.id)} onClick={() => void restorePoint(row)}>Restore</button>}<button type="button" className="danger" disabled={busy === String(row.id)} onClick={() => void removeHistory(row)}>Remove</button></div></td></tr>)}
        {!records.length && <tr><td colSpan={7}>No backup operations recorded yet.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="recovery-section">
      <div className="panel-head"><div><h3>Deletion review &amp; recovery bin</h3><p className="muted">Every captured deletion includes the original record, actor and timestamp. Restoring or purging is audited.</p></div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Record</th><th>Module</th><th>Deleted</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {deleted.map((row) => <tr key={String(row.id)}><td><strong>{String(row.record_label ?? row.original_id)}</strong><small className="table-subline">{String(row.original_id)}</small></td><td>{String(row.table_name).replaceAll("_", " ")}</td><td>{new Date(String(row.deleted_at)).toLocaleString()}</td><td><span className={`status-pill ${row.status}`}>{String(row.status)}</span></td><td><div className="row-actions">{row.status === "pending" && <button type="button" disabled={busy === String(row.id)} onClick={() => void restoreDeleted(row)}>Restore</button>}<button type="button" className="danger" disabled={busy === String(row.id)} onClick={() => void purgeDeleted(row)}>Delete permanently</button></div></td></tr>)}
        {!deleted.length && <tr><td colSpan={5}>No captured deletions require review.</td></tr>}
      </tbody></table></div>
    </div>
  </section>;
}
