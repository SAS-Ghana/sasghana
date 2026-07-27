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
import { EmployeeHome } from "./employee-home";
import { PeopleDirectory } from "./people-directory";
import { PerformanceHub } from "./performance-hub";
import { CalendarHub } from "./calendar-hub";
import { OnboardingHub } from "./onboarding-hub";
import { DepartmentHub } from "./department-hub";
import { TeamHub } from "./team-hub";
import { BackupCenter } from "./backup-center";
import { AttendanceHub } from "./attendance-hub";
import { AuditHub } from "./audit-hub";
import { SettingsConfigurationPage } from "./settings-configuration-page";
import { ManagerDashboard } from "./manager-dashboard";
import { ManagerSectionPage } from "./manager-section-page";

const adminHrGroups=[
  ["OVERVIEW",[["Dashboard","⌂"],["My Profile","●"],["Self-Service Hub","◎"]]],
  ["ORGANIZATION",[["Branches","⌖"],["Departments","▦"]]],
  ["ASSETS",[["Assets","▣"],["Asset Categories","◫"]]],
  ["TIME & ATTENDANCE",[["Leave Management","◴"],["Time Off Calendar","▤"],["Attendance","◷"],["OT & Expenses","↗"]]],
  ["COMPENSATION",[["Compensation","¤"],["Pay Grades","▥"],["Financial Years","◫"],["Payroll","▧"],["Tax Configuration","%"],["Benefits","♡"]]],
  ["PERFORMANCE",[["Performance Reviews","★"],["Goals & OKRs","◎"],["360° Feedback","⟳"],["1:1 Meetings","◉"]]],
  ["OPERATIONS",[["Workflows & Approvals","⇄"],["Automation & Workflows","⚙"],["Recruitment","⌕"],["Disciplinary","!"],["HR Reports & Analytics","▥"],["Advanced Reports","▦"],["Labour Act Compliance","✓"],["Task Assignments","☑"],["Global Hiring Apps","⌘"]]],
  ["DEVELOPMENT",[["Onboarding & Training","↗"]]],
  ["ENGAGEMENT",[["Surveys & Feedback","◌"],["Engagement Analytics","▤"],["Announcements","◫"],["Messages","✉"]]],
  ["PEOPLE",[["Employees","♟"],["User Management","⚙"],["Profile Requests","↺"]]],
  ["SYSTEM",[["Audit Logs","▤"],["Backup & Restore","↻"],["Settings","⚙"]]],
] as const;

const managerGroups=[
  ["OVERVIEW",[["Manager Dashboard","⌂"],["My Profile","●"]]],
  ["TEAM",[["My Team","♟"],["Team Attendance","◷"],["Leave Approvals","✓"],["Team Performance","★"],["Tasks","☑"]]],
  ["SCHEDULES",[["Shift & Schedules","▦"],["Team Calendar","▤"],["One to One Meetings","◉"]]],
  ["REQUESTS & APPROVALS",[["Employee Requests","⇄"],["Expense Approvals","¤"]]],
  ["PEOPLE DEVELOPMENT",[["Documents","◫"],["Learning & Development","↗"],["Recruitment & Onboarding","⌕"]]],
  ["ASSETS & COMMUNICATION",[["Assets","▣"],["Team Communication","✉"]]],
  ["INSIGHTS",[["Reports & Analytics","▥"],["Notifications","●"],["AI Manager Assistant","AI"]]],
] as const;

const aliases:Record<string,string>={"Leave Management":"Leave","Time Off Calendar":"Calendar","Performance Reviews":"Performance","1:1 Meetings":"Meetings","Recruitment":"Hiring","HR Reports & Analytics":"Reports","Advanced Reports":"Reports","Task Assignments":"Tasks","Onboarding & Training":"Onboarding","User Management":"User accounts","Audit Logs":"Security & audit","Backup & Restore":"Backups","My Profile":"Self-Service Hub"};
const hrPages=new Set(adminHrGroups.flatMap(([,items])=>items.map(([label])=>label)).filter(label=>!["Audit Logs","Backup & Restore","Settings"].includes(label)));
const adminOnlyPages=new Set(["Audit Logs","Backup & Restore","Settings"]);
const permanentlyDisabledPages=new Set(["Billing","Billings","Subscription","Subscriptions","Billing & Subscriptions","Plans & Billing"]);
const pagePermissions:Record<string,string[]>={Employees:["employees.view_all","employees.view_department","employees.view_team","employees.view_self"],Onboarding:["onboarding.manage","onboarding.assign","onboarding.review"],Attendance:["attendance.manage","attendance.approve","attendance.clock_self"],Leave:["leave.manage","leave.approve","leave.view_self"],Performance:["performance.manage","performance.review_team","performance.view_self"],Assets:["assets.manage","assets.view_assigned"],Tasks:["tasks.manage","tasks.view_self"],Payroll:["payroll.manage","payroll.view_self"],Hiring:["hiring.manage","hiring.view"],Benefits:["benefits.manage","benefits.view_self"],Compensation:["compensation.manage"],Reports:["reports.view"],"User accounts":["users.manage"],Branches:["settings.manage"],Departments:["departments.manage","departments.view"],Settings:["settings.manage"],"Security & audit":["audit.view","security.manage"],Calendar:["calendar.view","calendar.manage"]};

