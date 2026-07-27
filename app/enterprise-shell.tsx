import { useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { enterpriseNavigation } from "./enterprise-navigation";

export function EnterpriseSidebar({profile,active,onNavigate,companyName,logoUrl}:{profile:UserProfile;active:string;onNavigate:(page:string)=>void;companyName:string;logoUrl:string}) {
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});
  const isAdmin=profile.roles.includes("SAS System Administrator")||profile.account_type==="administrator";
  const groups=useMemo(()=>enterpriseNavigation.map(group=>({...group,items:group.items.filter(item=>{
    if(item.adminOnly&&!isAdmin)return false;
    if(!item.permission?.length)return true;
    return isAdmin||item.permission.some(permission=>profile.permissions.includes(permission))||profile.dashboard_access.includes(item.label);
  })})).filter(group=>group.items.length),[profile,isAdmin]);
  return <aside className="enterprise-sidebar">
    <div className="enterprise-brand"><img src={logoUrl||"/logo.png"} alt={companyName}/><div><strong>{companyName||"SAS People"}</strong><small>People operations</small></div></div>
    <nav className="enterprise-nav">{groups.map(group=><section key={group.label}><button className="enterprise-group" onClick={()=>setCollapsed(current=>({...current,[group.label]:!current[group.label]}))}><span>{group.label}</span><b>{collapsed[group.label]?"+":"−"}</b></button>{!collapsed[group.label]&&<div className="enterprise-items">{group.items.map(item=><button key={item.label} className={active===item.label?"active":""} onClick={()=>onNavigate(item.label)}><span className="enterprise-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</div>}</section>)}</nav>
    <footer>{companyName||"SAS Finance Group Ghana"}<br/>Private & confidential</footer>
  </aside>;
}

export function EmployeeProfileHeader({name,title,department,employeeNumber,photoUrl,onNavigate}:{name:string;title:string;department:string;employeeNumber:string;photoUrl?:string;onNavigate:(page:string)=>void}) {
  return <section className="employee-profile-header"><div className="employee-photo">{photoUrl?<img src={photoUrl} alt={name}/>:name.split(" ").map(part=>part[0]).slice(0,2).join("")}</div><div className="employee-profile-copy"><h1>{name}</h1><p>{title}{department?` · ${department}`:""}</p><small>{employeeNumber||"Employee profile"}</small><div className="employee-profile-tabs">{["My Profile","Attendance","Leave Management","Benefits","Onboarding & Training","Documents","Task Assignments"].map(tab=><button key={tab} onClick={()=>onNavigate(tab)}>{tab}</button>)}</div></div></section>;
}
