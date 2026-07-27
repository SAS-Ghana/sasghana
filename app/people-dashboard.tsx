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
import { HRDashboard } from "./hr-dashboard";
import { HRSectionPage } from "./hr-section-page";

const blockedLabels=new Set(["Billing","Billings","Subscription","Subscriptions","Billing & Subscriptions","Plans & Billing"]);
const managerGroups=[
 ["OVERVIEW",[["Manager Dashboard","⌂"],["My Profile","●"]]],
 ["TEAM",[["My Team","♟"],["Team Attendance","◷"],["Leave Approvals","✓"],["Team Performance","★"],["Tasks","☑"]]],
 ["SCHEDULES",[["Shift & Schedules","▦"],["Team Calendar","▤"],["One to One Meetings","◉"]]],
 ["REQUESTS & APPROVALS",[["Employee Requests","⇄"],["Expense Approvals","¤"]]],
 ["PEOPLE DEVELOPMENT",[["Documents","◫"],["Learning & Development","↗"],["Recruitment & Onboarding","⌕"]]],
 ["ASSETS & COMMUNICATION",[["Assets","▣"],["Team Communication","✉"]]],
 ["INSIGHTS",[["Reports & Analytics","▥"],["Notifications","●"],["AI Manager Assistant","AI"]]],
] as const;
const hrGroups=[
 ["OVERVIEW",[["HR Dashboard","⌂"],["My Profile","●"]]],
 ["WORKFORCE",[["Employee Management","♟"],["Employee Directory","◎"],["Onboarding","↗"],["Offboarding","↘"]]],
 ["TIME & LEAVE",[["Attendance Management","◷"],["Leave Management","◴"]]],
 ["PAY & BENEFITS",[["Payroll Administration","▧"],["Benefits Administration","♡"],["Expense Management","¤"]]],
 ["TALENT",[["Recruitment","⌕"],["Performance Management","★"],["Learning & Development","▤"]]],
 ["DOCUMENTS & ASSETS",[["Documents & Templates","◫"],["Asset Management","▣"]]],
 ["EMPLOYEE RELATIONS",[["Employee Relations & Cases","!"],["Announcements & Communication","✉"],["HR Help Desk","?"]]],
 ["ORGANIZATION",[["Organization Structure","▦"],["Workflows & Approvals","⇄"]]],
 ["INSIGHTS & SETTINGS",[["Reports & Analytics","▥"],["Notifications","●"],["AI HR Assistant","AI"],["HR Settings","⚙"]]],
] as const;
const adminGroups=[
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
const aliases:Record<string,string>={"Leave Management":"Leave","Time Off Calendar":"Calendar","Performance Reviews":"Performance","1:1 Meetings":"Meetings","HR Reports & Analytics":"Reports","Advanced Reports":"Reports","Task Assignments":"Tasks","Onboarding & Training":"Onboarding","User Management":"User accounts","Audit Logs":"Security & audit","Backup & Restore":"Backups","My Profile":"Self-Service Hub"};

export function PeopleDashboard({accessToken,profile,onLogout,onChangePassword}:{accessToken:string;profile:UserProfile;onLogout:()=>void;onChangePassword:()=>void}){
 const [drawer,setDrawer]=useState(false),[active,setActive]=useState(profile.preferred_dashboard||"Dashboard"),[accountOpen,setAccountOpen]=useState(false),[search,setSearch]=useState(""),[notificationSettings,setNotificationSettings]=useState(false);
 const mainRef=useRef<HTMLElement>(null),accountRef=useRef<HTMLDivElement>(null);
 const accountType=(profile.account_type||"employee").toLowerCase();
 const isAdmin=profile.roles.includes("SAS System Administrator")||accountType==="administrator";
 const isHr=accountType==="hr"||profile.roles.some(role=>/human resources|\bhr\b/i.test(role));
 const isManager=accountType==="manager"||profile.roles.some(role=>/manager|supervisor|team lead/i.test(role));
 const isEmployeeOnly=!isAdmin&&!isHr&&!isManager&&accountType!=="auditor";
 const mode=isEmployeeOnly?"employee":isAdmin?"admin":isHr?"hr":isManager?"manager":"admin";
 const groups=mode==="hr"?hrGroups:mode==="manager"?managerGroups:adminGroups;
 const labels=new Set(groups.flatMap(([,items])=>items.map(([label])=>label)));
 const canAccess=(label:string)=>!blockedLabels.has(label)&&(mode==="employee"?(label==="Dashboard"||label==="My Profile"||label==="Self-Service Hub"):labels.has(label));
 function navigate(label:string){if(!canAccess(label))return;setActive(label);setDrawer(false);setSearch("");requestAnimationFrame(()=>mainRef.current?.scrollTo({top:0,behavior:"smooth"}));}
 useEffect(()=>{if(blockedLabels.has(active)||!canAccess(active))setActive(mode==="hr"?"HR Dashboard":mode==="manager"?"Manager Dashboard":"Dashboard");},[active,mode,profile.id]);
 useEffect(()=>{function closeAccount(event:PointerEvent){if(accountRef.current&&!accountRef.current.contains(event.target as Node))setAccountOpen(false);}document.addEventListener("pointerdown",closeAccount);return()=>document.removeEventListener("pointerdown",closeAccount);},[]);
 if(isEmployeeOnly)return <div className="app employee-app-shell"><main className="main employee-main" ref={mainRef}><div className="content employee-content"><EmployeeHome accessToken={accessToken} profile={profile} onNavigate={()=>undefined} onChangePassword={onChangePassword} onNotificationSettings={()=>setNotificationSettings(true)} onLogout={onLogout}/></div><ChatPopup accessToken={accessToken} profile={profile}/>{notificationSettings&&<NotificationSettings accessToken={accessToken} profile={profile} onClose={()=>setNotificationSettings(false)}/>}</main></div>;
 const route=aliases[active]||active,moduleConfig=workspaceModules[route];
 const renderContent=()=>{
  if(search.trim())return <GlobalSearch accessToken={accessToken} query={search} onNavigate={navigate} onClear={()=>setSearch("")}/>;
  if(mode==="hr"){
   if(active==="HR Dashboard")return <HRDashboard accessToken={accessToken} profile={profile} onNavigate={navigate}/>;
   if(active==="My Profile")return <EmployeeHome accessToken={accessToken} profile={profile} onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={()=>setNotificationSettings(true)} onLogout={onLogout}/>;
   if(active==="Employee Directory")return <PeopleDirectory accessToken={accessToken}/>;
   if(active==="Onboarding")return <OnboardingHub accessToken={accessToken} profile={profile}/>;
   if(active==="Attendance Management")return <AttendanceHub accessToken={accessToken}/>;
   if(active==="Performance Management")return <PerformanceHub accessToken={accessToken} profile={profile}/>;
   if(active==="Documents & Templates")return <DocumentStudio accessToken={accessToken} organisationId={profile.organisation_id}/>;
   if(active==="Organization Structure")return <DepartmentHub accessToken={accessToken} profile={profile}/>;
   if(active==="AI HR Assistant")return <section className="card data-panel"><span className="eyebrow">Human reviewed AI</span><h1>AI HR Assistant</h1><p className="muted">Generate job descriptions, summarize CVs, draft HR letters, search policies, identify trends, highlight attendance anomalies, summarize document expiry and recommend training. AI cannot independently hire, reject, discipline, promote, reduce pay or terminate employees.</p><div className="quick"><button><span>AI</span>Job description generator</button><button><span>AI</span>CV summary</button><button><span>AI</span>HR letter generator</button><button><span>AI</span>Workforce trend summary</button></div></section>;
   return <HRSectionPage label={active} accessToken={accessToken} organisationId={profile.organisation_id}/>;
  }
  if(mode==="manager")return active==="Manager Dashboard"?<ManagerDashboard accessToken={accessToken} profile={profile} onNavigate={navigate}/>:active==="My Profile"?<EmployeeHome accessToken={accessToken} profile={profile} onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={()=>setNotificationSettings(true)} onLogout={onLogout}/>:active==="My Team"?<TeamHub accessToken={accessToken}/>:active==="Team Performance"?<PerformanceHub accessToken={accessToken} profile={profile}/>:active==="Team Calendar"||active==="One to One Meetings"?<CalendarHub accessToken={accessToken} profile={profile}/>:<ManagerSectionPage label={active} accessToken={accessToken}/>;
  return route==="Dashboard"?<DashboardPage accessToken={accessToken} profile={profile} onNavigate={navigate}/>:active==="My Profile"||active==="Self-Service Hub"?<EmployeeHome accessToken={accessToken} profile={profile} onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={()=>setNotificationSettings(true)} onLogout={onLogout}/>:route==="Directory"?<PeopleDirectory accessToken={accessToken}/>:route==="Performance"?<PerformanceHub accessToken={accessToken} profile={profile}/>:route==="Calendar"?<CalendarHub accessToken={accessToken} profile={profile}/>:route==="Onboarding"?<OnboardingHub accessToken={accessToken} profile={profile}/>:route==="Departments"?<DepartmentHub accessToken={accessToken} profile={profile}/>:route==="User accounts"?<AccountManagementPage accessToken={accessToken}/>:route==="Backups"?<BackupCenter accessToken={accessToken} profile={profile}/>:route==="Attendance"?<AttendanceHub accessToken={accessToken}/>:route==="Security & audit"?<AuditHub accessToken={accessToken}/>:route==="Settings"?<SettingsConfigurationPage accessToken={accessToken} organisationId={profile.organisation_id}/>:moduleConfig?<ModulePage config={moduleConfig} accessToken={accessToken} organisationId={profile.organisation_id} search={search}/>:<section className="card"><h2>Access unavailable</h2><p>This page is not configured for your role.</p></section>;
 };
 return <div className="app"><div className={`drawer-backdrop ${drawer?"open":""}`} onClick={()=>setDrawer(false)}/><aside className={`sidebar ${drawer?"open":""}`} aria-label="Primary navigation"><div className="brand"><img src="/logo.png" width="56" height="40" alt="SAS Finance Group"/><div><strong>SAS People</strong><small>{mode==="hr"?"HR administration":mode==="manager"?"Manager workspace":"People operations"}</small></div></div>{groups.map(([group,items])=><div key={group}><div className="nav-label">{group}</div><nav className="nav">{items.filter(([label])=>canAccess(label)).map(([label,icon])=><button key={label} className={active===label?"active":""} onClick={()=>navigate(label)}><span className="nav-icon">{icon}</span>{label}</button>)}</nav></div>)}<div className="sidebar-footer">SAS Finance Group Ghana<br/>Private & confidential</div></aside><main className="main" ref={mainRef}><header className="topbar"><button className="mobile-menu" onClick={()=>setDrawer(true)}>Menu</button><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={mode==="hr"?"Search HR workspace...":mode==="manager"?"Search your team workspace...":"Search your authorised workspace..."}/><div className="profile" ref={accountRef}><NotificationCenter accessToken={accessToken} profile={profile}/><button className="account-button" onClick={()=>setAccountOpen(v=>!v)}><div className="avatar">{profile.display_name.slice(0,2).toUpperCase()}</div><div className="profile-copy"><strong>{profile.display_name}</strong><small>{profile.roles[0]??profile.account_type}</small></div></button>{accountOpen&&<div className="account-menu"><button onClick={()=>navigate("My Profile")}>My profile</button><button onClick={()=>setNotificationSettings(true)}>Notification settings</button><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}</div></header><div className="content">{renderContent()}</div><ChatPopup accessToken={accessToken} profile={profile}/>{notificationSettings&&<NotificationSettings accessToken={accessToken} profile={profile} onClose={()=>setNotificationSettings(false)}/>}</main></div>;
}