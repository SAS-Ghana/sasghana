import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { callFunction, DataRow, listNamedRows, listRows, updateRow } from "./lib/supabase-data";

type Option = { id: string; label: string };

export function AccountManagementPage({ accessToken }: { accessToken: string }) {
  const [accounts,setAccounts] = useState<DataRow[]>([]);
  const [roles,setRoles] = useState<Option[]>([]);
  const [permissions,setPermissions] = useState<Option[]>([]);
  const [employees,setEmployees] = useState<Option[]>([]);
  const [open,setOpen] = useState(false);
  const [editing,setEditing]=useState<DataRow|null>(null);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [profileRows,roleRows,permissionRows,employeeRows] = await Promise.all([
        listRows(accessToken,"profiles","id,username,email,display_name,status,account_type,job_title,employee_id,dashboard_access,invitation_status,last_login_at,created_at"),
        listNamedRows(accessToken,"roles","id,name"),
        listNamedRows(accessToken,"permissions","id,key,description","key"),
        listNamedRows(accessToken,"employees","id,first_name,last_name,employee_number","first_name"),
      ]);
      setAccounts(profileRows); setRoles(roleRows.map(r=>({id:String(r.id),label:String(r.name)})));
      setPermissions(permissionRows.map(r=>({id:String(r.id),label:String(r.key)})));
      setEmployees(employeeRows.map(r=>({id:String(r.id),label:`${r.first_name} ${r.last_name} (${r.employee_number})`})));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Accounts could not be loaded."); }
  },[accessToken]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);

  async function setStatus(row:DataRow,status:string) {
    setError(""); setNotice("");
    try {
      await callFunction(accessToken,"manage-user",{action:"status",user_id:row.id,status});
      setNotice(`${row.display_name} is now ${status.replaceAll("_"," ")}.`); await load();
    } catch(cause){setError(cause instanceof Error?cause.message:"Account update failed.");}
  }

  async function deleteAccount(row:DataRow){
    if(!window.confirm(`Permanently delete the login for ${row.display_name}? The linked employee record will be retained.`))return;
    setError("");setNotice("");
    try{await callFunction(accessToken,"manage-user",{action:"delete",user_id:row.id});setNotice(`${row.display_name}'s login account was deleted.`);await load();}
    catch(cause){setError(cause instanceof Error?cause.message:"Account deletion failed.");}
  }

  return <section>
    <header className="page-header"><div><span className="eyebrow">Administration</span><h1>User accounts</h1><p className="muted">Create private logins and assign exactly what each person can access.</p></div><button className="primary" onClick={()=>setOpen(true)}>Create account</button></header>
    <div className="summary-strip"><div><strong>{accounts.length}</strong><span>Total accounts</span></div><div><strong>{accounts.filter(x=>x.status==="active").length}</strong><span>Active</span></div><div><strong>{accounts.filter(x=>x.status!=="active").length}</strong><span>Restricted / invited</span></div></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-message">{notice}</p>}
    <article className="card data-panel"><div className="panel-head"><div><h2>Account directory</h2><p className="muted">Authentication and access are stored in Supabase</p></div><button className="text-btn" onClick={()=>void load()}>Refresh</button></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Person</th><th>Username</th><th>Account type</th><th>Job title</th><th>Status</th><th>Invitation</th><th>Actions</th></tr></thead>
          <tbody>{accounts.map(row=><tr key={String(row.id)}><td>{String(row.display_name)}</td><td>{String(row.username??"—")}<small className="table-subline">{String(row.email??"")}</small></td><td>{String(row.account_type??"employee")}</td><td>{String(row.job_title??"—")}</td><td><span className={`status-pill ${row.status}`}>{String(row.status).replaceAll("_"," ")}</span></td><td>{String(row.invitation_status??"—")}</td><td><div className="row-actions"><button onClick={()=>setEditing(row)}>Edit</button>{row.status!=="active"&&<button onClick={()=>void setStatus(row,"active")}>Activate</button>}{row.status==="active"&&<button onClick={()=>void setStatus(row,"suspended")}>Suspend</button>}{row.status==="locked"&&<button onClick={()=>void setStatus(row,"active")}>Unlock</button>}<button className="danger" onClick={()=>void setStatus(row,"disabled")}>Disable</button><button className="danger" onClick={()=>void deleteAccount(row)}>Delete account</button></div></td></tr>)}</tbody></table></div>
    </article>
    {open&&<CreateAccountDialog accessToken={accessToken} roles={roles} permissions={permissions} employees={employees} onClose={()=>setOpen(false)} onCreated={async()=>{setOpen(false);setNotice("Account created securely.");await load();}}/>}
    {editing&&<EditAccountDialog accessToken={accessToken} row={editing} onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);setNotice("Account details and login identity updated.");await load();}}/>}
  </section>;
}

