import { useEffect, useState } from "react";
import { DataRow, listRows } from "./lib/supabase-data";

const sources=[
  {table:"employees",page:"Employees",label:"Employees",title:(r:DataRow)=>`${r.first_name??""} ${r.last_name??""}`,meta:(r:DataRow)=>`${r.employee_number??""} · ${r.position_title??""}`},
  {table:"employee_documents",page:"Documents",label:"Documents",title:(r:DataRow)=>String(r.document_name??"Document"),meta:(r:DataRow)=>String(r.category??"")},
  {table:"hr_requests",page:"HR Requests",label:"HR requests",title:(r:DataRow)=>String(r.subject??"Request"),meta:(r:DataRow)=>String(r.request_type??"")},
  {table:"tasks",page:"Tasks",label:"Tasks",title:(r:DataRow)=>String(r.title??"Task"),meta:(r:DataRow)=>String(r.status??"")},
  {table:"community_posts",page:"Community",label:"Community",title:(r:DataRow)=>String(r.title??"Post"),meta:(r:DataRow)=>String(r.audience??"")},
];

export function GlobalSearch({accessToken,query,onNavigate,onClear}:{accessToken:string;query:string;onNavigate:(page:string)=>void;onClear:()=>void}) {
  const [groups,setGroups]=useState<{page:string;label:string;rows:{title:string;meta:string}[]}[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const timer=window.setTimeout(()=>{void Promise.all(sources.map(async source=>{
      try{const rows=await listRows(accessToken,source.table,"*",100);const needle=query.trim().toLowerCase();return{page:source.page,label:source.label,rows:rows.filter(row=>Object.values(row).some(value=>String(value??"").toLowerCase().includes(needle))).slice(0,8).map(row=>({title:source.title(row),meta:source.meta(row)}))};}
      catch{return{page:source.page,label:source.label,rows:[]};}
    })).then(results=>{setGroups(results.filter(group=>group.rows.length));setLoading(false);});},220);
    return()=>window.clearTimeout(timer);
  },[accessToken,query]);
  return <section><header className="page-header"><div><span className="eyebrow">Global search</span><h1>Results for “{query}”</h1><p className="muted">Employees, documents, requests, tasks, and community posts</p></div><button className="secondary" onClick={onClear}>Clear search</button></header>{loading?<div className="empty-state">Searching Supabase...</div>:groups.length===0?<div className="card empty-state"><h3>No matching records</h3><p>Try a name, employee number, document title, request, or task.</p></div>:<div className="search-groups">{groups.map(group=><article className="card" key={group.page}><div className="panel-head"><h2>{group.label}</h2><button className="text-btn" onClick={()=>{onClear();onNavigate(group.page);}}>Open module</button></div>{group.rows.map((row,index)=><button key={`${row.title}-${index}`} onClick={()=>{onClear();onNavigate(group.page);}}><strong>{row.title}</strong><span>{row.meta}</span></button>)}</article>)}</div>}</section>;
}