export function PeopleDashboard({accessToken,profile,onLogout,onChangePassword}:{accessToken:string;profile:UserProfile;onLogout:()=>void;onChangePassword:()=>void}){
  const [drawer,setDrawer]=useState(false),[active,setActive]=useState(profile.preferred_dashboard||"Dashboard"),[accountOpen,setAccountOpen]=useState(false),[search,setSearch]=useState(""),[notificationSettings,setNotificationSettings]=useState(false);
  const mainRef=useRef<HTMLElement>(null),accountRef=useRef<HTMLDivElement>(null);
  const accountType=(profile.account_type||"employee").toLowerCase();
  const isAdmin=profile.roles.includes("SAS System Administrator")||accountType==="administrator";
  const isHr=accountType==="hr"||profile.roles.some(role=>/human resources|\bhr\b/i.test(role));
  const isManager=accountType==="manager"||profile.roles.some(role=>/manager|supervisor|team lead/i.test(role));
  const isEmployeeOnly=!isAdmin&&!isHr&&!isManager&&accountType!=="auditor";
  const isPeopleLeader=!isEmployeeOnly;
  const managerLabels=new Set(managerGroups.flatMap(([,items])=>items.map(([label])=>label)));

  const canAccess=(label:string)=>{
    const normalized=aliases[label]||label;
    if(permanentlyDisabledPages.has(label)||permanentlyDisabledPages.has(normalized))return false;
    if(isEmployeeOnly)return label==="Dashboard"||label==="My Profile"||label==="Self-Service Hub";
    if(isManager&&!isHr&&!isAdmin)return managerLabels.has(label);
    if(label==="My Profile"||label==="Self-Service Hub")return profile.self_service_enabled!==false;
    if(isAdmin)return true;
    if(adminOnlyPages.has(label))return false;
    if(!hrPages.has(label))return false;
    const required=pagePermissions[normalized];
    return !required||required.some(permission=>profile.permissions.includes(permission))||profile.dashboard_access.includes(label)||profile.dashboard_access.includes(normalized);
  };

  function navigate(label:string){if(!canAccess(label))return;setActive(label);setDrawer(false);setSearch("");requestAnimationFrame(()=>mainRef.current?.scrollTo({top:0,behavior:"smooth"}));}
  useEffect(()=>{if(permanentlyDisabledPages.has(active))setActive(isManager&&!isHr&&!isAdmin?"Manager Dashboard":"Dashboard");else if(isManager&&!isHr&&!isAdmin&&!managerLabels.has(active))setActive("Manager Dashboard");else if(!canAccess(active))setActive("Dashboard");},[active,profile.id]);
  useEffect(()=>{function closeAccount(event:PointerEvent){if(accountRef.current&&!accountRef.current.contains(event.target as Node))setAccountOpen(false);}document.addEventListener("pointerdown",closeAccount);return()=>document.removeEventListener("pointerdown",closeAccount);},[]);

  if(isEmployeeOnly){return <div className="app employee-app-shell"><main className="main employee-main" ref={mainRef}><div className="content employee-content"><EmployeeHome accessToken={accessToken} profile={profile} onNavigate={()=>undefined} onChangePassword={onChangePassword} onNotificationSettings={()=>setNotificationSettings(true)} onLogout={onLogout}/></div><ChatPopup accessToken={accessToken} profile={profile}/>{notificationSettings&&<NotificationSettings accessToken={accessToken} profile={profile} onClose={()=>setNotificationSettings(false)}/>}</main></div>}

  const groups=isManager&&!isHr&&!isAdmin?managerGroups:adminHrGroups;
  const route=aliases[active]||active;const moduleConfig=workspaceModules[route];
  const managerContent=isManager&&!isHr&&!isAdmin;
  return <div className="app"><div className={`drawer-backdrop ${drawer?"open":""}`} onClick={()=>setDrawer(false)}/><aside className={`sidebar ${drawer?"open":""}`} aria-label="Primary navigation"><div className="brand"><img src="/logo.png" width="56" height="40" alt="SAS Finance Group"/><div><strong>SAS People</strong><small>{managerContent?"Manager workspace":"People operations"}</small></div></div>{groups.map(([group,items])=>{const visible=items.filter(([label])=>canAccess(label));return visible.length?<div key={group}><div className="nav-label">{group}</div><nav className="nav">{visible.map(([label,icon])=><button key={label} className={active===label?"active":""} onClick={()=>navigate(label)}><span className="nav-icon">{icon}</span>{label}</button>)}</nav></div>:null;})}<div className="sidebar-footer">SAS Finance Group Ghana<br/>Private & confidential</div></aside>
    <main className="main" ref={mainRef}><header className="topbar"><button className="mobile-menu" onClick={()=>setDrawer(true)}>Menu</button><input className="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={managerContent?"Search your authorised team workspace...":"Search your authorised workspace..."}/><div className="profile" ref={accountRef}><NotificationCenter accessToken={accessToken} profile={profile}/><button className="account-button" onClick={()=>setAccountOpen(value=>!value)}><div className="avatar">{profile.display_name.slice(0,2).toUpperCase()}</div><div className="profile-copy"><strong>{profile.display_name}</strong><small>{profile.roles[0]??profile.account_type}</small></div></button>{accountOpen&&<div className="account-menu"><button onClick={()=>navigate("My Profile")}>My profile</button><button onClick={()=>setNotificationSettings(true)}>Notification settings</button><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}</div></header><div className="content">{search.trim()?<GlobalSearch accessToken={accessToken} query={search} onNavigate={navigate} onClear={()=>setSearch("")}/>:managerContent?(active==="Manager Dashboard"?<ManagerDashboard accessToken={accessToken} profile={profile} onNavigate={navigate}/>:active==="My Profile"?<EmployeeHome accessToken={accessToken} profile={profile} onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={()=>setNotificationSettings(true)} onLogout={onLogout}/>:active==="My Team"?<TeamHub accessToken={accessToken}/>:active==="Team Performance"?<PerformanceHub accessToken={accessToken} profile={profile}/>:active==="Team Calendar"||active==="One to One Meetings"?<CalendarHub accessToken={accessToken} profile={profile}/>:active==="AI Manager Assistant"?<section className="card data-panel"><span className="eyebrow">Human reviewed AI</span><h1>AI Manager Assistant</h1><p className="muted">Use AI for team summaries, attendance risk alerts, leave conflict checks, goal suggestions, review writing, meeting summaries, training recommendations, workload analysis and policy search. AI never makes final employment decisions.</p><div className="quick"><button><span>AI</span>Team performance summary</button><button><span>AI</span>Leave conflict detection</button><button><span>AI</span>Review writing assistance</button><button><span>AI</span>Workload analysis</button></div></section>:<ManagerSectionPage label={active} accessToken={accessToken}/>):route==="Dashboard"?(isPeopleLeader?<DashboardPage accessToken={accessToken} profile={profile} onNavigate={navigate}/>:<EmployeeHome accessToken={accessToken} profile={profile} onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={()=>setNotificationSettings(true)} onLogout={onLogout}/>):active==="My Profile"||active==="Self-Service Hub"?<EmployeeHome accessToken={accessToken} profile={profile} onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={()=>setNotificationSettings(true)} onLogout={onLogout}/>:route==="Directory"?<PeopleDirectory accessToken={accessToken}/>:route==="Performance"?<PerformanceHub accessToken={accessToken} profile={profile}/>:route==="Calendar"?<CalendarHub accessToken={accessToken} profile={profile}/>:route==="Onboarding"?<OnboardingHub accessToken={accessToken} profile={profile}/>:route==="Departments"?<DepartmentHub accessToken={accessToken} profile={profile}/>:route==="User accounts"?<AccountManagementPage accessToken={accessToken}/>:route==="Backups"?<BackupCenter accessToken={accessToken} profile={profile}/>:route==="Attendance"?<AttendanceHub accessToken={accessToken}/>:route==="Security & audit"?<AuditHub accessToken={accessToken}/>:route==="Settings"?<SettingsConfigurationPage accessToken={accessToken} organisationId={profile.organisation_id}/>:route==="Document Studio"?<DocumentStudio accessToken={accessToken} organisationId={profile.organisation_id}/>:moduleConfig?<ModulePage config={moduleConfig} accessToken={accessToken} organisationId={profile.organisation_id} search={search}/>:<section className="card"><h2>Access unavailable</h2><p>This page is not configured for your role.</p></section>}</div><ChatPopup accessToken={accessToken} profile={profile}/>{notificationSettings&&<NotificationSettings accessToken={accessToken} profile={profile} onClose={()=>setNotificationSettings(false)}/>}</main></div>;
}