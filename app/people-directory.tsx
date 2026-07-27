import { useCallback, useEffect, useMemo, useState } from "react";
import { DataRow, listNamedRows } from "./lib/supabase-data";

export function PeopleDirectory({accessToken}:{accessToken:string}) {
  const [people,setPeople]=useState<DataRow[]>([]);
  const [query,setQuery]=useState("");
  const [department,setDepartment]=useState("all");
  const [error,setError]=useState("");
  const load=useCallback(async()=>{try{setPeople(await listNamedRows(accessToken,"employee_directory","*","full_name"));}catch(cause){setError(cause instanceof Error?cause.message:"Directory could not be loaded.");}},[accessToken]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  const departments=useMemo(()=>[...new Set(people.map(x=>String(x.department_name||"Unassigned")))].sort(),[people]);
  const visible=people.filter(person=>{
    const haystack=`${person.full_name} ${person.position_title} ${person.department_name} ${person.branch}`.toLowerCase();
    return haystack.includes(query.toLowerCase())&&(department==="all"||String(person.department_name||"Unassigned")===department);
  });
  return <section>
    <header className="page-header"><div><span className="eyebrow">Our people</span><h1>Organisation directory</h1><p className="muted">Find colleagues, roles and teams without exposing private employee information.</p></div></header>
    <div className="directory-filters"><input aria-label="Search directory" placeholder="Search name, role, team or branch…" value={query} onChange={e=>setQuery(e.target.value)}/><select value={department} onChange={e=>setDepartment(e.target.value)}><option value="all">All departments</option>{departments.map(x=><option key={x}>{x}</option>)}</select></div>
    {error&&<p className="form-error">{error}</p>}
    <div className="directory-grid">{visible.map(person=><article className="card person-card" key={String(person.id)}><div className="profile-photo small">{String(person.full_name).split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><h3>{String(person.full_name)}</h3><p>{String(person.position_title||"Employee")}</p><span>{String(person.department_name||"Unassigned")} · joined {String(person.year_joined||"—")}</span></div></article>)}{!visible.length&&<div className="empty-state"><h3>No colleagues found</h3><p>Try another name or department.</p></div>}</div>
  </section>;
}
