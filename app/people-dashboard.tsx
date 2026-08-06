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
import { LiveAttendancePage } from "./live-attendance-page";
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
  ["OVERVIEW", [["Manager Dashboard", "⌂"], ["My Profile", "●"]]],
  ["PEOPLE", [["My Team", "♟"], ["Recruitment & Onboarding", "⌕"], ["Employee Requests", "!"]]],
  ["LEAVE MANAGEMENT", [["Team Attendance", "◷"], ["Leave Approvals", "✓"], ["Shift & Schedules", "▤"], ["Meetings & Calendar", "▤"]]],
  ["PERFORMANCE", [["Tasks", "☑"], ["Learning & Development", "▤"], ["One to One Meetings", "♟"]]],
  ["OPERATIONS", [["Expense Approvals", "¤"], ["Documents", "◫"], ["Assets", "▣"]]],
  ["ENGAGEMENT", [["Team Communication", "✉"], ["Notifications", "●"]]],
  ["SYSTEM", [["Reports & Analytics", "▥"], ["AI Manager Assistant", "✦"]]],
] as const;

const hrGroups = [
  ["OVERVIEW", [["HR Dashboard", "⌂"], ["My Profile", "●"]]],
  ["PEOPLE", [["Employee Management", "♟"], ["Recruitment", "⌕"], ["Onboarding", "↗"], ["Offboarding", "↘"], ["Organization Structure", "▦"]]],
  ["LEAVE MANAGEMENT", [["Attendance Management", "◷"], ["Live Attendance", "◷"], ["Leave Management", "◴"], ["Meetings & Calendar", "▤"]]],
  ["PERFORMANCE", [["Learning & Development", "▤"]]],
  ["OPERATIONS", [["Payroll Administration", "▧"], ["Expense Management", "¤"], ["Benefits Administration", "♡"], ["Documents & Templates", "◫"], ["Asset Management", "▣"]]],
  ["ENGAGEMENT", [["Announcements & Communication", "✉"], ["Employee Relations & Cases", "!"], ["HR Help Desk", "?"]]],
  ["SYSTEM", [["Reports & Analytics", "▥"], ["Workflows & Approvals", "⇄"], ["Notifications", "●"], ["AI HR Assistant", "✦"], ["Profile Requests", "✎"]]],
] as const;

const adminGroups = [
  ["OVERVIEW", [["Administrator Dashboard", "⌂"], ["My Profile", "●"]]],
  ["ACCESS CONTROL", [["User & Account Management", "♟"], ["Roles & Permissions", "⚿"], ["Profile Requests", "✎"]]],
  ["WORKFORCE", [["Employee Management", "◎"], ["Organization Structure", "▦"]]],
  ["TIME & LEAVE", [["Attendance Management", "◷"], ["Live Attendance", "◷"], ["Leave Management", "◴"], ["Meetings & Calendar", "▤"]]],
  ["TALENT", [["Recruitment", "⌕"], ["Onboarding", "↗"], ["Offboarding", "↘"], ["Performance Management", "★"], ["Learning & Development", "▤"]]],
  ["PAYROLL & PEOPLE SERVICES", [["Payroll & Payslips", "▧"], ["Expenses", "¤"], ["Benefits", "♡"]]],
  ["DOCUMENTS & ASSETS", [["Documents & Templates", "◫"], ["Book Library", "📚"], ["Asset Management", "▣"]]],
  ["EMPLOYEE RELATIONS", [["Employee Relations & Cases", "!"], ["Communication", "✉"], ["Help Desk & Support", "?"]]],
  ["CONTROL & INSIGHTS", [["Reports & Analytics", "▥"], ["Approval Workflows", "⇄"], ["Notifications", "●"]]],
  ["SYSTEM", [["Settings Centre", "⚙"], ["Audit Logs", "▤"], ["Import & Export", "⇅"]]],
] as const;

const employeeGroups = [
  ["", [
    ["Home", "⌂"],
    ["My Info", "●"],
    ["People", "♟"],
    ["Time Off", "◴"],
    ["Performance", "★"],
    ["Payroll", "▧"],
    ["Benefits", "♡"],
    ["Documents", "◫"],
    ["Training", "▤"],
    ["Recruitment", "⌕"],
    ["Assets", "▣"],
    ["Calendar", "▤"],
    ["Requests", "⇄"],
    ["Reports", "▥"],
    ["Support", "?"],
    ["Settings", "⚙"],
  ]],
] as const;
const employeeQuickLabels = ["Ask"] as const;

