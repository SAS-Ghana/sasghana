import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { callRpc, DataRow, deleteRow, listRows } from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

export function BackupCenter({accessToken,profile}:{accessToken:string;profile:UserProfile}) {
  const [records,setRecords]=useState<DataRow[]>([]);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const load=useCallback(async()=>setRecords(await listRows(accessToken,"backup_records","*",100)),[accessToken]);
  useEffect(()=>{void load().catch(cause=>setError(cause instanceof Error?cause.message:"Backup history could not be loaded."));},[load]);

  async function download(){
    setBusy("download");setError("");setNotice("");
    try{
      const backup=await callRpc<Record<string,unknown>>(accessToken,"export_organisation_backup",{});
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=`sas-people-complete-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();
      URL.revokeObjectURL(url);setNotice("Complete organisation backup downloaded.");await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Backup could not be created.");}
    finally{setBusy("");}
  }

  async function restore(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    if(!window.confirm("Restore this backup into the live organisation? Matching records will be updated and missing records recreated."))return;
    setBusy("restore");setError("");setNotice("");
    try{
      const backup=JSON.parse(await file.text()) as Record<string,unknown>;
      const restored=await callRpc<number>(accessToken,"restore_organisation_backup",{backup});
      setNotice(`${restored} organisation records were restored successfully.`);await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Backup could not be restored.");}
    finally{setBusy("");}
  }

  async function remove(row:DataRow){
    if(!window.confirm("Delete this backup history entry? Downloaded backup files on your device are not affected."))return;
    setBusy(String(row.id));setError("");
    try{await deleteRow(accessToken,"backup_records",String(row.id));setNotice("Backup history entry deleted.");await load();}
    catch(cause){setError(cause instanceof Error?cause.message:"Backup entry could not be deleted.");}
    finally{setBusy("");}
  }

  return <section>
    <header className="page-header"><div><span className="eyebrow">Business continuity</span><h1><MenuIcon name={moduleIcon("Backup & Restore")} />One-button backup & restore</h1><p className="muted">Download every organisation record and login identity in one portable file, or restore a previous export.</p></div><div className="page-actions"><button className="secondary" disabled={Boolean(busy)} onClick={()=>fileRef.current?.click()}>{busy==="restore"?"Restoring…":"Upload & restore"}</button><button className="primary" disabled={Boolean(busy)} onClick={()=>void download()}>{busy==="download"?"Preparing backup…":"Download complete backup"}</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={restore}/></div></header>
    <aside className="backup-explainer"><strong>Protected recovery design</strong><p>The backup contains all Supabase organisation tables and login identities. Password hashes are never exportable; if an identity must be recreated, that user securely chooses a new password through Forgot password.</p></aside>
    {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-message">{notice}</p>}
    <article className="card data-panel"><div className="panel-head"><div><h2>Backup & restore history</h2><p className="muted">Auditable recovery operations for {profile.display_name}</p></div><button className="text-btn" onClick={()=>void load()}>Refresh</button></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Type</th><th>Status</th><th>Created</th><th>Completed</th><th>Restore tested</th><th>Notes</th><th>Action</th></tr></thead><tbody>{records.map(row=><tr key={String(row.id)}><td>{String(row.backup_type)}</td><td><span className={`status-pill ${row.status}`}>{String(row.status)}</span></td><td>{new Date(String(row.created_at)).toLocaleString()}</td><td>{row.completed_at?new Date(String(row.completed_at)).toLocaleString():"—"}</td><td>{row.restore_tested_at?new Date(String(row.restore_tested_at)).toLocaleString():"—"}</td><td>{String(row.notes??"—")}</td><td><button className="danger" disabled={busy===String(row.id)} onClick={()=>void remove(row)}>Delete</button></td></tr>)}{!records.length&&<tr><td colSpan={7}>No backup operations recorded yet.</td></tr>}</tbody></table></div>
    </article>
  </section>;
}
