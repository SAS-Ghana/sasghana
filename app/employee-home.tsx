import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { callRpc, createRow, createSignedStorageUrl, DataRow, listRows, listRowsWhere } from "./lib/supabase-data";
import { loadAttendancePolicy, runAttendanceAction } from "./quick-attendance";
import { BookLibraryPage, libraryAccess } from "./book-library-page";
import { PeopleDirectory } from "./people-directory";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type Tab = "dashboard" | "profile" | "people" | "attendance" | "leave" | "payroll" | "documents" | "performance" | "learning" | "tasks" | "expenses" | "assets" | "benefits" | "recruitment" | "communication" | "calendar" | "help" | "notifications" | "analytics" | "settings" | "ai" | "library";
type Dataset = Record<string, DataRow[]> & { employee: DataRow[] };
type EmployeeHomeProps = { accessToken: string; profile: UserProfile; activeSection?: string; onNavigate: (page: string) => void; onChangePassword?: () => void; onNotificationSettings?: () => void; onLogout?: () => void };

const sectionTab: Record<string, Tab> = { "Home": "dashboard", "My Info": "profile", "People": "people", "Hiring": "recruitment", "Reports": "analytics", "Files": "documents", "Payroll": "payroll" };
const infoTabs: [Tab, string][] = [["profile", "Personal"], ["leave", "Time Off"], ["payroll", "Pay Info"], ["documents", "Documents"], ["performance", "Performance"], ["attendance", "Timesheet"]];
const moreItems: [Tab, string][] = [["learning", "Learning & Development"], ["tasks", "Tasks"], ["expenses", "Expenses"], ["assets", "Assets"], ["benefits", "Benefits"], ["communication", "Comms"], ["calendar", "Calendar"], ["help", "Help Center"], ["notifications", "Notifications"], ["settings", "Settings"], ["ai", "AI Assistant"]];

const empty: Dataset = {
  employee: [], attendance: [], leave: [], payroll: [], documents: [], performance: [], goals: [], learning: [], tasks: [], expenses: [],
  assets: [], assetRequests: [], benefits: [], jobs: [], applications: [], announcements: [], messages: [], meetings: [], holidays: [], tickets: [],
  notifications: [], requests: [], awards: [], history: [], preferences: [],
};