// Maps HR/Manager sidebar labels to the "Dashboard access" checkbox values an admin actually grants
// per user in account-management-page.tsx's AccessDialog. A label with no entry here has no matching
// dashboard-access concept yet and stays visible (fail open) rather than being silently hidden.
const dashboardAccessMap: Record<string, readonly string[]> = {
  "HR Dashboard": ["Dashboard"], "Manager Dashboard": ["Dashboard"],
  "My Profile": ["My Profile"],
  "Employee Management": ["Employees"], "My Team": ["Directory", "Employees"],
  "Recruitment": ["Hiring"], "Recruitment & Onboarding": ["Hiring", "Onboarding"],
  "Attendance Management": ["Attendance"], "Team Attendance": ["Attendance"],
  "Leave Management": ["Leave"], "Leave Approvals": ["Leave"],
  "Payroll Administration": ["Payroll"],
  "Reports & Analytics": ["Reports"],
  "Onboarding": ["Onboarding"], "Offboarding": ["Onboarding"],
  "Benefits Administration": ["Benefits"],
  "Documents & Templates": ["Documents"], "Documents": ["Documents"],
  "Asset Management": ["Assets"], "Assets": ["Assets"],
  "Announcements & Communication": ["Announcements", "Community"], "Team Communication": ["Community"],
  "Organization Structure": ["Directory"],
  "Meetings & Calendar": ["Meetings"], "One to One Meetings": ["Meetings"],
  "Employee Requests": ["HR Requests"],
  "Profile Requests": ["Profile Requests"],
};

// Dashboard-access enforcement is scoped to HR/Manager, whose stored access already matches their
// current menus (verified live). Employee accounts' dashboard_access predates the current sidebar
// structure (e.g. only ["My Profile"] stored today) and would wipe most of the employee sidebar if
// enforced the same way, so employee mode stays ungated for now.
function hasDashboardAccess(mode: string, label: string, granted: string[]): boolean {
  if (mode !== "hr" && mode !== "manager") return true;
  const mapped = dashboardAccessMap[label];
  if (!mapped) return true;
  return mapped.some((option) => granted.includes(option));
}

type GroupSet = typeof managerGroups | typeof hrGroups | typeof adminGroups | typeof employeeGroups;

