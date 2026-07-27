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

const groups=[
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
  ["SYSTEM",[["Audit Logs","▤"],["Backup & Restore","↻"],["Billings & Subscriptions","¤"],["Settings","⚙"]]],
] as const;

const aliases:Record<string,string>={"Leave Management":"Leave","Time Off Calendar":"Calendar","Performance Reviews":"Performance","1:1 Meetings":"Meetings","Recruitment":"Hiring","HR Reports & Analytics":"Reports","Advanced Reports":"Reports","Task Assignments":"Tasks","Onboarding & Training":"Onboarding","User Management":"User accounts","Audit Logs":"Security & audit","Backup & Restore":"Backups","My Profile":"Self-Service Hub"};
const pagePermissions:Record<string,string[]>={Employees:["employees.view_all","employees.view_department","employees.view_team","employees.view_self"],Onboarding:["onboarding.manage","onboarding.assign","onboarding.review"],Documents:["documents.upload","documents.verify","documents.download"],Attendance:["attendance.manage","attendance.approve","attendance.clock_self"],Leave:["leave.manage","leave.approve"],Performance:["performance.manage","performance.review_team","performance.view_self"],Assets:["assets.manage"],Tasks:["tasks.manage"],Payroll:["payroll.manage","payroll.view_self"],Hiring:["hiring.manage","hiring.view"],Benefits:["benefits.manage","benefits.view_self"],Compensation:["compensation.manage"],Reports:["reports.view"],"User accounts":["users.manage"],Branches:["settings.manage"],Departments:["departments.manage"],Settings:["settings.manage","documents.verify"],"Security & audit":["audit.view","security.manage"],Directory:["directory.view"],Calendar:["calendar.view","calendar.manage"]};

export function PeopleDashboard({accessToken,profile,onLogout,onChangePassword}:{accessToken:string;profile:UserProfile;onLogout:()=>void;onChangePassword:()=>void}){
  const [drawer,setDrawer]=useState(false),[active,setActive]=useState(profile.preferred_dashboard||"Dashboard"),[accountOpen,setAccountOpen]=useState(false),[search,setSearch]=useState(""),[notificationSettings,setNotificationSettings]=useState(false);
  const mainRef=useRef<HTMLElement>(null),accountRef=useRef<HTMLDivElement>(null);
  const isAdmin=profile.roles.includes("SAS System Administrator")||profile.account_type==="administrator";
  const isPeopleLeader=isAdmin||["hr","manager","auditor"].includes(profile.account_type);
  const canAccess=(label:string)=>{const page=aliases[label]||label;if(label==="Billings & Subscriptions")return isAdmin;if(label==="My Profile"||label==="Self-Service Hub")return profile.self_service_enabled!==false;if(isAdmin)return true;const required=pagePermissions[page];return !required||required.some(permission=>profile.permissions.includes(permission))||profile.dashboard_access.includes(label)||profile.dashboard_access.includes(page);};
  function navigate(label:string){setActive(label);setDrawer(false);setSearch("");requestAnimationFrame(()=>mainRef.current?.scrollTo({top:0,behavior:"smooth"}));}
  useEffect(()=>{function closeAccount(event:PointerEvent){if(accountRef.current&&!accountRef.current.contains(event.target as Node))setAccountOpen(false);}document.addEventListener("pointerdown",closeAccount);return()=>document.removeEventListener("pointerdown",closeAccount);},[]);
  const route=aliases[active]||active;
  return <div className="app"><div className={`drawer-backdrop ${drawer?"open":""}`} onClick={()=>setDrawer(false)}/><aside className={`sidebar ${drawer?"open":""}`} aria-label="Primary navigation"><div className="brand"><img src="/logo.png" width="56" height="40" alt="SAS Finance Group"/><div><strong>SAS People</strong><small>People operations</small></div></div>{groups.map(([group,items])=>{const visible=items.filter(([label])=>canAccess(label));return visible.length?<div key={group}><div className="nav-label">{group}</div><nav className="nav">{visible.map(([label,icon])=><button key={label} className={active===label?"active":""} onClick={()=>navigate(label)}><span className="nav-icon">{icon}</span>{label}</button>)}</nav></div>:null;})}<div className="sidebar-footer">SAS Finance Group Ghana<br/>Private & confidential</div></aside>
    <main className="main" ref={mainRef}><header className="topbar"><button className="mobile-menu" onClick={()=>setDrawer(true)}>Menu</button><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employees, documents, requests..."/><div className="profile" ref={accountRef}><NotificationCenter accessToken={accessToken} profile={profile}/><button className="account-button" onClick={()=>setAccountOpen(v=>!v)}><div className="avatar">{profile.display_name.slice(0,2).toUpperCase()}</div><div className="profile-copy"><strong>{profile.display_name}</strong><small>{profile.roles[0]??profile.account_type}</small></div></button>{accountOpen&&<div className="account-menu"><button onClick={()=>navigate("My Profile")}>My profile</button><button onClick={()=>setNotificationSettings(true)}>Notification settings</button><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}</div></header><div className="content">{search.trim()?<GlobalSearch accessToken={accessToken} query={search} onNavigate={navigate} onClear={()=>setSearch("")}/>:
      route==="Dashboard"?(isPeopleLeader?<DashboardPage accessToken={accessToken} profile={profile} onNavigate={navigate}/>:<EmployeeHome accessToken={accessToken} profile={profile} onNavigate={navigate}/>):
      active==="My Profile"||active==="Self-Service Hub"?<EmployeeHome accessToken={accessToken} profile={profile} onNavigate={navigate}/>:route==="Directory"?<PeopleDirectory accessToken={accessToken}/>:route==="Performance"?<PerformanceHub accessToken={accessToken} profile={profile}/>:route==="Calendar"?<CalendarHub accessToken={accessToken} profile={profile}/>:route==="Onboarding"?<OnboardingHub accessToken={accessToken} profile={profile}/>:route==="Departments"?<DepartmentHub accessToken={accessToken} profile={profile}/>:route==="Employees"&&profile.account_type==="manager"?<TeamHub accessToken={accessToken}/>:route==="User accounts"?<AccountManagementPage accessToken={accessToken}/>:route==="Backups"?<BackupCenter accessToken={accessToken} profile={profile}/>:route==="Attendance"?<AttendanceHub accessToken={accessToken}/>:route==="Security & audit"?<AuditHub accessToken={accessToken}/>:route==="Settings"?<SettingsConfigurationPage accessToken={accessToken} organisationId={profile.organisation_id}/>:route==="Document Studio"?<DocumentStudio accessToken={accessToken} organisationId={profile.organisation_id}/>:<ModulePage config={workspaceModules[route]} accessToken={accessToken} organisationId={profile.organisation_id} search={search}/>}</div><ChatPopup accessToken={accessToken} profile={profile}/>{notificationSettings&&<NotificationSettings accessToken={accessToken} profile={profile} onClose={()=>setNotificationSettings(false)}/>}</main></div>;
}
