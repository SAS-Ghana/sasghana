import { useEffect, useState } from "react";
import { DataRow, listRows } from "./lib/supabase-data";

const sources=[
  {table:"employees",page:"Employees",label:"Employees",title:(r:DataRow)=>`${r.first_name??""} ${r.last_name??""}`,meta:(r:DataRow)=>`${r.employee_number??""} · ${r.position_title??""}`},
  {table:"employee_documents",page:"Documents",label:"Documents",title:(r:DataRow)=>String(r.document_name??"Document"),meta:(r:DataRow)=>String(r.category??"")},
  {table:"hr_requests",page:"HR Requests",label:"HR requests",title:(r:DataRow)=>String(r.subject??"Request"),meta:(r:DataRow)=>String(r.request_type??"")},
  {table:"tasks",page:"Tasks",label:"Tasks",title:(r:DataRow)=>String(r.title??"Task"),meta:(r:DataRow)=>String(r.status??"")},
  {table:"community_posts",page:"Community",label:"Community",title:(r:DataRow)=>String(r.title??"Post"),meta:(r:DataRow)=>String(r.audience??"")},
  {table:"attendance_records",page:"Attendance",label:"Attendance",title:(r:DataRow)=>`${r.attendance_date??"Attendance"} · ${r.status??""}`,meta:(r:DataRow)=>`${r.clock_in??"No clock in"} — ${r.clock_out??"Working"}`},
  {table:"meetings",page:"Meetings",label:"Meetings",title:(r:DataRow)=>String(r.title??"Meeting"),meta:(r:DataRow)=>String(r.starts_at??"")},
  {table:"announcements",page:"Announcements",label:"Announcements",title:(r:DataRow)=>String(r.title??"Announcement"),meta:(r:DataRow)=>String(r.audience??"")},
  {table:"audit_logs",page:"Security & audit",label:"Audit activity",title:(r:DataRow)=>String(r.action??"Activity"),meta:(r:DataRow)=>`${r.resource??""} · ${r.outcome??""}`},
];

const moduleIntents=[
  {page:"Attendance",terms:["attendance","clock in","clock out","timesheet","late","absent","working hours"]},
  {page:"Directory",terms:["directory","staff list","people","workers","who works","organisation chart"]},
  {page:"Calendar",terms:["calendar","holiday","availability","schedule"]},
  {page:"Meetings",terms:["meeting","teams","appointment","conference"]},
  {page:"Employees",terms:["employee","staff profile","worker profile"]},
  {page:"User accounts",terms:["account","login","password","invite","user access"]},
  {page:"Security & audit",terms:["audit","activity","login history","security","tracking"]},
  {page:"Payroll",terms:["payroll","payslip","salary","tax","ssnit"]},
  {page:"Leave",terms:["leave","time off","vacation","who is away"]},
  {page:"Performance",terms:["performance","rating","assessment","feedback"]},
  {page:"Reports",terms:["report","analytics","statistics","export"]},
];

export function GlobalSearch({accessToken,query,onNavigate,onClear}:{accessToken:string;query:string;onNavigate:(page:string)=>void;onClear:()=>void}) {
  const [groups,setGroups]=useState<{page:string;label:string;rows:{title:string;meta:string}[]}[]>([]);
  const [loading,setLoading]=useState(true);
  const normalized=query.trim().toLowerCase();
  const suggestions=moduleIntents.filter(intent=>intent.page.toLowerCase().includes(normalized)||intent.terms.some(term=>term.includes(normalized)||normalized.includes(term))).slice(0,5);
  useEffect(()=>{
    setLoading(true);
    const timer=window.setTimeout(()=>{void Promise.all(sources.map(async source=>{
      try{const rows=await listRows(accessToken,source.table,"*",150);const needle=query.trim().toLowerCase();return{page:source.page,label:source.label,rows:rows.filter(row=>Object.values(row).some(value=>String(value??"").toLowerCase().includes(needle))).slice(0,8).map(row=>({title:source.title(row),meta:source.meta(row)}))};}
      catch{return{page:source.page,label:source.label,rows:[]};}
    })).then(results=>{setGroups(results.filter(group=>group.rows.length));setLoading(false);});},180);
    return()=>window.clearTimeout(timer);
  },[accessToken,query]);
  const open=(page:string)=>{onClear();onNavigate(page);};
  return <section><header className="page-header"><div><span className="eyebrow">Smart workspace search</span><h1>Results for “{query}”</h1><p className="muted">Understands pages, actions, people and live Supabase records.</p></div><button className="secondary" onClick={onClear}>Clear search</button></header>
    {suggestions.length>0&&<article className="smart-suggestions"><span>Suggested destinations</span><div>{suggestions.map(item=><button key={item.page} onClick={()=>open(item.page)}><strong>{item.page}</strong><small>Open workspace</small></button>)}</div></article>}
    {loading?<div className="empty-state">Searching Supabase…</div>:groups.length===0&&suggestions.length===0?<div className="card empty-state"><h3>No matching records</h3><p>Try “attendance”, “open payroll”, “login history”, a person’s name, or an employee number.</p></div>:<div className="search-groups">{groups.map(group=><article className="card" key={group.page}><div className="panel-head"><h2>{group.label}</h2><button className="text-btn" onClick={()=>open(group.page)}>Open module</button></div>{group.rows.map((row,index)=><button key={`${row.title}-${index}`} onClick={()=>open(group.page)}><strong>{row.title}</strong><span>{row.meta}</span></button>)}</article>)}</div>}
  </section>;
}
