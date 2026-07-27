import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listNamedRows, listRows, listRowsWhere, updateRow } from "./lib/supabase-data";

type PortalData = {
  employee: DataRow | null;
  attendance: DataRow[];
  announcements: DataRow[];
  jobs: DataRow[];
  meetings: DataRow[];
  directory: DataRow[];
  requests: DataRow[];
};

const empty: PortalData = {employee:null,attendance:[],announcements:[],jobs:[],meetings:[],directory:[],requests:[]};

export function EmployeeHome({accessToken,profile,onNavigate}:{accessToken:string;profile:UserProfile;onNavigate:(page:string)=>void}) {
  const [data,setData]=useState<PortalData>(empty);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [profileOpen,setProfileOpen]=useState(false);
  const load=useCallback(async()=>{
    try {
      const [employees,attendance,announcements,jobs,meetings,requests]=await Promise.all([
        profile.employee_id?listRowsWhere(accessToken,"employees",{id:profile.employee_id}):Promise.resolve([]),
        profile.employee_id?listRowsWhere(accessToken,"attendance_records",{employee_id:profile.employee_id}):Promise.resolve([]),
        listRows(accessToken,"announcements","*",20),
        listRowsWhere(accessToken,"job_openings",{status:"open"},"*",30),
        listRows(accessToken,"meetings","*",20),
        profile.employee_id?listRowsWhere(accessToken,"employee_change_requests",{employee_id:profile.employee_id},"*",20):Promise.resolve([]),
      ]);
      const directory=await listNamedRows(accessToken,"employee_directory","*","full_name");
      setData({employee:employees[0]??null,attendance,announcements,jobs,meetings,directory,requests});
    } catch(cause){setError(cause instanceof Error?cause.message:"Your workspace could not be loaded.");}
  },[accessToken,profile.employee_id]);
  useEffect(()=>{void load();},[load]);

  const today=new Date().toISOString().slice(0,10);
  const todayRecord=data.attendance.find(row=>String(row.attendance_date)===today);
  const clockedIn=Boolean(todayRecord?.clock_in&&!todayRecord?.clock_out);
  const hours=useMemo(()=>data.attendance.reduce((total,row)=>{
    if(!row.clock_in||!row.clock_out)return total;
    return total+(new Date(String(row.clock_out)).getTime()-new Date(String(row.clock_in)).getTime())/3600000;
  },0),[data.attendance]);

  async function clock(action:"in"|"out"){
    if(!profile.employee_id)return setError("Ask HR to link this login to your employee record.");
    setBusy(action);setError("");
    try{
      const now=new Date().toISOString();
      if(action==="in"){
        await createRow(accessToken,"attendance_records",{organisation_id:profile.organisation_id,employee_id:profile.employee_id,attendance_date:today,clock_in:now,status:"present",source:"self_service"});
      }else if(todayRecord?.id){
        await updateRow(accessToken,"attendance_records",String(todayRecord.id),{clock_out:now});
      }
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Time entry could not be saved.");}
    finally{setBusy("");}
  }

  async function apply(job:DataRow){
    if(!profile.employee_id)return setError("Your account must be linked to an employee record before applying.");
    setBusy(String(job.id));setError("");
    try{
      await createRow(accessToken,"internal_job_applications",{organisation_id:profile.organisation_id,job_opening_id:job.id,employee_id:profile.employee_id,status:"submitted"});
      setError("Application submitted to HR.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Application could not be submitted.");}
    finally{setBusy("");}
  }

  const firstName=String(data.employee?.preferred_name||data.employee?.first_name||profile.display_name.split(" ")[0]);
  return <section className="employee-home">
    <header className="employee-welcome">
      <div><span className="eyebrow">My SAS People</span><h1>Welcome back, {firstName}</h1><p>Your workday, people, updates and requests in one secure place.</p></div>
      <div className="clock-card"><span>{new Date().toLocaleDateString("en-GH",{weekday:"long",day:"numeric",month:"long"})}</span><strong>{clockedIn?"You are clocked in":todayRecord?.clock_out?"Workday completed":"Ready to start?"}</strong><div><button className="primary" disabled={Boolean(todayRecord?.clock_in)||Boolean(busy)} onClick={()=>void clock("in")}>{busy==="in"?"Saving…":"Clock in"}</button><button className="secondary" disabled={!clockedIn||Boolean(busy)} onClick={()=>void clock("out")}>{busy==="out"?"Saving…":"Clock out"}</button></div></div>
    </header>
    {error&&<p className={error.includes("submitted")?"form-message":"form-error"}>{error}</p>}
    <div className="personal-metrics">
      <article><span>Hours recorded</span><strong>{hours.toFixed(1)}h</strong><small>Recent attendance</small></article>
      <article><span>Open vacancies</span><strong>{data.jobs.length}</strong><small>Internal opportunities</small></article>
      <article><span>Upcoming meetings</span><strong>{data.meetings.filter(x=>new Date(String(x.starts_at))>new Date()).length}</strong><small>Calendar schedule</small></article>
      <article><span>Profile requests</span><strong>{data.requests.filter(x=>x.status==="pending").length}</strong><small>Awaiting approval</small></article>
    </div>
    <div className="portal-grid">
      <article className="card portal-panel">
        <div className="panel-head"><div><h2>My profile</h2><p className="muted">Your SAS organisation identity</p></div><button className="text-btn" onClick={()=>setProfileOpen(true)}>Request changes</button></div>
        <div className="profile-summary"><div className="profile-photo">{firstName.slice(0,1)}{String(data.employee?.last_name??"").slice(0,1)}</div><div><h3>{data.employee?`${data.employee.first_name} ${data.employee.last_name}`:profile.display_name}</h3><p>{String(data.employee?.position_title??profile.job_title??"Employee")}</p><span>{String(data.employee?.employee_number??"Employee profile pending")}</span></div></div>
        <button className="secondary wide-button" onClick={()=>onNavigate("Directory")}>Browse organisation directory</button>
      </article>
      <article className="card portal-panel span-two">
        <div className="panel-head"><div><h2>Announcements</h2><p className="muted">What is happening at SAS</p></div></div>
        <div className="feed">{data.announcements.filter(x=>x.status==="published").slice(0,4).map(item=><div key={String(item.id)}><span>{new Date(String(item.publish_at??item.created_at)).toLocaleDateString()}</span><strong>{String(item.title)}</strong><p>{String(item.body)}</p></div>)}{!data.announcements.length&&<p className="muted">No announcements yet.</p>}</div>
      </article>
      <article className="card portal-panel span-two">
        <div className="panel-head"><div><h2>Open positions</h2><p className="muted">Grow your career within SAS Finance Group</p></div><button className="text-btn" onClick={()=>onNavigate("Hiring")}>See all</button></div>
        <div className="job-cards">{data.jobs.slice(0,4).map(job=><div key={String(job.id)}><span>{String(job.employment_type??"Opportunity")}</span><h3>{String(job.title)}</h3><p>{String(job.location??"Ghana")} · closes {String(job.closing_date??"when filled")}</p><button disabled={busy===String(job.id)} onClick={()=>void apply(job)}>{busy===String(job.id)?"Applying…":"Apply internally"}</button></div>)}{!data.jobs.length&&<p className="muted">There are no open positions right now.</p>}</div>
      </article>
      <article className="card portal-panel">
        <div className="panel-head"><div><h2>Next meetings</h2><p className="muted">Teams and workplace calendar</p></div></div>
        <div className="meeting-list">{data.meetings.filter(x=>new Date(String(x.starts_at))>new Date()).slice(0,4).map(item=><a key={String(item.id)} href={String(item.meeting_url||"#")} target="_blank" rel="noreferrer"><strong>{String(item.title)}</strong><span>{new Date(String(item.starts_at)).toLocaleString()}</span><small>{String(item.meeting_provider)}</small></a>)}{!data.meetings.length&&<p className="muted">No upcoming meetings.</p>}</div>
      </article>
    </div>
    {profileOpen&&<ProfileChangeDialog accessToken={accessToken} profile={profile} employee={data.employee} onClose={()=>setProfileOpen(false)} onSaved={async()=>{setProfileOpen(false);await load();}}/>}
  </section>;
}

function ProfileChangeDialog({accessToken,profile,employee,onClose,onSaved}:{accessToken:string;profile:UserProfile;employee:DataRow|null;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [field,setField]=useState("phone");const [value,setValue]=useState("");const [reason,setReason]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();if(!profile.employee_id)return;setBusy(true);try{await createRow(accessToken,"employee_change_requests",{organisation_id:profile.organisation_id,employee_id:profile.employee_id,requested_by:profile.id,field_name:field,old_value:String(employee?.[field]??""),new_value:value,reason,status:"pending"});await onSaved();}catch(cause){setError(cause instanceof Error?cause.message:"Request could not be submitted.");}finally{setBusy(false);}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Approval workflow</span><h2>Request profile change</h2><form onSubmit={submit}><label>Information<select value={field} onChange={e=>setField(e.target.value)}><option value="phone">Phone number</option><option value="residential_address">Residential address</option><option value="personal_email">Personal email</option><option value="emergency_contact_phone">Emergency contact</option><option value="marital_status">Marital status</option></select></label><label>Requested value<input required value={value} onChange={e=>setValue(e.target.value)}/></label><label>Reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>{error&&<p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy?"Submitting…":"Send for HR approval"}</button></form></section></div>;
}