export function EmployeeHome({ accessToken, profile, activeSection = "Home", onChangePassword, onNotificationSettings, onLogout }: EmployeeHomeProps) {
  const canOpenLibrary = libraryAccess(profile).canView;
  const moreEntries = canOpenLibrary ? [...moreItems, ["library", "Book Library"] as [Tab, string]] : moreItems;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);
  const [data, setData] = useState<Dataset>(empty);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"leave" | "expense" | "asset" | "ticket" | "profile" | "transfer" | null>(null);
  const [now, setNow] = useState(Date.now());
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("Ask about leave, payroll, attendance, policies, training or career development.");

  useEffect(() => { setTab(sectionTab[activeSection] ?? "dashboard"); setMoreOpen(false); }, [activeSection]);

  const load = useCallback(async () => {
    setError("");
    const employeeId = profile.employee_id;
    if (!employeeId) {
      setData(empty);
      return;
    }

    const issues: string[] = [];
    const own = async (table: string, key = "employee_id", limit = 500) => {
      try {
        return await listRowsWhere(accessToken, table, { [key]: employeeId }, "*", limit);
      } catch (cause) {
        issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`);
        return [];
      }
    };
    const organisation = async (table: string, limit = 200) => {
      try {
        return await listRows(accessToken, table, "*", limit);
      } catch (cause) {
        issues.push(`${table}: ${cause instanceof Error ? cause.message : "query failed"}`);
        return [];
      }
    };

    const [employee, attendance, leave, payroll, documents, performance, goals, learning, tasks, expenses, assets, assetRequests, benefits, jobs, applications, announcements, messages, meetings, holidays, tickets, notifications, requests, awards, history, preferences] = await Promise.all([
      listRowsWhere(accessToken, "employees", { id: employeeId }, "*", 1).catch((cause) => { issues.push(`employees: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }),
      own("attendance_records"), own("leave_requests"), own("payroll_records"), own("employee_documents"), own("performance_reviews"), own("employee_goals"),
      own("employee_training"), own("tasks", "assigned_to_employee_id"), own("expense_claims"), own("assets", "assigned_employee_id"), own("asset_requests"),
      own("employee_benefits"), organisation("job_openings", 100), own("internal_job_applications"), organisation("announcements", 100), own("messages", "recipient_employee_id"),
      organisation("meetings", 100), organisation("company_holidays", 100), own("support_tickets"),
      listRowsWhere(accessToken, "notifications", { recipient_id: profile.id }, "*", 500).catch((cause) => { issues.push(`notifications: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }),
      own("employee_change_requests"), own("employee_awards"), own("employment_history"),
      listRowsWhere(accessToken, "user_preferences", { profile_id: profile.id }, "*", 1).catch((cause) => { issues.push(`user_preferences: ${cause instanceof Error ? cause.message : "query failed"}`); return []; }),
    ]);

    setData({ employee, attendance, leave, payroll, documents, performance, goals, learning, tasks, expenses, assets, assetRequests, benefits, jobs, applications, announcements, messages, meetings, holidays, tickets, notifications, requests, awards, history, preferences });
    if (issues.length) setError(`Some employee modules could not be refreshed. ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · ${issues.length - 3} more` : ""}`);
  }, [accessToken, profile.employee_id, profile.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("sas-data-changed", refresh);
    return () => window.removeEventListener("sas-data-changed", refresh);
  }, [load]);

  const employee = data.employee[0] ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = data.attendance.find((row) => String(row.attendance_date) === today);
  const clockedIn = Boolean(todayRecord?.clock_in && !todayRecord?.clock_out);
  const onBreak = Boolean(todayRecord?.break_in && !todayRecord?.break_out);
  const liveSeconds = clockedIn ? Math.max(0, Math.floor((now - new Date(String(todayRecord?.clock_in)).getTime()) / 1000)) : 0;
  const liveTime = `${String(Math.floor(liveSeconds / 3600)).padStart(2, "0")}:${String(Math.floor(liveSeconds % 3600 / 60)).padStart(2, "0")}:${String(liveSeconds % 60).padStart(2, "0")}`;
  const workedHours = useMemo(() => data.attendance.reduce((sum, row) => row.clock_in && row.clock_out ? sum + (new Date(String(row.clock_out)).getTime() - new Date(String(row.clock_in)).getTime()) / 3600000 : sum, 0), [data.attendance]);
  const attendanceRate = data.attendance.length ? Math.round(data.attendance.filter((row) => ["present", "late", "remote", "travel"].includes(String(row.status))).length / data.attendance.length * 100) : 0;
  const overtime = data.attendance.reduce((sum, row) => sum + Number(row.overtime_hours ?? Number(row.overtime_minutes ?? 0) / 60), 0);
  const leaveBalance = Number(employee?.annual_leave_balance ?? employee?.leave_balance ?? 0);
  const unread = data.notifications.filter((row) => !Boolean(row.is_read) && !row.archived_at).length;
  const pending = data.leave.filter((row) => ["draft", "pending"].includes(String(row.status))).length +
    data.expenses.filter((row) => ["draft", "submitted", "returned", "manager_approved", "hr_approved", "finance_review"].includes(String(row.status))).length +
    data.assetRequests.filter((row) => ["pending", "manager_review", "hr_review", "approved"].includes(String(row.status))).length +
    data.requests.filter((row) => ["draft", "pending", "submitted"].includes(String(row.status))).length;
  const openTasks = data.tasks.filter((row) => !["completed", "cancelled", "closed"].includes(String(row.status))).length;
  const performanceScore = Number(data.performance[0]?.rating ?? data.performance[0]?.score ?? 0);
  const firstName = String(employee?.preferred_name || employee?.first_name || profile.display_name.split(" ")[0]);

  async function attendanceAction(action: "clock_in" | "clock_out" | "break_in" | "break_out") {
    if (!profile.employee_id) return setError("HR must link your login to an employee record first.");
    setBusy(action); setError(""); setNotice("");
    try {
      const policy = await loadAttendancePolicy(accessToken);
      await runAttendanceAction(accessToken, action, policy, action.replaceAll("_", " "));
      await load();
      setNotice(`${action.replace("_", " ")} saved successfully.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Attendance action failed.");
    } finally { setBusy(""); }
  }

  function askAi(event: FormEvent) {
    event.preventDefault();
    const q = aiQuestion.toLowerCase();
    let answer = "I could not find a direct answer. Submit an HR support ticket for a verified response.";
    if (q.includes("leave")) answer = `You currently have ${leaveBalance} leave days recorded and ${pending} pending self-service request(s). Use Leave to apply and track approval.`;
    else if (q.includes("pay") || q.includes("salary")) answer = `Your payroll workspace contains ${data.payroll.length} authorised payslip record(s). Your profile salary is ${money(employee?.monthly_salary ?? employee?.basic_salary)} monthly where configured.`;
    else if (q.includes("attendance") || q.includes("late") || q.includes("overtime")) answer = `Your attendance rate is ${attendanceRate}% with ${workedHours.toFixed(1)} recorded hours and ${overtime.toFixed(1)} overtime hours.`;
    else if (q.includes("training") || q.includes("course")) answer = `You have ${data.learning.length} assigned training record(s). Open Learning for progress and due dates.`;
    else if (q.includes("career") || q.includes("promotion")) answer = `There are ${data.jobs.filter((row) => ["open", "published"].includes(String(row.status))).length} open internal vacancies.`;
    else if (q.includes("policy") || q.includes("document")) answer = `You have ${data.documents.length} employee document(s) available.`;
    setAiAnswer(answer);
  }

  return <section className="employee-portal-v2">
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}
    {!profile.employee_id && <article className="card data-panel"><h2>Employee record not linked</h2><p>Ask HR to link this login to an employee record. Personal modules remain protected until linking is complete.</p></article>}

    {activeSection === "Home" && <header className="page-header"><div><span className="eyebrow">Employee self service</span><h1>Welcome, {firstName}</h1><p className="muted">{employee?.position_title || profile.job_title || "Employee"} · {employee?.department_name || "Your department"} · {new Date(now).toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p></div></header>}

    {activeSection === "My Info" && <nav className="segmented employee-info-tabs" aria-label="My Info sections">
      {infoTabs.map(([id, label]) => <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setMoreOpen(false); }}>{label}</button>)}
      <div className="more-menu-wrap">
        <button type="button" className={moreEntries.some(([id]) => id === tab) ? "active" : ""} onClick={() => setMoreOpen((value) => !value)}>More</button>
        {moreOpen && <div className="account-menu more-menu">{moreEntries.map(([id, label]) => <button type="button" key={id} onClick={() => { setTab(id); setMoreOpen(false); }}>{label}</button>)}</div>}
      </div>
    </nav>}

    {tab === "dashboard" && <DashboardOverview employee={employee} data={data} metrics={{ leaveBalance, pending, attendanceRate, overtime, openTasks, unread, performanceScore }} liveTime={liveTime} clockedIn={clockedIn} onBreak={onBreak} busy={busy} onAction={attendanceAction} onTab={setTab} onAskAi={() => setTab("ai")} />}
    {tab === "people" && <PeopleDirectory accessToken={accessToken} organisationId={profile.organisation_id} canManage={false} />}
    {tab === "profile" && <ProfilePage employee={employee} history={data.history} onRequest={() => setModal("profile")} accessToken={accessToken} />}
    {tab === "attendance" && <AttendancePage rows={data.attendance} liveTime={liveTime} clockedIn={clockedIn} onBreak={onBreak} busy={busy} onAction={attendanceAction} rate={attendanceRate} hours={workedHours} overtime={overtime} />}
    {tab === "leave" && <LeavePage rows={data.leave} holidays={data.holidays} balance={leaveBalance} onApply={() => setModal("leave")} />}
    {tab === "payroll" && <PayrollPage rows={data.payroll} employee={employee} />}
    {tab === "documents" && <DocumentsPage rows={data.documents} />}
    {tab === "performance" && <PerformancePage reviews={data.performance} goals={data.goals} awards={data.awards} />}
    {tab === "learning" && <LearningPage rows={data.learning} />}
    {tab === "tasks" && <RecordPage title="My tasks" subtitle="Assignments, priorities, progress and due dates" rows={data.tasks} columns={[["title", "Task"], ["due_date", "Due"], ["priority", "Priority"], ["progress", "Progress"], ["status", "Status"]]} />}
    {tab === "expenses" && <RecordPage title="Expenses and reimbursements" subtitle="Submit and track expense claims" rows={data.expenses} columns={[["expense_type", "Type"], ["amount", "Amount"], ["expense_date", "Date"], ["status", "Approval"], ["hr_comment", "Update"]]} action={<button className="primary" onClick={() => setModal("expense")}>Submit expense</button>} />}
    {tab === "assets" && <><RecordPage title="My company assets" subtitle="Equipment assigned to your custody and return history" rows={data.assets} columns={[["asset_code", "Asset ID"], ["category", "Asset"], ["description", "Description"], ["serial_number", "Serial"], ["condition", "Condition"], ["status", "Status"]]} action={<button className="primary" onClick={() => setModal("asset")}>Request an asset</button>} /><RecordPage title="My asset requests" subtitle="Requests awaiting HR or administrator action" rows={data.assetRequests} columns={[["asset_type", "Asset needed"], ["reason", "Reason"], ["priority", "Priority"], ["created_at", "Submitted"], ["status", "Status"]]} /></>}
    {tab === "benefits" && <BenefitsPage rows={data.benefits} />}
    {tab === "recruitment" && <RecruitmentPage jobs={data.jobs} applications={data.applications} employeeId={profile.employee_id} organisationId={profile.organisation_id} accessToken={accessToken} onTransfer={() => setModal("transfer")} onReload={load} />}
    {tab === "communication" && <CommunicationPage announcements={data.announcements} messages={data.messages} meetings={data.meetings} />}
    {tab === "calendar" && <CalendarPage meetings={data.meetings} holidays={data.holidays} leave={data.leave} learning={data.learning} />}
    {tab === "help" && <HelpPage tickets={data.tickets} onTicket={() => setModal("ticket")} onAi={() => setTab("ai")} />}
    {tab === "notifications" && <NotificationsPage rows={data.notifications} accessToken={accessToken} onPreferences={onNotificationSettings} onReload={load} />}
    {tab === "analytics" && <AnalyticsPage attendanceRate={attendanceRate} leave={data.leave} hours={workedHours} overtime={overtime} performance={data.performance} learning={data.learning} goals={data.goals} />}
    {tab === "settings" && <EmployeeSettings accessToken={accessToken} employee={employee} preferences={data.preferences[0]} onProfile={() => setModal("profile")} onPassword={onChangePassword} onNotifications={onNotificationSettings} onLogout={onLogout} onSaved={load} />}
    {tab === "ai" && <AiPage question={aiQuestion} setQuestion={setAiQuestion} answer={aiAnswer} onSubmit={askAi} />}
    {tab === "library" && <BookLibraryPage accessToken={accessToken} organisationId={profile.organisation_id} profile={profile} />}

    {modal && <SelfServiceDialog type={modal} accessToken={accessToken} profile={profile} employee={employee} onClose={() => setModal(null)} onSaved={async (message) => { setModal(null); setNotice(message); await load(); }} />}
  </section>;
}

function DashboardOverview({ employee, data, metrics, liveTime, clockedIn, onBreak, busy, onAction, onTab, onAskAi }: { employee: DataRow | null; data: Dataset; metrics: { leaveBalance: number; pending: number; attendanceRate: number; overtime: number; openTasks: number; unread: number; performanceScore: number }; liveTime: string; clockedIn: boolean; onBreak: boolean; busy: string; onAction: (action: "clock_in" | "clock_out" | "break_in" | "break_out") => void; onTab: (tab: Tab) => void; onAskAi: () => void }) {
  const cards = [["Present today", clockedIn ? "Clocked in" : "Not clocked in"], ["Leave balance", `${metrics.leaveBalance} days`], ["Pending requests", metrics.pending], ["Next payday", employee?.next_payday || "Not published"], ["Performance score", metrics.performanceScore || "—"], ["Attendance rate", `${metrics.attendanceRate}%`], ["Overtime hours", metrics.overtime.toFixed(1)], ["Assigned tasks", metrics.openTasks], ["Unread notifications", metrics.unread]];
  return <>
    <div className="employee-quick-cards">{cards.map(([label, result]) => <article key={String(label)}><span>{label}</span><strong>{String(result)}</strong></article>)}</div>
    <div className="employee-dashboard-grid">
      <article className="card employee-clock"><h2>Live attendance</h2><strong>{clockedIn ? liveTime : "Ready to start"}</strong><p>{onBreak ? "You are currently on break." : clockedIn ? "Your workday is active." : "Clock in to begin today's attendance."}</p><div className="employee-actions"><button className="primary" disabled={clockedIn || Boolean(busy)} onClick={() => onAction("clock_in")}>Clock In</button><button className="secondary" disabled={!clockedIn || Boolean(busy)} onClick={() => onAction("clock_out")}>Clock Out</button><button className="secondary" disabled={!clockedIn || onBreak || Boolean(busy)} onClick={() => onAction("break_in")}>Break In</button><button className="secondary" disabled={!onBreak || Boolean(busy)} onClick={() => onAction("break_out")}>Break Out</button></div></article>
      <article className="card employee-profile-card"><h2>Employee profile</h2><div className="profile-summary"><div className="profile-photo">{String(employee?.first_name ?? "E").slice(0, 1)}{String(employee?.last_name ?? "").slice(0, 1)}</div><div><h3>{`${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim() || "Employee"}</h3><p>{String(employee?.position_title ?? "Employee")}</p><span>{String(employee?.employee_number ?? "Staff number pending")}</span></div></div><button className="secondary wide-button" onClick={() => onTab("profile")}>View full profile</button></article>
      <article className="card span-two"><div className="panel-head"><div><h2>Quick actions</h2><p className="muted">Common self service tasks</p></div></div><div className="employee-shortcuts">{[["Apply for leave", "leave"], ["View payslip", "payroll"], ["Submit expense", "expenses"], ["View tasks", "tasks"], ["My documents", "documents"], ["Get HR help", "help"]].map(([label, id]) => <button key={id} onClick={() => onTab(id as Tab)}>{label}</button>)}</div></article>
      <article className="card span-two"><h2>Company announcements</h2><Rows rows={data.announcements.filter((row) => row.status === "published").slice(0, 5)} columns={[["title", "Announcement"], ["body", "Message"], ["publish_at", "Published"]]} /></article>
      <article className="card"><h2>Recent notifications</h2><Rows rows={data.notifications.slice(0, 5)} columns={[["title", "Notification"], ["created_at", "Date"]]} /></article>
      <article className="card"><h2>Upcoming events</h2><Rows rows={data.meetings.filter((row) => new Date(String(row.starts_at)) > new Date()).slice(0, 5)} columns={[["title", "Event"], ["starts_at", "Starts"]]} /></article>
      <article className="card"><h2>Learning due</h2><Rows rows={data.learning.filter((row) => !["completed", "cancelled"].includes(String(row.status))).slice(0, 5)} columns={[["course_name", "Training"], ["due_date", "Due"]]} /></article>
      <article className="card"><h2>Benefits</h2><Rows rows={data.benefits.filter((row) => String(row.status) === "active").slice(0, 5)} columns={[["benefit_name", "Benefit"], ["start_date", "Starts"]]} /></article>
      <article className="card span-two ai-teaser"><div><span className="eyebrow">AI HR Assistant</span><h2>Get answers from your employee workspace</h2><p>Ask about leave, attendance, payroll, policies, documents, training and career growth.</p></div><button className="primary" onClick={onAskAi}>Open AI Assistant</button></article>
    </div>
  </>;
}

function ProfilePage({ employee, history, onRequest, accessToken }: { employee: DataRow | null; history: DataRow[]; onRequest: () => void; accessToken: string }) {
  const sections: [string, [string, unknown][]][] = [
    ["Personal information", [["Full name", `${employee?.first_name ?? ""} ${employee?.middle_name ?? ""} ${employee?.last_name ?? ""}`.replace(/\s+/g, " ").trim()], ["Employee ID", employee?.id], ["Staff number", employee?.employee_number], ["Personal email", employee?.personal_email], ["Phone", employee?.phone], ["Date of birth", employee?.date_of_birth], ["Gender", employee?.gender], ["Nationality", employee?.nationality], ["Residential address", employee?.residential_address]]],
    ["Employment", [["Department", employee?.department_name], ["Branch", employee?.branch], ["Position", employee?.position_title], ["Status", employee?.employment_status], ["Reporting manager", employee?.manager_name], ["Employment type", employee?.employment_type], ["Start date", employee?.start_date]]],
    ["Emergency contacts", [["Name", employee?.emergency_contact_name], ["Phone", employee?.emergency_contact_phone], ["Relationship", employee?.emergency_contact_relationship]]],
    ["Bank, tax and pension", [["Bank", employee?.bank_name], ["Account name", employee?.bank_account_name], ["Account number", mask(employee?.bank_account_number)], ["Tax number", mask(employee?.tax_number)], ["SSNIT / pension", mask(employee?.ssnit_number)], ["Pension provider", employee?.pension_provider]]],
  ];
  const fullName = `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim() || "Employee";
  const initials = `${String(employee?.first_name ?? "E").slice(0, 1)}${String(employee?.last_name ?? "").slice(0, 1)}`.toUpperCase();
  const [photoUrl, setPhotoUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    const photoPath = employee?.passport_photo_path;
    (photoPath ? createSignedStorageUrl(accessToken, "employee-media", String(photoPath)) : Promise.resolve(""))
      .then((url) => { if (!cancelled) setPhotoUrl(url); })
      .catch(() => { if (!cancelled) setPhotoUrl(""); });
    return () => { cancelled = true; };
  }, [accessToken, employee?.passport_photo_path]);
  return <>
    <div className="profile-banner">
      <div className="profile-banner-avatar">{photoUrl ? <img src={photoUrl} alt="" /> : initials}</div>
      <div className="profile-banner-info">
        <h1>{fullName}</h1>
        <p>{String(employee?.position_title ?? "Employee")}{employee?.department_name ? ` · ${String(employee.department_name)}` : ""}</p>
        <span>{employee?.employee_number ? `Staff #${String(employee.employee_number)}` : "Staff number pending"}</span>
      </div>
      <button type="button" className="secondary profile-banner-action" onClick={onRequest}>Request a change</button>
    </div>
    <div className="profile-layout">
      <VitalsPanel employee={employee} />
      <div className="profile-layout-main">
        <div className="employee-profile-grid">{sections.map(([title, rows]) => <DetailCard key={title} title={title} rows={rows} />)}</div>
        <RecordPage title="Employment history" subtitle="Role, department, promotion and transfer history" rows={history} columns={[["effective_date", "Effective"], ["change_type", "Change"], ["position_title", "Position"], ["department_name", "Department"], ["notes", "Details"]]} />
      </div>
    </div>
  </>;
}

function VitalsPanel({ employee }: { employee: DataRow | null }) {
  const rows = ([
    ["Work email", employee?.work_email],
    ["Personal email", employee?.personal_email],
    ["Phone", employee?.phone],
    ["Job title", employee?.position_title],
    ["Department", employee?.department_name],
    ["Branch", employee?.branch],
    ["Employee number", employee?.employee_number],
    ["Start date", employee?.start_date],
  ] as [string, unknown][]).filter(([, entry]) => entry);
  return <article className="card data-panel vitals-panel"><h2>Vitals</h2><div className="vitals-list">{rows.map(([label, entry]) => <div key={String(label)}><span>{label}</span><strong>{value(entry)}</strong></div>)}{!rows.length && <p className="muted">No vitals on file yet.</p>}</div></article>;
}

function AttendancePage({ rows, liveTime, clockedIn, onBreak, busy, onAction, rate, hours, overtime }: { rows: DataRow[]; liveTime: string; clockedIn: boolean; onBreak: boolean; busy: string; onAction: (action: "clock_in" | "clock_out" | "break_in" | "break_out") => void; rate: number; hours: number; overtime: number }) {
  return <><header className="page-header"><div><h1><MenuIcon name={moduleIcon("Attendance")} />Attendance</h1><p className="muted">Clocking, breaks, calendar, history and analytics.</p></div></header><div className="employee-quick-cards"><article><span>Live status</span><strong>{onBreak ? "On break" : clockedIn ? "Working" : "Not clocked in"}</strong></article><article><span>Live time</span><strong>{clockedIn ? liveTime : "00:00:00"}</strong></article><article><span>Attendance rate</span><strong>{rate}%</strong></article><article><span>Hours worked</span><strong>{hours.toFixed(1)}</strong></article><article><span>Overtime</span><strong>{overtime.toFixed(1)}</strong></article></div><div className="employee-actions attendance-actions"><button className="primary" disabled={clockedIn || Boolean(busy)} onClick={() => onAction("clock_in")}>Clock In</button><button className="secondary" disabled={!clockedIn || Boolean(busy)} onClick={() => onAction("clock_out")}>Clock Out</button><button className="secondary" disabled={!clockedIn || onBreak || Boolean(busy)} onClick={() => onAction("break_in")}>Break In</button><button className="secondary" disabled={!onBreak || Boolean(busy)} onClick={() => onAction("break_out")}>Break Out</button></div><AttendanceCalendar rows={rows} /><RecordPage title="Attendance history" subtitle="Late arrivals, early departures, overtime and daily attendance" rows={rows} columns={[["attendance_date", "Date"], ["clock_in", "Clock in"], ["break_in", "Break in"], ["break_out", "Break out"], ["clock_out", "Clock out"], ["status", "Status"], ["late_minutes", "Late"], ["early_departure_minutes", "Early departure"], ["overtime_minutes", "Overtime minutes"]]} downloadable /></>;
}

function AttendanceCalendar({ rows }: { rows: DataRow[] }) {
  const current = new Date(), year = current.getFullYear(), month = current.getMonth(), days = new Date(year, month + 1, 0).getDate();
  return <article className="card data-panel"><div className="panel-head"><div><h2>Monthly attendance calendar</h2><p className="muted">{current.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p></div></div><div className="attendance-calendar">{Array.from({ length: days }, (_, index) => index + 1).map((day) => { const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, record = rows.find((row) => String(row.attendance_date) === date); return <div key={day} className={record ? `status-${record.status}` : ""}><strong>{day}</strong><span>{record ? String(record.status).replaceAll("_", " ") : "—"}</span></div>; })}</div></article>;
}

function LeavePage({ rows, holidays, balance, onApply }: { rows: DataRow[]; holidays: DataRow[]; balance: number; onApply: () => void }) {
  return <><header className="page-header"><div><h1><MenuIcon name={moduleIcon("Leave")} />Leave Management</h1><p className="muted">Apply, monitor balances and review leave history.</p></div><button className="primary" onClick={onApply}>Apply for leave</button></header><div className="employee-quick-cards"><article><span>Available balance</span><strong>{balance} days</strong></article><article><span>Pending</span><strong>{rows.filter((row) => row.status === "pending").length}</strong></article><article><span>Approved</span><strong>{rows.filter((row) => row.status === "approved").length}</strong></article><article><span>Rejected</span><strong>{rows.filter((row) => row.status === "rejected").length}</strong></article></div><RecordPage title="My leave requests" subtitle="Annual, sick, compassionate, maternity, paternity and other authorised leave" rows={rows} columns={[["leave_type", "Leave type"], ["start_date", "Start"], ["end_date", "End"], ["days", "Days"], ["status", "Status"], ["reason", "Reason"], ["manager_comment", "Manager update"], ["hr_comment", "HR update"]]} /><RecordPage title="Public holiday calendar" subtitle="Organisation public holidays" rows={holidays} columns={[["holiday_date", "Date"], ["name", "Holiday"], ["description", "Details"]]} /></>;
}

function PayrollPage({ rows, employee }: { rows: DataRow[]; employee: DataRow | null }) {
  const current = rows[0];
  return <><header className="page-header"><div><h1><MenuIcon name={moduleIcon("Payroll")} />Payroll</h1><p className="muted">Current payslip, payroll history and authorised salary information.</p></div></header>{!current && Number(employee?.monthly_salary ?? employee?.basic_salary ?? 0) > 0 && <article className="card data-panel"><h2>Salary configured</h2><p>Your monthly basic salary is {money(employee?.monthly_salary ?? employee?.basic_salary)}. A payslip will appear after HR publishes the payroll period.</p></article>}{current && <article className="card payslip-card"><div><span>Current payslip</span><h2>{String(current.pay_period)}</h2><p>Net pay</p><strong>{money(current.net_pay)}</strong></div><div className="payslip-breakdown"><span>Basic salary <b>{money(current.basic_salary)}</b></span><span>Bonuses <b>{money(current.bonuses)}</b></span><span>Allowances <b>{money(current.allowances)}</b></span><span>PAYE <b>{money(current.paye_tax)}</b></span><span>Employee SSNIT <b>{money(current.employee_ssnit)}</b></span><span>Tier 2 <b>{money(current.tier_two)}</b></span><span>Tier 3 <b>{money(current.tier_three)}</b></span><span>Other deductions <b>{money(current.other_deductions)}</b></span></div><button className="primary" onClick={() => printRows("Payslip", [current], [["pay_period", "Pay period"], ["basic_salary", "Basic salary"], ["allowances", "Allowances"], ["bonuses", "Bonuses"], ["paye_tax", "PAYE"], ["employee_ssnit", "SSNIT"], ["net_pay", "Net pay"]])}>Download PDF payslip</button></article>}<RecordPage title="Payroll history" subtitle="Previous published payslips and payroll releases" rows={rows} columns={[["pay_period", "Period"], ["basic_salary", "Basic salary"], ["allowances", "Allowances"], ["bonuses", "Bonuses"], ["paye_tax", "PAYE"], ["employee_ssnit", "SSNIT"], ["other_deductions", "Deductions"], ["net_pay", "Net pay"], ["status", "Status"]]} downloadable /></>;
}

function DocumentsPage({ rows }: { rows: DataRow[] }) { return <RecordPage title="Documents" subtitle="Contracts, appointment and promotion letters, HR letters, warnings, handbooks, policies, tax forms and certificates" rows={rows} columns={[["document_name", "Document"], ["category", "Category"], ["status", "Status"], ["issued_date", "Issued"], ["expiry_date", "Expiry"], ["signature_status", "E-signature"]]} action={<button className="secondary" onClick={() => window.print()}>Print document register</button>} />; }
function PerformancePage({ reviews, goals, awards }: { reviews: DataRow[]; goals: DataRow[]; awards: DataRow[] }) { return <><div className="employee-quick-cards"><article><span>Performance score</span><strong>{String(reviews[0]?.rating ?? reviews[0]?.score ?? "—")}</strong></article><article><span>Active goals</span><strong>{goals.filter((row) => row.status !== "completed").length}</strong></article><article><span>Completed goals</span><strong>{goals.filter((row) => row.status === "completed").length}</strong></article><article><span>Awards</span><strong>{awards.length}</strong></article></div><RecordPage title="Performance reviews" subtitle="Self assessment, manager feedback and review history" rows={reviews} columns={[["review_type", "Review"], ["review_period", "Period"], ["rating", "Score"], ["self_assessment", "Self assessment"], ["manager_feedback", "Manager feedback"], ["status", "Status"]]} /><RecordPage title="Goals and objectives" subtitle="KPI and OKR progress" rows={goals} columns={[["title", "Goal"], ["target_value", "Target"], ["progress", "Progress"], ["due_date", "Due"], ["status", "Status"]]} /><RecordPage title="Recognition and awards" subtitle="Recognition, awards and career development" rows={awards} columns={[["title", "Award"], ["award_date", "Date"], ["description", "Details"]]} /></>; }
function LearningPage({ rows }: { rows: DataRow[] }) { return <RecordPage title="Learning & Development" subtitle="Assigned courses, company training, certifications, skills and workshops" rows={rows} columns={[["course_name", "Course"], ["training_type", "Type"], ["progress", "Progress"], ["due_date", "Due"], ["certificate_status", "Certificate"], ["status", "Status"]]} />; }
function BenefitsPage({ rows }: { rows: DataRow[] }) { return <RecordPage title="Benefits" subtitle="Health insurance, pension, medical benefits, staff loans, allowances and enrollment" rows={rows} columns={[["benefit_name", "Benefit"], ["plan_name", "Plan"], ["provider", "Provider"], ["start_date", "Starts"], ["end_date", "Ends"], ["enrollment_status", "Enrollment"], ["status", "Status"]]} />; }

function RecruitmentPage({ jobs, applications, employeeId, organisationId, accessToken, onTransfer, onReload }: { jobs: DataRow[]; applications: DataRow[]; employeeId?: string; organisationId: string; accessToken: string; onTransfer: () => void; onReload: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  async function apply(job: DataRow) {
    if (!employeeId) return;
    setBusy(String(job.id));
    try { await createRow(accessToken, "internal_job_applications", { organisation_id: organisationId, job_opening_id: job.id, employee_id: employeeId, status: "submitted", submitted_at: new Date().toISOString() }); await onReload(); }
    finally { setBusy(""); }
  }
  return <><header className="page-header"><div><h1><MenuIcon name={moduleIcon("Recruitment")} />Internal Recruitment</h1><p className="muted">Vacancies, promotion opportunities, transfer requests and applications.</p></div><button className="secondary" onClick={onTransfer}>Request transfer</button></header><div className="job-cards">{jobs.filter((job) => ["open", "published"].includes(String(job.status))).map((job) => <article className="card" key={String(job.id)}><span className="eyebrow">{String(job.employment_type ?? "Internal opportunity")}</span><h2>{String(job.title)}</h2><p>{String(job.location ?? "")} · closes {value(job.closing_date)}</p><button className="primary" disabled={busy === String(job.id)} onClick={() => void apply(job)}>{busy === String(job.id) ? "Applying…" : "Apply internally"}</button></article>)}</div><RecordPage title="Application tracking" subtitle="Your internal applications and status" rows={applications} columns={[["job_title", "Role"], ["submitted_at", "Applied"], ["status", "Status"], ["notes", "Update"]]} /></>;
}
function CommunicationPage({ announcements, messages, meetings }: { announcements: DataRow[]; messages: DataRow[]; meetings: DataRow[] }) { return <><RecordPage title="Company announcements" subtitle="Published company communication" rows={announcements.filter((row) => row.status === "published")} columns={[["title", "Announcement"], ["body", "Message"], ["publish_at", "Published"]]} /><RecordPage title="HR and manager messages" subtitle="Direct, HR and team communication" rows={messages} columns={[["sender_name", "From"], ["subject", "Subject"], ["body", "Message"], ["created_at", "Received"]]} /><RecordPage title="Meetings and discussion groups" subtitle="Video meetings, team sessions and discussion groups" rows={meetings} columns={[["title", "Meeting"], ["starts_at", "Starts"], ["meeting_provider", "Platform"], ["meeting_url", "Join link"]]} /></>; }
function CalendarPage({ meetings, holidays, leave, learning }: { meetings: DataRow[]; holidays: DataRow[]; leave: DataRow[]; learning: DataRow[] }) { const combined: DataRow[] = [...meetings.map((row) => ({ ...row, event_type: "Meeting", event_date: row.starts_at })), ...holidays.map((row) => ({ ...row, title: row.name, event_type: "Public holiday", event_date: row.holiday_date })), ...leave.map((row) => ({ ...row, title: row.leave_type, event_type: "Leave", event_date: row.start_date })), ...learning.map((row) => ({ ...row, title: row.course_name ?? "Training", event_type: "Training", event_date: row.due_date }))]; return <RecordPage title="Calendar" subtitle="Meetings, training, leave, company events and public holidays" rows={combined} columns={[["event_date", "Date"], ["event_type", "Type"], ["title", "Event"], ["status", "Status"]]} />; }
function HelpPage({ tickets, onTicket, onAi }: { tickets: DataRow[]; onTicket: () => void; onAi: () => void }) { return <><header className="page-header"><div><h1><MenuIcon name={moduleIcon("Help Center")} />Help Center</h1><p className="muted">HR support, IT support, tickets, knowledge and FAQs.</p></div><div className="page-actions"><button className="secondary" onClick={onAi}>Ask AI</button><button className="primary" onClick={onTicket}>Submit ticket</button></div></header><div className="employee-profile-grid"><article className="card data-panel"><h2>HR Support</h2><p>Employment, leave, payroll, benefits, documents and workplace questions.</p></article><article className="card data-panel"><h2>IT Support</h2><p>Login, device, software, access, email and system issues.</p></article><article className="card data-panel"><h2>Knowledge base</h2><p>Company policies, employee handbook, processes and frequently asked questions.</p></article></div><RecordPage title="My support tickets" subtitle="Track responses and resolution" rows={tickets} columns={[["ticket_type", "Type"], ["subject", "Subject"], ["priority", "Priority"], ["status", "Status"], ["created_at", "Submitted"], ["resolution_note", "Resolution"]]} /></>; }

function NotificationsPage({ rows, accessToken, onPreferences, onReload }: { rows: DataRow[]; accessToken: string; onPreferences?: () => void; onReload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function markAll() { setBusy(true); try { await callRpc(accessToken, "mark_all_my_notifications_read", {}); await onReload(); } finally { setBusy(false); } }
  return <RecordPage title="Notifications" subtitle="Attendance, leave, payroll, performance, training, document and company alerts" rows={rows} columns={[["title", "Notification"], ["notification_type", "Type"], ["body", "Message"], ["created_at", "Date"], ["status", "Status"]]} action={<div className="row-actions"><button className="secondary" disabled={busy} onClick={() => void markAll()}>Mark all read</button><button className="primary" onClick={onPreferences}>Notification preferences</button></div>} />;
}
function AnalyticsPage({ attendanceRate, leave, hours, overtime, performance, learning, goals }: { attendanceRate: number; leave: DataRow[]; hours: number; overtime: number; performance: DataRow[]; learning: DataRow[]; goals: DataRow[] }) { return <><header className="page-header"><div><h1><MenuIcon name={moduleIcon("Analytics")} />My Analytics</h1><p className="muted">Private employee summaries only.</p></div></header><div className="employee-quick-cards"><article><span>Attendance summary</span><strong>{attendanceRate}%</strong></article><article><span>Leave utilisation</span><strong>{leave.filter((row) => row.status === "approved").reduce((sum, row) => sum + Number(row.days ?? 0), 0)} days</strong></article><article><span>Hours worked</span><strong>{hours.toFixed(1)}</strong></article><article><span>Overtime</span><strong>{overtime.toFixed(1)}</strong></article><article><span>Performance trend</span><strong>{String(performance[0]?.rating ?? "—")}</strong></article><article><span>Learning progress</span><strong>{learning.length ? Math.round(learning.reduce((sum, row) => sum + Number(row.progress ?? 0), 0) / learning.length) : 0}%</strong></article><article><span>Goal completion</span><strong>{goals.length ? Math.round(goals.filter((row) => row.status === "completed").length / goals.length * 100) : 0}%</strong></article></div></>; }

function EmployeeSettings({ accessToken, employee, preferences, onProfile, onPassword, onNotifications, onLogout, onSaved }: { accessToken: string; employee: DataRow | null; preferences?: DataRow; onProfile: () => void; onPassword?: () => void; onNotifications?: () => void; onLogout?: () => void; onSaved: () => Promise<void> }) {
  const [language, setLanguage] = useState(String(preferences?.language ?? "English"));
  const [theme, setTheme] = useState(String(preferences?.theme ?? "system"));
  const [accessibility, setAccessibility] = useState(String(preferences?.accessibility ?? "standard"));
  const [textSize, setTextSize] = useState(String(preferences?.text_size ?? "medium"));
  const [density, setDensity] = useState(String(preferences?.ui_density ?? "comfortable"));
  const [visibility, setVisibility] = useState(String(preferences?.profile_visibility ?? "team"));
  const [showEmail, setShowEmail] = useState(preferences?.show_email !== false);
  const [showPhone, setShowPhone] = useState(Boolean(preferences?.show_phone));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true); setMessage("");
    try {
      await callRpc(accessToken, "upsert_my_user_preferences", {
        p_language: language, p_theme: theme, p_accessibility: accessibility, p_text_size: textSize, p_ui_density: density,
        p_profile_visibility: visibility, p_show_email: showEmail, p_show_phone: showPhone,
        p_show_birthday: Boolean(preferences?.show_birthday), p_show_last_active: preferences?.show_last_active !== false,
        p_allow_location_for_attendance: preferences?.allow_location_for_attendance !== false,
        p_allow_ai_personalisation: preferences?.allow_ai_personalisation !== false,
      });
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.textSize = textSize;
      document.documentElement.dataset.density = density;
      await onSaved();
      setMessage("Preferences saved to Supabase.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Preferences could not be saved."); }
    finally { setBusy(false); }
  }

  return <><header className="page-header"><div><h1><MenuIcon name={moduleIcon("Settings")} />Settings</h1><p className="muted">Profile, security, notifications, language, appearance, accessibility and privacy.</p></div></header><div className="employee-settings-layout">
    <div className="settings-column">
      <article className="card data-panel"><h2>Profile and account</h2><p>{employee?.personal_email || employee?.work_email || "Employee account"}</p><button className="secondary" onClick={onProfile}>Edit profile request</button><button className="secondary" onClick={onPassword}>Change password</button><p className="muted settings-note">Two-factor authentication is controlled through the secure account provider and will appear here when enabled for the organisation.</p></article>
      <article className="card data-panel"><h2>Notifications</h2><p className="muted">Choose email and in-app notification categories from the notification preferences panel.</p><button className="secondary" onClick={onNotifications}>Notification preferences</button><button className="danger" onClick={onLogout}>Sign out</button></article>
    </div>
    <div className="settings-column">
      <article className="card data-panel settings-preferences-card"><h2>Preferences and privacy</h2>
        <label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)}><option>English</option><option>French</option><option>Spanish</option><option>Chinese</option><option>Twi</option><option>Ga</option><option>Ewe</option></select></label>
        <label>Theme<select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label>Accessibility<select value={accessibility} onChange={(event) => setAccessibility(event.target.value)}><option value="standard">Standard</option><option value="large-text">Large text</option><option value="high-contrast">High contrast</option><option value="reduced-motion">Reduced motion</option></select></label>
        <label>Text size<select value={textSize} onChange={(event) => setTextSize(event.target.value)}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
        <label>Interface size<select value={density} onChange={(event) => setDensity(event.target.value)}><option value="compact">Compact tabs and buttons</option><option value="comfortable">Comfortable</option></select></label>
        <label>Profile visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private</option><option value="team">My team</option><option value="organisation">Organisation</option></select></label>
        <label className="check"><input type="checkbox" checked={showEmail} onChange={(event) => setShowEmail(event.target.checked)} /> Show work email in directory</label>
        <label className="check"><input type="checkbox" checked={showPhone} onChange={(event) => setShowPhone(event.target.checked)} /> Show work phone in directory</label>
        {message && <p className={message.includes("saved") ? "form-message" : "form-error"}>{message}</p>}
        <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save preferences"}</button>
      </article>
    </div>
  </div></>;
}

function AiPage({ question, setQuestion, answer, onSubmit }: { question: string; setQuestion: (value: string) => void; answer: string; onSubmit: (event: FormEvent) => void }) { return <section className="ai-assistant-page"><header className="page-header"><div><span className="eyebrow">BlumeByte Intelligence</span><h1>AI HR Assistant</h1><p className="muted">Leave recommendations, career coaching, training suggestions, policy search, document help and FAQs.</p></div></header><article className="card ai-chat"><div className="ai-answer">{answer}</div><form onSubmit={onSubmit}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about your employee workspace..." /><button className="primary">Ask AI</button></form><div className="quick-choices">{["How much leave do I have?", "Show my attendance summary", "What training is assigned?", "Are there internal vacancies?", "Where are my payslips?", "Find my HR documents"].map((suggestion) => <button type="button" key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div></article></section>; }

function RecordPage({ title, subtitle, rows, columns, action, downloadable = false }: { title: string; subtitle: string; rows: DataRow[]; columns: [string, string][]; action?: ReactNode; downloadable?: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(columns[0]?.[0] ?? "created_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const visible = useMemo(() => [...rows].filter((row) => !query || Object.values(row).some((item) => String(item ?? "").toLowerCase().includes(query.toLowerCase()))).sort((a, b) => String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, { numeric: true }) * (direction === "asc" ? 1 : -1)), [rows, query, sort, direction]);
  return <article className="card data-panel employee-record-page"><div className="panel-head"><div><h2>{title}</h2><p className="muted">{subtitle}</p></div>{action}</div><div className="filter-toolbar"><input aria-label={`Search ${title}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}...`} /><select aria-label={`Sort ${title}`} value={sort} onChange={(event) => setSort(event.target.value)}>{columns.map(([key, label]) => <option key={key} value={key}>Sort by {label}</option>)}</select><select aria-label="Sort direction" value={direction} onChange={(event) => setDirection(event.target.value as "asc" | "desc")}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select>{downloadable && <button className="secondary" onClick={() => printRows(title, visible, columns)}>Download / Print PDF</button>}</div><Rows rows={visible} columns={columns} /></article>;
}
function Rows({ rows, columns }: { rows: DataRow[]; columns: [string, string][] }) { return rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map(([key]) => <td key={key}>{value(row[key])}</td>)}</tr>)}</tbody></table></div> : <div className="empty-state"><h3>No records yet</h3><p>No authorised information has been added to this section.</p></div>; }
function DetailCard({ title, rows }: { title: string; rows: [string, unknown][] }) { return <article className="card data-panel"><h2>{title}</h2><div className="master-list">{rows.map(([label, item]) => <div key={label}><strong>{label}</strong><span>{value(item)}</span></div>)}</div></article>; }

function SelfServiceDialog({ type, accessToken, profile, employee, onClose, onSaved }: { type: "leave" | "expense" | "asset" | "ticket" | "profile" | "transfer"; accessToken: string; profile: UserProfile; employee: DataRow | null; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configs = {
    leave: { title: "Apply for leave", table: "leave_requests", fields: [["leave_type", "Leave type", "select"], ["start_date", "Start date", "date"], ["end_date", "End date", "date"], ["reason", "Reason", "textarea"]] },
    expense: { title: "Submit expense", table: "expense_claims", fields: [["expense_type", "Expense type", "text"], ["amount", "Amount", "number"], ["expense_date", "Expense date", "date"], ["description", "Description", "textarea"], ["receipt_url", "Receipt URL", "url"]] },
    asset: { title: "Request an asset", table: "asset_requests", fields: [["asset_type", "Asset needed", "text"], ["reason", "Business reason", "textarea"], ["priority", "Priority", "select"]] },
    ticket: { title: "Submit support ticket", table: "support_tickets", fields: [["ticket_type", "Support type", "select"], ["subject", "Subject", "text"], ["description", "Description", "textarea"], ["priority", "Priority", "select"]] },
    profile: { title: "Request profile update", table: "employee_change_requests", fields: [["field_name", "Information to change", "select"], ["new_value", "Requested value", "text"], ["reason", "Reason", "textarea"]] },
    transfer: { title: "Request transfer", table: "transfer_requests", fields: [["requested_department", "Requested department", "text"], ["requested_branch", "Requested branch", "text"], ["reason", "Reason", "textarea"]] },
  } as const;
  const config = configs[type];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile.employee_id) return setError("Your login is not linked to an employee record.");
    setBusy(true); setError("");
    try {
      const payload: DataRow = { organisation_id: profile.organisation_id, employee_id: profile.employee_id, ...values };
      if (type === "leave") {
        const start = new Date(values.start_date), end = new Date(values.end_date);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new Error("Choose a valid leave date range.");
        payload.days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
        payload.status = "pending";
        payload.workflow_stage = "manager_review";
      } else if (type === "expense") {
        payload.amount = Number(values.amount ?? 0);
        if (Number(payload.amount) <= 0) throw new Error("Enter an expense amount greater than zero.");
        payload.category = values.expense_type || "Other";
        payload.status = "submitted";
        payload.currency = "GHS";
        payload.submitted_at = new Date().toISOString();
      } else if (type === "asset") {
        payload.category = values.asset_type || "Other";
        payload.priority = values.priority || "normal";
        payload.status = "pending";
      } else if (type === "ticket") {
        payload.status = "pending";
      } else if (type === "profile") {
        payload.status = "pending";
        payload.requested_by = profile.id;
        payload.old_value = String(employee?.[values.field_name] ?? "");
      } else if (type === "transfer") payload.status = "pending";

      await createRow(accessToken, config.table, payload);
      await onSaved(`${config.title} submitted successfully.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request could not be submitted."); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal record-modal" role="dialog" aria-modal="true"><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Employee self service</span><h2>{config.title}</h2><form className="record-form" onSubmit={submit}>{config.fields.map(([key, label, kind]) => <label className={kind === "textarea" ? "wide" : ""} key={key}>{label}{kind === "textarea" ? <textarea required value={values[key] ?? ""} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /> : kind === "select" ? <select required value={values[key] ?? ""} onChange={(event) => setValues({ ...values, [key]: event.target.value })}><option value="">Select {label.toLowerCase()}</option>{optionsFor(type, key).map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select> : <input required={key !== "receipt_url"} min={kind === "number" ? "0.01" : undefined} step={kind === "number" ? "0.01" : undefined} type={kind} value={values[key] ?? ""} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />}</label>)}{error && <p className="form-error wide" role="alert">{error}</p>}<div className="form-actions wide"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button></div></form></section></div>;
}

function optionsFor(type: string, key: string) { if (type === "leave") return ["Annual leave", "Sick leave", "Compassionate leave", "Maternity leave", "Paternity leave", "Study leave", "Unpaid leave", "Other"]; if (key === "priority") return ["low", "normal", "high", "urgent"]; if (key === "ticket_type") return ["HR Support", "IT Support", "Payroll Support", "Facilities", "Other"]; if (key === "field_name") return ["phone", "personal_email", "residential_address", "digital_address", "emergency_contact_name", "emergency_contact_phone", "bank_name", "bank_account_number", "profile_photo"]; return ["Other"]; }
function value(input: unknown) { if (input === null || input === undefined || input === "") return "—"; const text = String(input); if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString("en-GB"); return text.replaceAll("_", " "); }
function money(input: unknown) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GHS" }).format(Number(input ?? 0)); }
function mask(input: unknown) { const text = String(input ?? ""); return text ? `${"•".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}` : "—"; }
function printRows(title: string, rows: DataRow[], columns: [string, string][]) { const popup = window.open("", "_blank", "width=1000,height=800"); const body = rows.map((row) => `<tr>${columns.map(([key]) => `<td>${String(value(row[key]))}</td>`).join("")}</tr>`).join(""); popup?.document.write(`<!doctype html><html><head><title>${title}</title><style>body{font:13px Arial;padding:35px}h1{border-bottom:3px solid #00afe3;padding-bottom:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#0b1426;color:white}</style></head><body><h1>${title}</h1><p>Generated ${new Date().toLocaleString("en-GB")}</p><table><thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`); popup?.document.close(); }
