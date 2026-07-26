"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DashboardPage } from "./dashboard-page";
import { ModulePage } from "./module-page";
import { workspaceModules } from "./workspace-config";
import { AccountManagementPage } from "./account-management-page";
import { ChatPopup } from "./realtime-chat";
import { NotificationSettings } from "./notification-settings";
import { NotificationCenter } from "./notification-center";
import { DocumentStudio } from "./document-studio";
import { GlobalSearch } from "./global-search";

const workspaceNav = ["Dashboard","Employees","Hiring","Candidates","Onboarding","Onboarding media","Documents","Document Studio","Attendance","Leave","Performance","Assets","Tasks","Payroll","Benefits","Compensation","HR Requests","Announcements","Community","Meetings","Policies","Reports"];
const adminNav = ["User accounts","Branches","Backups","Settings","Security & audit"];

const pagePermissions: Record<string,string[]> = {
  Employees:["employees.view_all","employees.view_department","employees.view_team","employees.view_self"],
  Onboarding:["onboarding.manage","onboarding.assign","onboarding.review"],
  Documents:["documents.upload","documents.verify","documents.download"],
  "Document Studio":["documents.verify"],
  Attendance:["attendance.manage","attendance.approve"],
  Leave:["leave.manage","leave.approve"],
  Performance:["performance.manage","performance.review_team"],
  Assets:["assets.manage"],
  Tasks:["tasks.manage"],
  Payroll:["payroll.manage","payroll.view_self"],
  Hiring:["hiring.manage","hiring.view"],
  Candidates:["hiring.manage"],
  "Onboarding media":["onboarding.manage"],
  Benefits:["benefits.manage","benefits.view_self"],
  Compensation:["compensation.manage"],
  Community:["community.manage","community.view"],
  Meetings:["meetings.manage","meetings.view"],
  Backups:["backups.manage"],
  Reports:["reports.view"],
  "User accounts":["users.manage"],
  Branches:["settings.manage"],
  Settings:["settings.manage"],
  "Security & audit":["audit.view","security.manage"],
};

export function PeopleDashboard({
  accessToken,profile,onLogout,onChangePassword,
}: {
  accessToken:string; profile:UserProfile; onLogout:()=>void; onChangePassword:()=>void;
}) {
  const [drawer,setDrawer]=useState(false);
  const [active,setActive]=useState("Dashboard");
  const [accountOpen,setAccountOpen]=useState(false);
  const [search,setSearch]=useState("");
  const [notificationSettings,setNotificationSettings]=useState(false);
  const mainRef=useRef<HTMLElement>(null);
  const accountRef=useRef<HTMLDivElement>(null);
  const isAdmin=profile.roles.includes("SAS System Administrator")||profile.account_type==="administrator";
  const canAccess=(page:string)=>isAdmin||page==="Dashboard"||!pagePermissions[page]||pagePermissions[page].some(permission=>profile.permissions.includes(permission))||profile.dashboard_access.includes(page);
  const availableWorkspace=workspaceNav.filter(canAccess);
  const availableAdmin=adminNav.filter(canAccess);
  const primaryRole=profile.roles[0]??profile.account_type;

  function navigate(page:string){setActive(page);setDrawer(false);setSearch("");requestAnimationFrame(()=>mainRef.current?.scrollTo({top:0,behavior:"smooth"}));}
  useEffect(()=>{function closeAccount(event:PointerEvent){if(accountRef.current&&!accountRef.current.contains(event.target as Node))setAccountOpen(false);}document.addEventListener("pointerdown",closeAccount);return()=>document.removeEventListener("pointerdown",closeAccount);},[]);

  return <div className="app">
    <div className={`drawer-backdrop ${drawer?"open":""}`} onClick={()=>setDrawer(false)}/>
    <aside className={`sidebar ${drawer?"open":""}`} aria-label="Primary navigation">
      <div className="brand"><img src="/logo.png" width="56" height="40" alt="SAS Finance Group"/><div><strong>SAS People</strong><small>People operations</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav">{availableWorkspace.map((label)=><button key={label} className={active===label?"active":""} onClick={()=>navigate(label)}><span className="nav-icon">{label.slice(0,1)}</span>{label}</button>)}</nav>
      {availableAdmin.length>0&&<><div className="nav-label">ADMINISTRATION</div>
      <nav className="nav">{availableAdmin.map((label)=><button key={label} className={active===label?"active":""} onClick={()=>navigate(label)}><span className="nav-icon">{label.slice(0,1)}</span>{label}</button>)}</nav></>}
      <div className="sidebar-footer">SAS Finance Group Ghana<br/>Private & confidential</div>
    </aside>
    <main className="main" ref={mainRef}>
      <header className="topbar">
        <button className="mobile-menu" aria-label="Open menu" onClick={()=>setDrawer(true)}>Menu</button>
        <input className="search" aria-label="Search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search employees, documents, requests..."/>
        <div className="profile" ref={accountRef}>
          <NotificationCenter accessToken={accessToken} profile={profile}/>
          <button className="account-button" onClick={()=>setAccountOpen(value=>!value)} aria-expanded={accountOpen}><div className="avatar">{profile.display_name.slice(0,2).toUpperCase()}</div><div className="profile-copy"><strong>{profile.display_name}</strong><small className="muted">{primaryRole.replaceAll("_"," ")}</small></div></button>
          {accountOpen&&<div className="account-menu"><button onClick={()=>{setNotificationSettings(true);setAccountOpen(false);}}>Notification settings</button><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}
        </div>
      </header>
      <div className="content">
        {search.trim() ? <GlobalSearch accessToken={accessToken} query={search} onNavigate={navigate} onClear={()=>setSearch("")}/> :
          active==="Dashboard" ? <DashboardPage accessToken={accessToken} profile={profile} onNavigate={navigate}/> :
          active==="User accounts" ? <AccountManagementPage accessToken={accessToken}/> :
          active==="Document Studio" ? <DocumentStudio accessToken={accessToken} organisationId={profile.organisation_id}/> :
          <ModulePage config={workspaceModules[active]} accessToken={accessToken} organisationId={profile.organisation_id} search={search}/>}
      </div>
      <ChatPopup accessToken={accessToken} profile={profile}/>
      {notificationSettings&&<NotificationSettings accessToken={accessToken} profile={profile} onClose={()=>setNotificationSettings(false)}/>}
    </main>
  </div>;
}
