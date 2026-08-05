"use client";

import "./theme-fixes.css";
import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { ChatPopup } from "./realtime-chat";
import { NotificationSettings } from "./notification-settings";
import { NotificationCenter } from "./notification-center";
import { GlobalSearch } from "./global-search";
import { EmployeeHome } from "./employee-home";
import { PeopleDirectory } from "./people-directory";
import { PerformanceHub } from "./performance-hub";
import { CalendarHub } from "./calendar-hub";
import { OnboardingHub } from "./onboarding-hub";
import { DepartmentHub } from "./department-hub";
import { TeamHub } from "./team-hub";
import { AttendanceHub } from "./attendance-hub";
import { AuditHub } from "./audit-hub";
import { SettingsConfigurationPage } from "./settings-configuration-page";
import { DocumentStudio } from "./document-studio";
import { AccountManagementPage } from "./account-management-page";
import { ManagerDashboard } from "./manager-dashboard";
import { ManagerSectionPage } from "./manager-section-page";
import { HRDashboard } from "./hr-dashboard";
import { HRSectionPage } from "./hr-section-page";
import { AdminDashboard } from "./admin-dashboard";
import { AdminSectionPage, ImportExportPage } from "./admin-section-page";
import { BookLibraryPage } from "./book-library-page";
import { ProfileRequestsPage } from "./profile-requests-page";
import { ApprovalWorkflowsPage } from "./approval-workflows-page";
import { PayrollSettingsPage } from "./payroll-settings-page";
import { AiAssistantPage } from "./ai-assistant-page";
import { ExpenseManagementPage } from "./expense-management-page";
import { AssetManagementWorkspace } from "./asset-management-workspace";
import { useDashboardModuleCounts } from "./module-counters";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

const forbidden = /billing|billings|subscription|subscriptions|pricing|invoice|renewal|payment|paystack|stripe|license purchase|upgrade plan|trial management|credit card/i;

const managerGroups = [
  ["", [["Manager Dashboard", "⌂"], ["My Profile", "●"], ["My Team", "♟"], ["Team Attendance", "◷"], ["Leave Approvals", "✓"], ["Tasks", "☑"], ["Reports & Analytics", "▥"]]],
] as const;
const managerMoreLabels = ["Meetings & Calendar", "Shift & Schedules", "One to One Meetings", "Employee Requests", "Expense Approvals", "Documents", "Learning & Development", "Recruitment & Onboarding", "Assets", "Team Communication", "Notifications", "AI Manager Assistant"] as const;

const hrGroups = [
  ["", [["HR Dashboard", "⌂"], ["My Profile", "●"], ["Employee Management", "♟"], ["Recruitment", "⌕"], ["Attendance Management", "◷"], ["Leave Management", "◴"], ["Payroll Administration", "▧"], ["Reports & Analytics", "▥"]]],
] as const;
const hrMoreLabels = ["Onboarding", "Offboarding", "Learning & Development", "Benefits Administration", "Expense Management", "Documents & Templates", "Asset Management", "Employee Relations & Cases", "Announcements & Communication", "HR Help Desk", "Organization Structure", "Workflows & Approvals", "Meetings & Calendar", "Notifications", "AI HR Assistant", "Profile Requests"] as const;

