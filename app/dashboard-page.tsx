"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataRow, listNamedRows, listRows } from "./lib/supabase-data";
import type { UserProfile } from "./lib/supabase-auth";

type DashboardData = {
  employees: DataRow[]; onboarding: DataRow[]; documents: DataRow[];
  leave: DataRow[]; departments: DataRow[]; audits: DataRow[]; backups:DataRow[];
};

const emptyData: DashboardData = {employees:[],onboarding:[],documents:[],leave:[],departments:[],audits:[],backups:[]};

export function DashboardPage({accessToken,profile,onNavigate}:{accessToken:string;profile:UserProfile;onNavigate:(page:string)=>void}) {
  const [data,setData]=useState<DashboardData>(emptyData);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const [employees,onboarding,documents,leave,departments,audits,backups]=await Promise.all([
        listRows(accessToken,"employees"),listRows(accessToken,"employee_onboarding"),
        listRows(accessToken,"employee_documents"),listRows(accessToken,"leave_requests"),
        listNamedRows(accessToken,"departments","id,name"),listRows(accessToken,"audit_logs","*",12),
        listRows(accessToken,"backup_records","*",10),
      ]);
      setData({employees,onboarding,documents,leave,departments,audits,backups});
    } catch(cause){setError(cause instanceof Error?cause.message:"Dashboard data could not be loaded.");}
    finally{setLoading(false);}
  },[accessToken]);

  useEffect(()=>{void load();},[load]);

  const departmentCounts=useMemo(()=>data.departments.map((department)=>({
    name:String(department.name),count:data.employees.filter((employee)=>employee.department_id===department.id).length,
  })),[data.departments,data.employees]);
  const maxDepartment=Math.max(1,...departmentCounts.map((item)=>item.count));
  const activeOnboarding=data.onboarding.filter((row)=>!["completed"].includes(String(row.status)));
  const onTrack=activeOnboarding.filter((row)=>["not_started","in_progress"].includes(String(row.status))).length;
  const attention=activeOnboarding.filter((row)=>row.status==="needs_attention").length;
  const overdue=activeOnboarding.filter((row)=>row.status==="overdue").length;
  const compliance=data.documents.length?Math.round(data.documents.filter((row)=>row.status==="verified").length/data.documents.length*100):0;
  const today=new Date().toISOString().slice(0,10);
  const onLeave=data.leave.filter((row)=>row.status==="approved"&&String(row.start_date)<=today&&String(row.end_date)>=today).length;
  const recentBackup=data.backups.find(row=>row.status==="completed"&&new Date(String(row.completed_at??row.created_at)).getTime()>Date.now()-30*86400000);
  const tasks=[
    ...data.documents.filter((row)=>row.status==="pending").slice(0,2).map((row)=>({title:"Verify employee document",meta:String(row.document_name),due:String(row.expiry_date??"Pending")})),
    ...activeOnboarding.filter((row)=>["needs_attention","overdue"].includes(String(row.status))).slice(0,2).map((row)=>({title:"Review onboarding",meta:`${row.progress??0}% complete`,due:String(row.due_date??"Open")})),
    ...data.leave.filter((row)=>row.status==="pending").slice(0,2).map((row)=>({title:"Review leave request",meta:String(row.leave_type),due:String(row.start_date)})),
  ].slice(0,4);

  return <section>
    <header className="hero"><div><span className="eyebrow">SAS Finance Group Ghana</span><h1>Good afternoon, {profile.display_name}.</h1><p className="muted">{loading?"Loading live organisation data...":"Here is what needs your attention across SAS People today."}</p></div><button className="primary" onClick={()=>onNavigate("Employees")}>Add employee</button></header>
    {!recentBackup&&profile.roles.includes("SAS System Administrator")&&<aside className="backup-alert"><div><strong>Backup review required</strong><p>No completed backup has been recorded in the last 30 days. Create a backup record and verify restoration readiness.</p></div><button onClick={()=>onNavigate("Backups")}>Review backups</button></aside>}
    {error&&<p className="form-error">{error}</p>}
    <section className="metrics" aria-label="Organisation summary">
      {[["Total employees",data.employees.length,"Live headcount"],["Active onboarding",activeOnboarding.length,"Open journeys"],["On leave today",onLeave,"Approved today"],["Document compliance",`${compliance}%`,`${data.documents.length} documents`]].map(([label,value,note])=><article className="card metric" key={label}><div className="metric-top"><span>{label}</span><b>{String(label).slice(0,1)}</b></div><div className="metric-value">{value}</div><div className="trend">{note}</div></article>)}
    </section>
    <section className="quick"><button onClick={()=>onNavigate("Employees")}><span>+</span>Add employee</button><button onClick={()=>onNavigate("Employees")}><span>UP</span>Import records</button><button onClick={()=>onNavigate("Documents")}><span>DOC</span>Generate document</button><button onClick={()=>onNavigate("Onboarding")}><span>OK</span>Review onboarding</button></section>
    <section className="grid">
      <article className="card panel"><div className="panel-head"><div><h2>Workforce by department</h2><p className="muted">Live employee distribution</p></div><button className="text-btn" onClick={()=>onNavigate("Reports")}>View report</button></div>{departmentCounts.length===0?<Empty label="No departments available"/>:<div className="bars">{departmentCounts.map((item)=><div className="bar-wrap" key={item.name}><strong>{item.count}</strong><div className="bar" style={{height:`${Math.max(8,item.count/maxDepartment*85)}%`}}/><span>{item.name}</span></div>)}</div>}</article>
      <article className="card panel"><div className="panel-head"><div><h2>Onboarding health</h2><p className="muted">{activeOnboarding.length} active journeys</p></div><button className="text-btn" onClick={()=>onNavigate("Onboarding")}>Details</button></div><div className="onboarding-stats"><strong>{activeOnboarding.length?Math.round(onTrack/activeOnboarding.length*100):0}%</strong><span>{onTrack} on track</span><span>{attention} need attention</span><span>{overdue} overdue</span></div></article>
      <article className="card panel"><div className="panel-head"><div><h2>Priority tasks</h2><p className="muted">Items requiring HR action</p></div></div>{tasks.length===0?<Empty label="No priority tasks"/>:<div className="tasks">{tasks.map((task,index)=><div className="task" key={`${task.title}-${index}`}><div className="task-icon">{task.title.slice(0,1)}</div><div><strong>{task.title}</strong><small>{task.meta}</small></div><span className="badge">{task.due}</span></div>)}</div>}</article>
      <article className="card panel"><div className="panel-head"><div><h2>Recent activity</h2><p className="muted">Supabase audit activity</p></div></div>{data.audits.length===0?<Empty label="No audit activity yet"/>:<div className="activity">{data.audits.map((row)=><div className="activity-row" key={String(row.id)}><div className="avatar">{String(row.action??"A").slice(0,2).toUpperCase()}</div><p>{String(row.action).replaceAll("_"," ")} · {String(row.resource)}</p><time>{new Date(String(row.created_at)).toLocaleDateString()}</time></div>)}</div>}</article>
    </section>
  </section>;
}

function Empty({label}:{label:string}){return <div className="empty-state compact"><p>{label}</p></div>;}
