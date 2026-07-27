import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listRows, listRowsWhere, updateRow } from "./lib/supabase-data";

type PortalData = {
  employee: DataRow | null;
  attendance: DataRow[];
  leave: DataRow[];
  payroll: DataRow[];
  benefits: DataRow[];
  performance: DataRow[];
  onboarding: DataRow[];
  documents: DataRow[];
  assets: DataRow[];
  announcements: DataRow[];
  meetings: DataRow[];
  requests: DataRow[];
};

type Tab = "overview"|"personal"|"employment"|"attendance"|"leave"|"payroll"|"benefits"|"performance"|"training"|"documents"|"assets"|"requests";
const empty:PortalData={employee:null,attendance:[],leave:[],payroll:[],benefits:[],performance:[],onboarding:[],documents:[],assets:[],announcements:[],meetings:[],requests:[]};
const tabs:[Tab,string][]=[["overview","Overview"],["personal","Personal details"],["employment","Employment"],["attendance","Attendance"],["leave","Leave"],["payroll","Payroll"],["benefits","Benefits"],["performance","Performance"],["training","Training"],["documents","Documents"],["assets","Assigned assets"],["requests","Requests"]];

export function EmployeeHome({accessToken,profile,onNavigate}:{accessToken:string;profile:UserProfile;onNavigate:(page:string)=>void}){
  const [data,setData]=useState<PortalData>(empty);
  const [tab,setTab]=useState<Tab>("overview");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [profileOpen,setProfileOpen]=useState(false);
  const [leaveOpen,setLeaveOpen]=useState(false);
  const [now,setNow]=useState(Date.now());

  const own=useCallback(async(table:string,employeeKey="employee_id",limit=200)=>{
    if(!profile.employee_id)return [];
    try{return await listRowsWhere(accessToken,table,{[employeeKey]:profile.employee_id},"*",limit);}catch{return [];}
  },[accessToken,profile.employee_id]);

  const load=useCallback(async()=>{
    setError("");
    try{
      const [employees,attendance,leave,payroll,benefits,performance,onboarding,documents,assets,announcements,meetings,requests]=await Promise.all([
        profile.employee_id?listRowsWhere(accessToken,"employees",{id:profile.employee_id},"*",1):Promise.resolve([]),
        own("attendance_records"),own("leave_requests"),own("payroll_records"),own("employee_benefits"),own("performance_reviews"),own("employee_onboarding"),own("employee_documents"),own("assets","assigned_employee_id"),
        listRows(accessToken,"announcements","*",30).catch(()=>[]),listRows(accessToken,"meetings","*",30).catch(()=>[]),own("employee_change_requests")
      ]);
      setData({employee:employees[0]??null,attendance,leave,payroll,benefits,performance,onboarding,documents,assets,announcements,meetings,requests});
    }catch(cause){setError(cause instanceof Error?cause.message:"Your employee workspace could not be loaded.");}
  },[accessToken,profile.employee_id,own]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);

  const today=new Date().toISOString().slice(0,10);
  const todayRecord=data.attendance.find(row=>String(row.attendance_date)===today);
  const clockedIn=Boolean(todayRecord?.clock_in&&!todayRecord?.clock_out);
  const liveSeconds=clockedIn?Math.max(0,Math.floor((now-new Date(String(todayRecord?.clock_in)).getTime())/1000)):0;
  const liveTime=`${String(Math.floor(liveSeconds/3600)).padStart(2,"0")}:${String(Math.floor(liveSeconds%3600/60)).padStart(2,"0")}:${String(liveSeconds%60).padStart(2,"0")}`;
  const hours=useMemo(()=>data.attendance.reduce((total,row)=>row.clock_in&&row.clock_out?total+(new Date(String(row.clock_out)).getTime()-new Date(String(row.clock_in)).getTime())/3600000:total,0),[data.attendance]);

  async function clock(action:"in"|"out"){
    if(!profile.employee_id)return setError("Ask HR to link this login to your employee record.");
    setBusy(action);setError("");setNotice("");
    try{const stamp=new Date().toISOString();if(action==="in")await createRow(accessToken,"attendance_records",{organisation_id:profile.organisation_id,employee_id:profile.employee_id,attendance_date:today,clock_in:stamp,status:"present",source:"self_service"});else if(todayRecord?.id)await updateRow(accessToken,"attendance_records",String(todayRecord.id),{clock_out:stamp});await load();setNotice(action==="in"?"Clock in saved.":"Clock out saved.");}
    catch(cause){setError(cause instanceof Error?cause.message:"Time entry could not be saved.");}finally{setBusy("");}
  }

  const employee=data.employee;
  const firstName=String(employee?.preferred_name||employee?.first_name||profile.display_name.split(" ")[0]);
  return <section className="employee-home">
    <header className="employee-welcome"><div><span className="eyebrow">Employee self service</span><h1>Welcome back, {firstName}</h1><p>Access your profile, attendance, leave, payroll, benefits and workplace records.</p></div><div className="clock-card"><span>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</span><strong>{clockedIn?liveTime:todayRecord?.clock_out?"Workday completed":"Ready to start?"}</strong><div><button className="primary" disabled={Boolean(todayRecord?.clock_in)||Boolean(busy)} onClick={()=>void clock("in")}>{busy==="in"?"Saving…":"Clock in"}</button><button className="secondary" disabled={!clockedIn||Boolean(busy)} onClick={()=>void clock("out")}>{busy==="out"?"Saving…":"Clock out"}</button></div></div></header>
    {error&&<p className="form-error">{error}</p>}{notice&&<p className="form-message">{notice}</p>}
    {!profile.employee_id&&<article className="card"><h2>Employee record not linked</h2><p>Your login is active, but it is not linked to an employee record. HR must link your profile before personal modules can display data.</p></article>}
    <nav className="filter-toolbar" aria-label="Employee profile sections">{tabs.map(([id,label])=><button key={id} className={tab===id?"primary":"secondary"} onClick={()=>setTab(id)}>{label}</button>)}</nav>

    {tab==="overview"&&<><div className="personal-metrics"><article><span>Hours recorded</span><strong>{hours.toFixed(1)}h</strong><small>Available attendance history</small></article><article><span>Leave requests</span><strong>{data.leave.length}</strong><small>{data.leave.filter(x=>x.status==="pending").length} pending</small></article><article><span>Payslips</span><strong>{data.payroll.length}</strong><small>Authorised payroll records</small></article><article><span>Assigned assets</span><strong>{data.assets.length}</strong><small>Equipment in your custody</small></article></div><div className="portal-grid"><article className="card portal-panel"><div className="panel-head"><div><h2>My profile</h2><p className="muted">Your organisation identity</p></div><button className="text-btn" onClick={()=>setProfileOpen(true)}>Request changes</button></div><ProfileSummary employee={employee} profile={profile}/></article><article className="card portal-panel span-two"><div className="panel-head"><div><h2>Announcements</h2><p className="muted">Published workplace updates</p></div></div><Rows rows={data.announcements.filter(x=>x.status==="published").slice(0,5)} columns={[["title","Title"],["body","Message"],["publish_at","Published"]]}/></article><article className="card portal-panel span-two"><div className="panel-head"><div><h2>Upcoming meetings</h2><p className="muted">Your workplace schedule</p></div></div><Rows rows={data.meetings.filter(x=>new Date(String(x.starts_at))>new Date()).slice(0,5)} columns={[["title","Meeting"],["starts_at","Starts"],["meeting_provider","Provider"]]}/></article></div></>}
    {tab==="personal"&&<DetailCard title="Personal details" actions={<button className="primary" onClick={()=>setProfileOpen(true)}>Request a change</button>} rows={[["Full name",`${employee?.first_name??""} ${employee?.middle_name??""} ${employee?.last_name??""}`.replace(/\s+/g," ").trim()],["Personal email",employee?.personal_email],["Phone",employee?.phone],["Date of birth",employee?.date_of_birth],["Gender",employee?.gender],["Nationality",employee?.nationality],["Marital status",employee?.marital_status],["Residential address",employee?.residential_address],["Digital address",employee?.digital_address],["Emergency contact",employee?.emergency_contact_name],["Emergency phone",employee?.emergency_contact_phone]]}/>}
    {tab==="employment"&&<DetailCard title="Employment information" rows={[["Employee number",employee?.employee_number],["Work email",employee?.work_email],["Position",employee?.position_title],["Employment type",employee?.employment_type],["Start date",employee?.start_date],["Probation end",employee?.probation_end_date],["Contract end",employee?.contract_end_date],["Status",employee?.employment_status],["Skills",employee?.skills],["Qualifications",employee?.qualifications]]}/>}
    {tab==="attendance"&&<ModuleSection title="Attendance history" rows={data.attendance} columns={[["attendance_date","Date"],["clock_in","Clock in"],["clock_out","Clock out"],["status","Status"],["notes","Notes"]]}/>} 
    {tab==="leave"&&<ModuleSection title="My leave requests" rows={data.leave} columns={[["leave_type","Type"],["start_date","Starts"],["end_date","Ends"],["days","Days"],["status","Status"]]} action={<button className="primary" onClick={()=>setLeaveOpen(true)}>Request leave</button>}/>} 
    {tab==="payroll"&&<ModuleSection title="My payroll and payslips" rows={data.payroll} columns={[["pay_period","Pay period"],["basic_salary","Basic salary"],["paye_tax","PAYE"],["employee_ssnit","SSNIT"],["net_pay","Net pay"],["status","Status"]]} moneyKeys={new Set(["basic_salary","paye_tax","employee_ssnit","net_pay"])}/>} 
    {tab==="benefits"&&<ModuleSection title="My benefits" rows={data.benefits} columns={[["benefit_name","Benefit"],["plan_name","Plan"],["start_date","Starts"],["end_date","Ends"],["status","Status"]]}/>} 
    {tab==="performance"&&<ModuleSection title="My performance reviews" rows={data.performance} columns={[["review_type","Review"],["review_period","Period"],["rating","Rating"],["due_date","Due"],["status","Status"]]}/>} 
    {tab==="training"&&<ModuleSection title="My onboarding and training" rows={data.onboarding} columns={[["status","Status"],["progress","Progress"],["due_date","Due"],["notes","Notes"]]}/>} 
    {tab==="documents"&&<ModuleSection title="My documents" rows={data.documents} columns={[["document_name","Document"],["category","Category"],["status","Status"],["expiry_date","Expiry"]]}/>} 
    {tab==="assets"&&<ModuleSection title="Assets assigned to me" rows={data.assets} columns={[["asset_code","Asset ID"],["category","Category"],["description","Description"],["serial_number","Serial number"],["condition","Condition"],["status","Status"]]}/>} 
    {tab==="requests"&&<ModuleSection title="My profile change requests" rows={data.requests} columns={[["field_name","Information"],["old_value","Old value"],["new_value","Requested value"],["status","Status"],["created_at","Submitted"]]} action={<button className="primary" onClick={()=>setProfileOpen(true)}>New request</button>}/>} 
    {profileOpen&&<ProfileChangeDialog accessToken={accessToken} profile={profile} employee={employee} onClose={()=>setProfileOpen(false)} onSaved={async()=>{setProfileOpen(false);await load();}}/>}
    {leaveOpen&&<LeaveDialog accessToken={accessToken} profile={profile} onClose={()=>setLeaveOpen(false)} onSaved={async()=>{setLeaveOpen(false);await load();}}/>}
  </section>;
}