const adminGroups = [
  ["OVERVIEW", [["Administrator Dashboard", "⌂"], ["My Profile", "●"]]],
  ["ACCESS CONTROL", [["User & Account Management", "♟"], ["Roles & Permissions", "⚿"], ["Profile Requests", "✎"]]],
  ["WORKFORCE", [["Employee Management", "◎"], ["Organization Structure", "▦"]]],
  ["TIME & LEAVE", [["Attendance Management", "◷"], ["Leave Management", "◴"], ["Meetings & Calendar", "▤"]]],
  ["TALENT", [["Recruitment", "⌕"], ["Onboarding", "↗"], ["Offboarding", "↘"], ["Performance Management", "★"], ["Learning & Development", "▤"]]],
  ["PAYROLL & PEOPLE SERVICES", [["Payroll & Payslips", "▧"], ["Expenses", "¤"], ["Benefits", "♡"]]],
  ["DOCUMENTS & ASSETS", [["Documents & Templates", "◫"], ["Book Library", "📚"], ["Asset Management", "▣"]]],
  ["EMPLOYEE RELATIONS", [["Employee Relations & Cases", "!"], ["Communication", "✉"], ["Help Desk & Support", "?"]]],
  ["CONTROL & INSIGHTS", [["Reports & Analytics", "▥"], ["Approval Workflows", "⇄"], ["Notifications", "●"]]],
  ["SYSTEM", [["Settings Centre", "⚙"], ["Audit Logs", "▤"], ["Import & Export", "⇅"]]],
] as const;

const employeeGroups = [
  ["", [["Home", "⌂"], ["My Info", "●"], ["People", "♟"], ["Hiring", "⌕"], ["Reports", "▥"], ["Files", "▤"], ["Payroll", "▧"]]],
] as const;

type GroupSet = typeof managerGroups | typeof hrGroups | typeof adminGroups | typeof employeeGroups;