function EditAccountDialog({accessToken,row,onClose,onSaved}:{accessToken:string;row:DataRow;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [values,setValues]=useState({display_name:String(row.display_name??""),username:String(row.username??""),email:String(row.email??""),job_title:String(row.job_title??""),account_type:String(row.account_type??"employee"),status:String(row.status??"active")});
  const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{await updateRow(accessToken,"profiles",String(row.id),{display_name:values.display_name,username:values.username,job_title:values.job_title||null,account_type:values.account_type,status:values.status});if(password)await callFunction(accessToken,"manage-user",{action:"reset_password",user_id:row.id,password});await onSaved();}catch(cause){setError(cause instanceof Error?cause.message:"Account update failed.");}finally{setBusy(false);}}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Administration</span><h2>Edit user account</h2><form className="record-form" onSubmit={submit}><label>Full name<input required value={values.display_name} onChange={e=>setValues({...values,display_name:e.target.value})}/></label><label>Username<input required value={values.username} onChange={e=>setValues({...values,username:e.target.value})}/></label><label>Login email<input disabled type="email" value={values.email}/><small>Verified authentication email</small></label><label>Job title<input value={values.job_title} onChange={e=>setValues({...values,job_title:e.target.value})}/></label><label>Account type<select value={values.account_type} onChange={e=>setValues({...values,account_type:e.target.value})}><option value="employee">Employee</option><option value="hr">Human Resources</option><option value="manager">Manager</option><option value="auditor">Auditor</option><option value="administrator">Administrator</option></select></label><label>Status<select value={values.status} onChange={e=>setValues({...values,status:e.target.value})}><option value="active">Active</option><option value="password_change_required">Password change required</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select></label><label className="wide">New temporary password (optional)<input type="password" minLength={10} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Leave blank to keep current password"/></label>{error&&<p className="form-error wide">{error}</p>}<div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving…":"Save account changes"}</button></div></form></section></div>;
}

