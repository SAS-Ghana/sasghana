"use client";

import { useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DashboardPage } from "./dashboard-page";
import { ModulePage } from "./module-page";
import { workspaceModules } from "./workspace-config";

const workspaceNav = ["Dashboard","Employees","Onboarding","Documents","Attendance","Leave","Performance","Assets","HR Requests","Announcements","Reports"];
const adminNav = ["Settings","Security & audit"];

export function PeopleDashboard({
  accessToken,profile,onLogout,onChangePassword,
}: {
  accessToken:string; profile:UserProfile; onLogout:()=>void; onChangePassword:()=>void;
}) {
  const [drawer,setDrawer]=useState(false);
  const [active,setActive]=useState("Dashboard");
  const [accountOpen,setAccountOpen]=useState(false);
  const [search,setSearch]=useState("");

  function navigate(page:string){setActive(page);setDrawer(false);setSearch("");}

  return <div className="app">
    <div className={`drawer-backdrop ${drawer?"open":""}`} onClick={()=>setDrawer(false)}/>
    <aside className={`sidebar ${drawer?"open":""}`} aria-label="Primary navigation">
      <div className="brand"><img src="/logo.png" width="56" height="40" alt="SAS Finance Group"/><div><strong>SAS People</strong><small>People operations</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav">{workspaceNav.map((label)=><button key={label} className={active===label?"active":""} onClick={()=>navigate(label)}><span className="nav-icon">{label.slice(0,1)}</span>{label}</button>)}</nav>
      <div className="nav-label">ADMINISTRATION</div>
      <nav className="nav">{adminNav.map((label)=><button key={label} className={active===label?"active":""} onClick={()=>navigate(label)}><span className="nav-icon">{label.slice(0,1)}</span>{label}</button>)}</nav>
      <div className="sidebar-footer">SAS Finance Group Ghana<br/>Private & confidential</div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="mobile-menu" aria-label="Open menu" onClick={()=>setDrawer(true)}>Menu</button>
        <input className="search" aria-label="Search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search employees, documents, requests..."/>
        <div className="profile">
          <button className="icon-btn" aria-label="Notifications" onClick={()=>navigate("Announcements")}>N</button>
          <button className="account-button" onClick={()=>setAccountOpen(value=>!value)} aria-expanded={accountOpen}><div className="avatar">{profile.display_name.slice(0,2).toUpperCase()}</div><div className="profile-copy"><strong>{profile.display_name}</strong><small className="muted">System Administrator</small></div></button>
          {accountOpen&&<div className="account-menu"><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}
        </div>
      </header>
      <div className="content">
        {active==="Dashboard" ? <DashboardPage accessToken={accessToken} profile={profile} onNavigate={navigate}/> :
          <ModulePage config={workspaceModules[active]} accessToken={accessToken} organisationId={profile.organisation_id} search={search}/>}
      </div>
    </main>
  </div>;
}