function ProfileSummary({employee,profile}:{employee:DataRow|null;profile:UserProfile}){return <div className="profile-summary"><div className="profile-photo">{String(employee?.first_name??profile.display_name).slice(0,1)}{String(employee?.last_name??"").slice(0,1)}</div><div><h3>{employee?`${employee.first_name} ${employee.last_name}`:profile.display_name}</h3><p>{String(employee?.position_title??profile.job_title??"Employee")}</p><span>{String(employee?.employee_number??"Employee profile pending")}</span></div></div>}
function value(v:unknown,money=false){if(v===null||v===undefined||v==="")return "—";if(money)return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GHS"}).format(Number(v));const text=String(v);if(/^\d{4}-\d{2}-\d{2}T/.test(text))return new Date(text).toLocaleString("en-GB");return text.replaceAll("_"," ");}
function Rows({rows,columns,moneyKeys=new Set<string>()}:{rows:DataRow[];columns:[string,string][];moneyKeys?:Set<string>}){return rows.length?<div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(([,label])=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.id??index)}>{columns.map(([key])=><td key={key}>{value(row[key],moneyKeys.has(key))}</td>)}</tr>)}</tbody></table></div>:<div className="empty-state"><h3>No records yet</h3><p>Nothing has been recorded in this section.</p></div>}
function ModuleSection({title,rows,columns,action,moneyKeys}:{title:string;rows:DataRow[];columns:[string,string][];action?:React.ReactNode;moneyKeys?:Set<string>}){const [query,setQuery]=useState("");const [sort,setSort]=useState(columns[0][0]);const visible=useMemo(()=>rows.filter(row=>!query||Object.values(row).some(v=>String(v??"").toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>String(a[sort]??"").localeCompare(String(b[sort]??""),undefined,{numeric:true})),[rows,query,sort]);return <article className="card data-panel"><div className="panel-head"><div><h2>{title}</h2><p className="muted">Only records authorised for your account are shown.</p></div>{action}</div><div className="filter-toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search records..."/><select value={sort} onChange={e=>setSort(e.target.value)}>{columns.map(([key,label])=><option key={key} value={key}>Sort by {label}</option>)}</select><button className="secondary" onClick={()=>window.print()}>Print</button></div><Rows rows={visible} columns={columns} moneyKeys={moneyKeys}/></article>}
function DetailCard({title,rows,actions}:{title:string;rows:[string,unknown][];actions?:React.ReactNode}){return <article className="card data-panel"><div className="panel-head"><div><h2>{title}</h2><p className="muted">Information held in your employee record.</p></div>{actions}</div><div className="master-list">{rows.map(([label,item])=><div key={label}><strong>{label}</strong><span>{value(item)}</span></div>)}</div></article>}
function ProfileChangeDialog({accessToken,profile,employee,onClose,onSaved}:{accessToken:string;profile:UserProfile;employee:DataRow|null;onClose:()=>void;onSaved:()=>Promise<void>}){const [field,setField]=useState("phone"),[next,setNext]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(event:FormEvent){event.preventDefault();if(!profile.employee_id)return setError("Your profile is not linked to an employee record.");setBusy(true);try{await createRow(accessToken,"employee_change_requests",{organisation_id:profile.organisation_id,employee_id:profile.employee_id,requested_by:profile.id,field_name:field,old_value:String(employee?.[field]??""),new_value:next,reason,status:"pending"});await onSaved();}catch(cause){setError(cause instanceof Error?cause.message:"Request could not be submitted.");}finally{setBusy(false);}}return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal"><button className="modal-close" onClick={onClose}>×</button><h2>Request profile change</h2><form onSubmit={submit}><label>Information<select value={field} onChange={e=>setField(e.target.value)}><option value="phone">Phone number</option><option value="residential_address">Residential address</option><option value="personal_email">Personal email</option><option value="emergency_contact_phone">Emergency contact</option><option value="marital_status">Marital status</option></select></label><label>Requested value<input required value={next} onChange={e=>setNext(e.target.value)}/></label><label>Reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>{error&&<p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy?"Submitting…":"Send for HR approval"}</button></form></section></div>}
function LeaveDialog({accessToken,profile,onClose,onSaved}:{accessToken:string;profile:UserProfile;onClose:()=>void;onSaved:()=>Promise<void>}){const [type,setType]=useState("Annual leave"),[start,setStart]=useState(""),[end,setEnd]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(event:FormEvent){event.preventDefault();if(!profile.employee_id)return setError("Your profile is not linked to an employee record.");const days=Math.max(1,Math.ceil((new Date(end).getTime()-new Date(start).getTime())/86400000)+1);setBusy(true);try{await createRow(accessToken,"leave_requests",{organisation_id:profile.organisation_id,employee_id:profile.employee_id,leave_type:type,start_date:start,end_date:end,days,status:"pending",reason});await onSaved();}catch(cause){setError(cause instanceof Error?cause.message:"Leave request could not be submitted.");}finally{setBusy(false);}}return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal"><button className="modal-close" onClick={onClose}>×</button><h2>Request leave</h2><form onSubmit={submit}><label>Leave type<select value={type} onChange={e=>setType(e.target.value)}><option>Annual leave</option><option>Sick leave</option><option>Maternity leave</option><option>Paternity leave</option><option>Compassionate leave</option><option>Study leave</option><option>Unpaid leave</option></select></label><label>Start date<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>End date<input type="date" required min={start} value={end} onChange={e=>setEnd(e.target.value)}/></label><label>Reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>{error&&<p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy?"Submitting…":"Submit leave request"}</button></form></section></div>}