export function PeopleDashboard({ accessToken, profile, onLogout, onChangePassword }: { accessToken: string; profile: UserProfile; onLogout: () => void; onChangePassword: () => void }) {
  const [drawer, setDrawer] = useState(false);
  const [active, setActive] = useState(profile.preferred_dashboard || "Dashboard");
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notificationSettings, setNotificationSettings] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const accountType = (profile.account_type || "employee").toLowerCase();
  const isAdmin = profile.roles.includes("SAS System Administrator") || accountType === "administrator";
  const isHr = accountType === "hr" || profile.roles.some((role) => /human resources|\bhr\b/i.test(role));
  const isManager = accountType === "manager" || profile.roles.some((role) => /manager|supervisor|team lead/i.test(role));
  const isEmployeeOnly = !isAdmin && !isHr && !isManager && accountType !== "auditor";
  const mode = isEmployeeOnly ? "employee" : isAdmin ? "admin" : isHr ? "hr" : isManager ? "manager" : "admin";
  const { counts, markModuleSeen } = useDashboardModuleCounts(accessToken, profile, mode === "employee" ? "hr" : mode);
  const baseGroups: GroupSet = mode === "admin" ? adminGroups : mode === "hr" ? hrGroups : mode === "employee" ? employeeGroups : managerGroups;
  const labels = new Set<string>([...baseGroups.flatMap(([, items]) => items.map(([label]) => label)), ...(mode === "employee" ? employeeQuickLabels : [])]);
  const libraryGranted = mode !== "admin" && Boolean(profile.dashboard_access?.includes("Book Library"));
  // Document Studio is normally only reachable for admin/hr (see render() below), but any user
  // explicitly granted the documents.verify permission (via Roles & Permissions / Edit access) can
  // also reach it regardless of mode -- this is what makes "admin can give that access to other
  // users" actually true, since the permission-grant mechanism already existed but the page wasn't
  // reachable outside the two hardcoded modes.
  const documentStudioGranted = mode !== "admin" && mode !== "hr" && profile.permissions.includes("documents.verify");
  // Live Attendance is visible to Admin/HR by default (it's a literal entry in their nav groups
  // above); Managers only see it once explicitly granted, mirroring how Book Library/Document Studio
  // extras already work -- granted extras aren't part of baseGroups, so both the sidebar injection
  // and canAccess need their own explicit check for it.
  const liveAttendanceGranted = mode === "manager" && Boolean(profile.dashboard_access?.includes("Live Attendance"));
  const extraGroups: (readonly [string, readonly (readonly [string, string])[]])[] = [];
  if (libraryGranted && mode !== "employee") extraGroups.push(["LIBRARY", [["Book Library", "📚"]]] as const);
  if (documentStudioGranted && mode === "manager") extraGroups.push(["DOCUMENTS", [["Documents & Templates", "◫"]]] as const);
  if (liveAttendanceGranted) extraGroups.push(["ATTENDANCE", [["Live Attendance", "◷"]]] as const);
  const groups: readonly (readonly [string, readonly (readonly [string, string])[]])[] = extraGroups.length ? [...baseGroups, ...extraGroups] : baseGroups;
  const home = mode === "admin" ? "Administrator Dashboard" : mode === "hr" ? "HR Dashboard" : mode === "manager" ? "Manager Dashboard" : "Home";
  const granted = profile.dashboard_access ?? [];
  const canAccess = (label: string) => !forbidden.test(label) && (labels.has(label) || (label === "Book Library" && libraryGranted) || (label === "Documents & Templates" && documentStudioGranted) || (label === "Live Attendance" && liveAttendanceGranted)) && (label === home || hasDashboardAccess(mode, label, granted));

  function navigate(label: string) {
    if (!canAccess(label)) return;
    markModuleSeen(label);
    setActive(label);
    setDrawer(false);
    setSearch("");
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  useEffect(() => { if (forbidden.test(active) || !canAccess(active)) setActive(home); }, [active, home, profile.id]);
  useEffect(() => { function close(event: PointerEvent) { if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false); } document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, []);
  useEffect(() => { const expired = () => onLogout(); window.addEventListener("sas-session-expired", expired); return () => window.removeEventListener("sas-session-expired", expired); }, [onLogout]);

  const render = () => {
    if (search.trim()) return <GlobalSearch accessToken={accessToken} query={search} onNavigate={navigate} onClear={() => setSearch("")} />;
    if (active === "Meetings & Calendar") return <CalendarHub accessToken={accessToken} profile={profile} />;
    if (active === "AI Manager Assistant") return <AiAssistantPage role="manager" />;
    if (active === "AI HR Assistant") return <AiAssistantPage role="hr" />;
    if (active === "Book Library") return <BookLibraryPage accessToken={accessToken} organisationId={profile.organisation_id} profile={profile} />;
    if (active === "Profile Requests") return <ProfileRequestsPage accessToken={accessToken} />;
    if (active === "Documents & Templates" && documentStudioGranted) return <DocumentStudio accessToken={accessToken} organisationId={profile.organisation_id} />;
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
      if (active === "Live Attendance") return <LiveAttendancePage accessToken={accessToken} profile={profile} />;
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
      if (active === "Live Attendance") return <LiveAttendancePage accessToken={accessToken} profile={profile} />;
      if (active === "Performance Management") return <PerformanceHub accessToken={accessToken} profile={profile} />;
      if (active === "Documents & Templates") return <DocumentStudio accessToken={accessToken} organisationId={profile.organisation_id} />;
      if (active === "Organization Structure") return <DepartmentHub accessToken={accessToken} profile={profile} />;
      if (active === "Workflows & Approvals") return <ApprovalWorkflowsPage accessToken={accessToken} organisationId={profile.organisation_id} scope="hr" />;
      return <HRSectionPage label={active} accessToken={accessToken} organisationId={profile.organisation_id} />;
    }

    if (active === "Manager Dashboard") return <ManagerDashboard accessToken={accessToken} profile={profile} onNavigate={navigate} />;
    if (active === "My Profile") return <EmployeeHome accessToken={accessToken} profile={profile} activeSection="My Info" onNavigate={navigate} onChangePassword={onChangePassword} onNotificationSettings={() => setNotificationSettings(true)} onLogout={onLogout} />;
    if (active === "My Team") return <TeamHub accessToken={accessToken} />;
    if (active === "Live Attendance") return <LiveAttendancePage accessToken={accessToken} profile={profile} />;
    if (active === "Team Performance") return <PerformanceHub accessToken={accessToken} profile={profile} />;
    if (active === "One to One Meetings") return <CalendarHub accessToken={accessToken} profile={profile} />;
    return <ManagerSectionPage label={active} accessToken={accessToken} profile={profile} />;
  };

  return <div className={`app ${mode === "employee" ? "employee-app" : ""}`}>
    <div className={`drawer-backdrop ${drawer ? "open" : ""}`} onClick={() => setDrawer(false)} />
    <aside className={`sidebar ${drawer ? "open" : ""}`} aria-label="Primary navigation">
      <div className="brand"><img src="/logo.png" width="160" height="45" alt="SAS Finance Group" /><small>{mode === "admin" ? "Organization control" : mode === "hr" ? "HR administration" : mode === "employee" ? "Employee workspace" : "Manager workspace"}</small></div>
      {groups.map(([group, items]) => <div key={group}>{group && <div className="nav-label">{group}</div>}<nav className="nav">{items.filter(([label]) => canAccess(label)).map(([label]) => { const count = counts[label] ?? 0; return <button type="button" key={label} className={active === label ? "active" : ""} onClick={() => navigate(label)}><span className="nav-icon"><MenuIcon name={moduleIcon(label)} /></span><span className="nav-text">{label}</span>{count > 0 && <span className="module-count" aria-label={`${count} new items`}>{count > 99 ? "99+" : count}</span>}</button>; })}</nav></div>)}
      <div className="sidebar-footer">SAS Finance Group Ghana<br />Private & confidential</div>
      {mode === "employee" && <div className="sidebar-account" ref={accountRef}>
        <button type="button" className="sidebar-avatar-btn" onClick={() => setAccountOpen((value) => !value)} aria-label="Account menu"><div className="avatar">{profile.display_name.slice(0, 2).toUpperCase()}</div></button>
        <button type="button" className="sidebar-hamburger-btn" onClick={() => setAccountOpen((value) => !value)} aria-label="More account options"><MenuIcon name="settings" /></button>
        {accountOpen && <div className="account-menu sidebar-account-menu"><button onClick={() => navigate("My Info")}>My profile</button><button onClick={() => setNotificationSettings(true)}>Notification settings</button><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}
      </div>}
    </aside>
    <main className="main" ref={mainRef}>
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setDrawer(true)} aria-label="Open navigation"><span aria-hidden="true">☰</span></button>
        <div className="search-wrap"><MenuIcon name="search" /><input className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "admin" ? "Search organization administration..." : mode === "hr" ? "Search HR workspace..." : mode === "employee" ? "Search..." : "Search your team workspace..."} /></div>
        {mode === "employee" && <div className="topbar-quick-actions">
          <button type="button" className="topbar-icon-btn" onClick={() => navigate("Help")} aria-label="Help centre"><MenuIcon name="help" /></button>
          <button type="button" className="topbar-icon-btn" onClick={() => navigate("Settings")} aria-label="Settings"><MenuIcon name="settings" /></button>
          <button type="button" className="ask-button" onClick={() => navigate("Ask")}><MenuIcon name="message" />Ask</button>
        </div>}
        <div className="profile" ref={mode === "employee" ? undefined : accountRef}>
          <NotificationCenter accessToken={accessToken} profile={profile} />
          {mode !== "employee" && <button className="account-button" onClick={() => setAccountOpen((value) => !value)}><div className="avatar">{profile.display_name.slice(0, 2).toUpperCase()}</div><div className="profile-copy"><strong>{profile.display_name}</strong><small>{profile.roles[0] ?? profile.account_type}</small></div></button>}
          {mode !== "employee" && accountOpen && <div className="account-menu"><button onClick={() => navigate("My Profile")}>My profile</button><button onClick={() => setNotificationSettings(true)}>Notification settings</button><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}
        </div>
      </header>
      <div className="content">{render()}</div>
      <ChatPopup accessToken={accessToken} profile={profile} />
      {notificationSettings && <NotificationSettings accessToken={accessToken} profile={profile} onClose={() => setNotificationSettings(false)} />}
    </main>
  </div>;
}