function CreateAccountDialog({accessToken,roles,permissions,employees,onClose,onCreated}:{accessToken:string;roles:Option[];permissions:Option[];employees:Option[];onClose:()=>void;onCreated:()=>Promise<void>}) {
  const [values,setValues]=useState({display_name:"",username:"",email:"",password:"",job_title:"",account_type:"employee",employee_id:""});
  const [roleIds,setRoleIds]=useState<string[]>([]);
  const [permissionIds,setPermissionIds]=useState<string[]>([]);
  const [dashboards,setDashboards]=useState<string[]>(["Dashboard"]);
  const [invite,setInvite]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const grouped=useMemo(()=>permissions.reduce<Record<string,Option[]>>((all,p)=>{const group=p.label.split(".")[0];(all[group]??=[]).push(p);return all;},{}),[permissions]);
  function toggle(list:string[],value:string,setter:(next:string[])=>void){setter(list.includes(value)?list.filter(x=>x!==value):[...list,value]);}
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{await callFunction(accessToken,"manage-user",{action:"create",...values,send_invite:invite,role_ids:roleIds,permission_ids:permissionIds,dashboard_access:dashboards});await onCreated();}catch(cause){setError(cause instanceof Error?cause.message:"Account creation failed.");}finally{setBusy(false);}}
  const dashboardOptions=["Dashboard","Directory","Employees","Hiring","Onboarding","Documents","Attendance","Leave","Performance","Assets","Tasks","Payroll","Benefits","Compensation","HR Requests","Announcements","Community","Meetings","Policies","Reports"];
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="modal-close" onClick={onClose} aria-label="Close">x</button><span className="eyebrow">Private account</span><h2 id="account-title">Create employee login</h2>
    <form onSubmit={submit} className="record-form account-form">
      <label>Full name *<input required value={values.display_name} onChange={e=>setValues({...values,display_name:e.target.value})}/></label>
      <label>Username *<input required value={values.username} onChange={e=>setValues({...values,username:e.target.value})}/></label>
      <label>Email for invitations {invite&&"*"}<input type="email" required={invite} value={values.email} onChange={e=>setValues({...values,email:e.target.value})}/></label>
      <label>Temporary password {!invite&&"*"}<input type="password" required={!invite} minLength={10} value={values.password} onChange={e=>setValues({...values,password:e.target.value})}/></label>
      <label>Account type *<select value={values.account_type} onChange={e=>setValues({...values,account_type:e.target.value})}><option value="employee">Employee</option><option value="hr">Human Resources</option><option value="manager">Manager</option><option value="auditor">Auditor / Compliance</option><option value="administrator">Administrator</option></select></label>
      <label>Employee record<select value={values.employee_id} onChange={e=>setValues({...values,employee_id:e.target.value})}><option value="">Not linked</option>{employees.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label>Job title<input value={values.job_title} onChange={e=>setValues({...values,job_title:e.target.value})}/></label>
      <label className="check"><input type="checkbox" checked={invite} onChange={e=>setInvite(e.target.checked)}/> Send secure invitation by email</label>
      <fieldset className="permission-group"><legend>Roles</legend>{roles.map(x=><label className="check" key={x.id}><input type="checkbox" checked={roleIds.includes(x.id)} onChange={()=>toggle(roleIds,x.id,setRoleIds)}/>{x.label}</label>)}</fieldset>
      <fieldset className="permission-group"><legend>Dashboard access</legend><button type="button" className="select-all" onClick={()=>setDashboards(dashboards.length===dashboardOptions.length?[]:dashboardOptions)}>{dashboards.length===dashboardOptions.length?"Clear all dashboards":"Select all dashboards"}</button><div className="checkbox-grid">{dashboardOptions.map(x=><label className="check" key={x}><input type="checkbox" checked={dashboards.includes(x)} onChange={()=>toggle(dashboards,x,setDashboards)}/>{x}</label>)}</div></fieldset>
      <fieldset className="permission-group wide"><legend>Custom access permissions</legend><button type="button" className="select-all" onClick={()=>setPermissionIds(permissionIds.length===permissions.length?[]:permissions.map(x=>x.id))}>{permissionIds.length===permissions.length?"Clear all permissions":"Select all permissions"}</button>{Object.entries(grouped).map(([group,items])=><div key={group} className="permission-tier"><div className="tier-heading"><strong>{group}</strong><button type="button" onClick={()=>{const ids=items.map(x=>x.id);const all=ids.every(id=>permissionIds.includes(id));setPermissionIds(all?permissionIds.filter(id=>!ids.includes(id)):[...new Set([...permissionIds,...ids])]);}}>{items.every(x=>permissionIds.includes(x.id))?"Clear group":"Select group"}</button></div><div className="checkbox-grid">{items.map(x=><label className="check" key={x.id}><input type="checkbox" checked={permissionIds.includes(x.id)} onChange={()=>toggle(permissionIds,x.id,setPermissionIds)}/>{x.label}</label>)}</div></div>)}</fieldset>
      {error&&<p className="form-error wide">{error}</p>}<div className="form-actions wide"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?"Creating securely...":invite?"Create & send invitation":"Create account"}</button></div>
    </form></section></div>;
}