export function PeopleDashboard({ accessToken, profile, onLogout, onChangePassword }: { accessToken: string; profile: UserProfile; onLogout: () => void; onChangePassword: () => void }) {
  const [drawer, setDrawer] = useState(false);
  const [active, setActive] = useState(profile.preferred_dashboard || "Dashboard");
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notificationSettings, setNotificationSettings] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const accountType = (profile.account_type || "employee").toLowerCase();
  const isAdmin = profile.roles.includes("SAS System Administrator") || accountType === "administrator";
  const isHr = accountType === "hr" || profile.roles.some((role) => /human resources|\bhr\b/i.test(role));
  const isManager = accountType === "manager" || profile.roles.some((role) => /manager|supervisor|team lead/i.test(role));
  const isEmployeeOnly = !isAdmin && !isHr && !isManager && accountType !== "auditor";
  const mode = isEmployeeOnly ? "employee" : isAdmin ? "admin" : isHr ? "hr" : isManager ? "manager" : "admin";
  const { counts, markModuleSeen } = useDashboardModuleCounts(accessToken, profile, mode === "employee" ? "hr" : mode);
  const baseGroups: GroupSet = mode === "admin" ? adminGroups : mode === "hr" ? hrGroups : mode === "employee" ? employeeGroups : managerGroups;
  const moreLabels: readonly string[] = mode === "hr" ? hrMoreLabels : mode === "manager" ? managerMoreLabels : [];
  const labels = new Set([...baseGroups.flatMap(([, items]) => items.map(([label]) => label)), ...moreLabels]);
  const libraryGranted = mode !== "admin" && Boolean(profile.dashboard_access?.includes("Book Library"));
  const groups: readonly (readonly [string, readonly (readonly [string, string])[]])[] = libraryGranted && mode !== "employee"
    ? [...baseGroups, ["LIBRARY", [["Book Library", "📚"]]] as const]
    : baseGroups;
  const home = mode === "admin" ? "Administrator Dashboard" : mode === "hr" ? "HR Dashboard" : mode === "manager" ? "Manager Dashboard" : "Home";
  const canAccess = (label: string) => !forbidden.test(label) && (labels.has(label) || (label === "Book Library" && libraryGranted));

  function navigate(label: string) {
    if (!canAccess(label)) return;
    markModuleSeen(label);
    setActive(label);
    setDrawer(false);
    setSearch("");
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  useEffect(() => { if (forbidden.test(active) || !canAccess(active)) setActive(home); }, [active, home, profile.id]);
  useEffect(() => { function close(event: PointerEvent) { if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false); if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false); } document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, []);
  useEffect(() => { const expired = () => onLogout(); window.addEventListener("sas-session-expired", expired); return () => window.removeEventListener("sas-session-expired", expired); }, [onLogout]);

  const render = () => {
    if (search.trim()) return <GlobalSearch accessToken={accessToken} query={search} onNavigate={navigate} onClear={() => setSearch("")} />;
    if (active === "Meetings & Calendar") return <CalendarHub accessToken={accessToken} profile={profile} />;
    if (active === "AI Manager Assistant") return <AiAssistantPage role="manager" />;
    if (active === "AI HR Assistant") return <AiAssistantPage role="hr" />;
    if (active === "Book Library") return <BookLibraryPage accessToken={accessToken} organisationId={profile.organisation_id} profile={profile} />;
    if (active === "Profile Requests") return <ProfileRequestsPage accessToken={accessToken} />;
    if (mode === "employee") return <EmployeeHome accessToken={accessToken} profile={profile} activeSection={active} onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={() => setNotificationSettings(true)} onLogout={onLogout} />;

    if (mode === "admin") {
      if (active === "Administrator Dashboard") return <AdminDashboard accessToken={accessToken} profile={profile} onNavigate={navigate} />;
      if (active === "My Profile") return <EmployeeHome accessToken={accessToken} profile={profile} activeSection="My Info" onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={() => setNotificationSettings(true)} onLogout={onLogout} />;
      if (active === "User & Account Management") return <AccountManagementPage accessToken={accessToken} />;
      if (active === "Employee Management") return <PeopleDirectory accessToken={accessToken} canManage organisationId={profile.organisation_id} />;
      if (active === "Payroll & Payslips") return <PayrollSettingsPage accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Expenses") return <ExpenseManagementPage accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Asset Management") return <AssetManagementWorkspace accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Organization Structure") return <DepartmentHub accessToken={accessToken} profile={profile} />;
      if (active === "Attendance Management") return <AttendanceHub accessToken={accessToken} />;
      if (active === "Onboarding") return <OnboardingHub accessToken={accessToken} profile={profile} />;
      if (active === "Performance Management") return <PerformanceHub accessToken={accessToken} profile={profile} />;
      if (active === "Documents & Templates") return <DocumentStudio accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Approval Workflows") return <ApprovalWorkflowsPage accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Settings Centre") return <SettingsConfigurationPage accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Audit Logs") return <AuditHub accessToken={accessToken} />;
      if (active === "Import & Export") return <ImportExportPage accessToken={accessToken} organisationId={profile.organisation_id} />;
      return <AdminSectionPage label={active} accessToken={accessToken} organisationId={profile.organisation_id} />;
    }

    if (mode === "hr") {
      if (active === "HR Dashboard") return <HRDashboard accessToken={accessToken} profile={profile} onNavigate={navigate} />;
      if (active === "My Profile") return <EmployeeHome accessToken={accessToken} profile={profile} activeSection="My Info" onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={() => setNotificationSettings(true)} onLogout={onLogout} />;
      if (active === "Employee Directory") return <PeopleDirectory accessToken={accessToken} />;
      if (active === "Employee Management") return <PeopleDirectory accessToken={accessToken} canManage organisationId={profile.organisation_id} />;
      if (active === "Payroll Administration") return <PayrollSettingsPage accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Expense Management") return <ExpenseManagementPage accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Asset Management") return <AssetManagementWorkspace accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Onboarding") return <OnboardingHub accessToken={accessToken} profile={profile} />;
      if (active === "Attendance Management") return <AttendanceHub accessToken={accessToken} />;
      if (active === "Performance Management") return <PerformanceHub accessToken={accessToken} profile={profile} />;
      if (active === "Documents & Templates") return <DocumentStudio accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Organization Structure") return <DepartmentHub accessToken={accessToken} profile={profile} />;
      if (active === "Workflows & Approvals") return <ApprovalWorkflowsPage accessToken={accessToken} organisationId={profile.organisation_id} scope="hr" />;
      return <HRSectionPage label={active} accessToken={accessToken} organisationId={profile.organisation_id} />;
    }

    if (active === "Manager Dashboard") return <ManagerDashboard accessToken={accessToken} profile={profile} onNavigate={navigate} />;
    if (active === "My Profile") return <EmployeeHome accessToken={accessToken} profile={profile} activeSection="My Info" onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={() => setNotificationSettings(true)} onLogout={onLogout} />;
    if (active === "My Team") return <TeamHub accessToken={accessToken} />;
    if (active === "Team Performance") return <PerformanceHub accessToken={accessToken} profile={profile} />;
    if (active === "One to One Meetings") return <CalendarHub accessToken={accessToken} profile={profile} />;
    return <ManagerSectionPage label={active} accessToken={accessToken} profile={profile} />;
  };

  return <div className="app">
    <div className={`drawer-backdrop ${drawer ? "open" : ""}`} onClick={() => setDrawer(false)} />
    <aside className={`sidebar ${drawer ? "open" : ""} ${mode === "employee" ? "sidebar-light" : ""}`} aria-label="Primary navigation">
      <div className="brand"><img src="/logo.png" width="56" height="40" alt="SAS Finance Group" /><div><strong>SAS People</strong><small>{mode === "admin" ? "Organization control" : mode === "hr" ? "HR administration" : mode === "employee" ? "Employee workspace" : "Manager workspace"}</small></div></div>
      {groups.map(([group, items]) => <div key={group}>{group && <div className="nav-label">{group}</div>}<nav className="nav">{items.filter(([label]) => canAccess(label)).map(([label]) => { const count = counts[label] ?? 0; return <button type="button" key={label} className={active === label ? "active" : ""} onClick={() => navigate(label)}><span className="nav-icon"><MenuIcon name={moduleIcon(label)} /></span><span className="nav-text">{label}</span>{count > 0 && <span className="module-count" aria-label={`${count} new items`}>{count > 99 ? "99+" : count}</span>}</button>; })}</nav></div>)}
      {moreLabels.length > 0 && <div className="more-menu-wrap sidebar-more" ref={moreRef}>
        <nav className="nav"><button type="button" className={moreLabels.includes(active) ? "active" : ""} onClick={() => setMoreOpen((value) => !value)}><span className="nav-icon"><MenuIcon name="settings" /></span><span className="nav-text">More</span></button></nav>
        {moreOpen && <div className="account-menu more-menu">{moreLabels.filter((label) => canAccess(label)).map((label) => <button type="button" key={label} onClick={() => { navigate(label); setMoreOpen(false); }}>{label}</button>)}</div>}
      </div>}
      <div className="sidebar-footer">SAS Finance Group Ghana<br />Private & confidential</div>
    </aside>
    <main className="main" ref={mainRef}>
      <header className="topbar"><button className="mobile-menu" onClick={() => setDrawer(true)} aria-label="Open navigation"><span aria-hidden="true">☰</span></button><input className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "admin" ? "Search organization administration..." : mode === "hr" ? "Search HR workspace..." : mode === "employee" ? "Search your workspace..." : "Search your team workspace..."} /><div className="profile" ref={accountRef}><NotificationCenter accessToken={accessToken} profile={profile} /><button className="account-button" onClick={() => setAccountOpen((value) => !value)}><div className="avatar">{profile.display_name.slice(0, 2).toUpperCase()}</div><div className="profile-copy"><strong>{profile.display_name}</strong><small>{profile.roles[0] ?? profile.account_type}</small></div></button>{accountOpen && <div className="account-menu"><button onClick={() => navigate("My Profile")}>My profile</button><button onClick={() => setNotificationSettings(true)}>Notification settings</button><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}</div></header>
      <div className="content">{render()}</div>
      <ChatPopup accessToken={accessToken} profile={profile} />
      {notificationSettings && <NotificationSettings accessToken={accessToken} profile={profile} onClose={() => setNotificationSettings(false)} />}
    </main>
  </div>;
}
