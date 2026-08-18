import { useCallback, useEffect, useMemo, useState } from "react";
import { callRpc, DataRow, listRows, updateRow } from "./lib/supabase-data";
import { AdminSectionPage } from "./admin-section-page";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";
import { RecordActions } from "./record-actions";

type Config = {
  table: string;
  title: string;
  description: string;
  columns: [string, string][];
  actions: string[];
};

const configs: Record<string, Config> = {
  "Employee Management": { table: "employees", title: "Employee Management", description: "Create, update, transfer, activate, suspend, archive and export workforce records.", columns: [["employee_number", "Employee ID"], ["first_name", "First name"], ["last_name", "Last name"], ["position_title", "Position"], ["branch", "Branch"], ["employment_status", "Status"]], actions: ["Add employee", "Invite employee", "Export employees"] },
  "Employee Directory": { table: "employee_directory", title: "Employee Directory", description: "Search the organization directory, reporting lines and workforce structure.", columns: [["full_name", "Employee"], ["position_title", "Position"], ["department_name", "Department"], ["branch", "Branch"], ["manager_name", "Manager"], ["employment_status", "Status"]], actions: ["Export directory"] },
  Onboarding: { table: "employee_onboarding", title: "Onboarding", description: "Manage onboarding workflows, checklists, documents, assets, orientation and probation.", columns: [["employee_name", "Employee"], ["status", "Status"], ["progress", "Progress"], ["due_date", "Due"], ["notes", "Notes"]], actions: ["Start onboarding", "Assign checklist"] },
  Offboarding: { table: "employee_offboarding", title: "Offboarding", description: "Coordinate resignations, clearance, asset returns, access revocation and record retention.", columns: [["employee_name", "Employee"], ["reason", "Reason"], ["last_working_date", "Last day"], ["status", "Status"], ["final_payroll_status", "Payroll"]], actions: ["Start offboarding", "Export report"] },
  "Attendance Management": { table: "attendance_records", title: "Attendance Management", description: "Review organization attendance, corrections, schedules, overtime and attendance rules.", columns: [["employee_name", "Employee"], ["attendance_date", "Date"], ["clock_in", "Clock in"], ["clock_out", "Clock out"], ["status", "Status"]], actions: ["Add attendance", "Export report"] },
  "Leave Management": { table: "leave_requests", title: "Leave Management", description: "Manage leave requests, balances, conflicts, calendars, allowances and approval workflows.", columns: [["employee_name", "Employee"], ["leave_type", "Type"], ["start_date", "Start"], ["end_date", "End"], ["days", "Days"], ["status", "Status"]], actions: ["Record leave", "Export report"] },
  "Payroll Administration": { table: "payroll_records", title: "Payroll Administration", description: "Prepare payroll inputs, review records, publish payslips and lock completed periods where permitted.", columns: [["employee_name", "Employee"], ["pay_period", "Period"], ["basic_salary", "Basic salary"], ["net_pay", "Net pay"], ["status", "Status"]], actions: ["Open payroll", "Export payroll"] },
  Recruitment: { table: "job_openings", title: "Recruitment", description: "Create vacancies, manage applicants, interviews, offers and recruitment reporting.", columns: [["title", "Vacancy"], ["location", "Location"], ["employment_type", "Type"], ["openings", "Openings"], ["status", "Status"], ["closing_date", "Closing"]], actions: ["Create vacancy", "Review applicants"] },
  "Performance Management": { table: "performance_reviews", title: "Performance Management", description: "Manage cycles, appraisals, goals, probation reviews, ratings and development plans.", columns: [["employee_name", "Employee"], ["review_type", "Review"], ["review_period", "Period"], ["rating", "Rating"], ["due_date", "Due"], ["status", "Status"]], actions: ["Assign review", "Export report"] },
  "Learning & Development": { table: "employee_training", title: "Learning & Development", description: "Create programs, assign training, manage certificates, skills matrices and development plans.", columns: [["employee_name", "Employee"], ["course_name", "Training"], ["status", "Status"], ["progress", "Progress"], ["due_date", "Due"]], actions: ["Assign training", "Create program"] },
  "Documents & Templates": { table: "employee_documents", title: "Documents & Templates", description: "Manage employee documents, templates, expiry, signatures and HR letters.", columns: [["employee_name", "Employee"], ["document_name", "Document"], ["category", "Category"], ["status", "Status"], ["expiry_date", "Expiry"]], actions: ["Upload document", "Generate HR letter"] },
  "Benefits Administration": { table: "employee_benefits", title: "Benefits Administration", description: "Manage plans, enrollment, insurance, pension, allowances, staff loans and eligibility.", columns: [["employee_name", "Employee"], ["benefit_name", "Benefit"], ["plan_name", "Plan"], ["status", "Status"], ["start_date", "Start"]], actions: ["Create benefit", "Assign benefit"] },
  "Expense Management": { table: "expense_claims", title: "Expense Management", description: "Review claims, receipts, approvals, Finance forwarding and reimbursement status.", columns: [["employee_name", "Employee"], ["category", "Category"], ["amount", "Amount"], ["submitted_at", "Submitted"], ["status", "Status"]], actions: ["Export expenses"] },
  "Asset Management": { table: "assets", title: "Asset Management", description: "Assign assets, track condition, requests, handovers, returns and offboarding clearance.", columns: [["asset_code", "Asset ID"], ["category", "Category"], ["description", "Description"], ["employee_name", "Assigned to"], ["condition", "Condition"], ["status", "Status"]], actions: ["Add asset", "Export allocation"] },
  "Employee Relations & Cases": { table: "employee_cases", title: "Employee Relations & Cases", description: "Manage complaints, grievances, disciplinary cases, evidence, hearings and outcomes with restricted access.", columns: [["case_number", "Case"], ["employee_name", "Employee"], ["case_type", "Type"], ["assigned_to", "Handler"], ["status", "Status"], ["created_at", "Opened"]], actions: ["Open case"] },
  "Announcements & Communication": { table: "announcements", title: "Announcements & Communication", description: "Publish targeted announcements, reminders, policy updates, surveys and HR messages.", columns: [["title", "Announcement"], ["audience", "Audience"], ["status", "Status"], ["publish_at", "Publish date"], ["created_at", "Created"]], actions: ["Create announcement"] },
  "HR Help Desk": { table: "support_tickets", title: "HR Help Desk", description: "Assign, prioritize, respond, escalate, resolve and reopen employee support tickets.", columns: [["ticket_number", "Ticket"], ["ticket_type", "Type"], ["subject", "Subject"], ["priority", "Priority"], ["status", "Status"], ["created_at", "Created"], ["resolution_note", "Resolution"]], actions: ["Export tickets"] },
  "Reports & Analytics": { table: "report_runs", title: "Reports & Analytics", description: "Headcount, attendance, leave, payroll, recruitment, turnover, performance, training and compliance reports.", columns: [["report_name", "Report"], ["report_type", "Type"], ["created_by", "Created by"], ["created_at", "Created"], ["status", "Status"]], actions: ["Build report", "Export CSV", "Export Excel", "Export PDF"] },
  "Organization Structure": { table: "departments", title: "Organization Structure", description: "Manage branches, departments, teams, positions, job titles, locations and reporting relationships.", columns: [["name", "Department"], ["code", "Code"], ["manager_name", "Manager"], ["branch_name", "Branch"], ["status", "Status"]], actions: ["Add department", "Organization chart"] },
  "Workflows & Approvals": { table: "approval_workflows", title: "Workflows & Approvals", description: "Configure leave, expense, attendance, recruitment, transfer, document, training and offboarding approvals.", columns: [["name", "Workflow"], ["workflow_type", "Type"], ["steps", "Steps"], ["status", "Status"], ["updated_at", "Updated"]], actions: ["Create workflow"] },
  Notifications: { table: "notifications", title: "HR Notifications", description: "Review workforce alerts, deadlines, requests, document expiry and HR operational notifications.", columns: [["title", "Notification"], ["category", "Category"], ["created_at", "Created"], ["read_at", "Read"], ["priority", "Priority"]], actions: ["Mark all read"] },
};

const validatedAliases: Record<string, string> = {
  Offboarding: "Offboarding",
  "Leave Management": "Leave Management",
  "Payroll Administration": "Payroll & Payslips",
  Recruitment: "Recruitment",
  "Learning & Development": "Learning & Development",
  "Benefits Administration": "Benefits",
  "Expense Management": "Expenses",
  "Asset Management": "Asset Management",
  "Employee Relations & Cases": "Employee Relations & Cases",
  "Announcements & Communication": "Communication",
  "Reports & Analytics": "Reports & Analytics",
};

const blocked = /billing|subscription|tenant|developer|audit log|supabase|payment credential|hr settings/i;

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString("en-GB");
  return text.replaceAll("_", " ");
}

export function HRSectionPage({ label, accessToken, organisationId }: { label: string; accessToken: string; organisationId: string }) {
  const validatedLabel = validatedAliases[label];
  const config = configs[label];
  const [rows, setRows] = useState<DataRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!config) return;
    setError("");
    try {
      setRows(await listRows(accessToken, config.table, "*", 1000));
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "This module could not be loaded.");
    }
  }, [accessToken, config]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSort(config?.columns[0]?.[0] ?? ""); setDirection("desc"); }, [config]);

  const visible = useMemo(() => rows.filter((row) =>
    (status === "all" || String(row.status) === status) &&
    (!query || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())))
  ).sort((a, b) => sort ? String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, { numeric: true }) * (direction === "asc" ? 1 : -1) : 0), [rows, query, status, sort, direction]);

  if (validatedLabel) return <AdminSectionPage label={validatedLabel} accessToken={accessToken} organisationId={organisationId} />;
  if (!config || blocked.test(label)) {
    return <section className="card data-panel"><h2>Access unavailable</h2><p>This module is not available to HR.</p></section>;
  }

  const statuses = [...new Set(rows.map((row) => String(row.status ?? "")).filter(Boolean))];

  function exportCsv() {
    const keys = config.columns.map(([key]) => key);
    const csv = [
      config.columns.map(([, name]) => name).join(","),
      ...visible.map((row) => keys.map((key) => `"${String(displayValue(row[key])).replaceAll('"', '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${label.toLowerCase().replaceAll(" ", "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function quickAction(action: string) {
    if (/export/i.test(action)) {
      exportCsv();
      return;
    }

    setError("");
    setNotice("");

    if (label === "Notifications" && action === "Mark all read") {
      setBusy(true);
      try {
        const count = await callRpc<number>(accessToken, "mark_all_my_notifications_read", {});
        await load();
        setNotice(`${Number(count) || 0} notification(s) marked as read.`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Notifications could not be updated.");
      } finally {
        setBusy(false);
      }
      return;
    }

    setNotice(`${action} is available from its full validated management page.`);
  }

  async function setNotificationRead(row: DataRow, isRead: boolean) {
    if (!row.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callRpc(accessToken, "set_my_notification_read", {
        p_notification_id: String(row.id),
        p_is_read: isRead,
      });
      await load();
      setNotice(isRead ? "Notification marked as read." : "Notification marked as unread.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notification could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function setRowStatus(row: DataRow, next: string) {
    if (!row.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const update: DataRow = { status: next };
      if (label === "HR Help Desk") {
        update.hr_reviewed_at = new Date().toISOString();
        if (next === "in_progress" && !row.first_response_at) update.first_response_at = new Date().toISOString();
        if (next === "resolved" || next === "closed") {
          const note = window.prompt("Enter the resolution sent to the employee:", String(row.resolution_note ?? ""));
          if (note === null) { setBusy(false); return; }
          update.resolution_note = note;
          update.resolved_at = new Date().toISOString();
          if (next === "closed") update.closed_at = new Date().toISOString();
        }
      }
      await updateRow(accessToken, config.table, String(row.id), update);
      await load();
      setNotice(`Status updated to ${next.replaceAll("_", " ")}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The record could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return <section>
    <header className="page-header"><div><span className="eyebrow">HR administration</span><h1><MenuIcon name={moduleIcon(config.title)} />{config.title}</h1><p className="muted">{config.description}</p></div><div className="row-actions">{config.actions.map((action) => <button key={action} type="button" className={action === config.actions[0] ? "primary" : "secondary"} disabled={busy} onClick={() => void quickAction(action)}>{action}</button>)}</div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message" aria-live="polite">{notice}</p>}

    <article className="card data-panel">
      <div className="filter-toolbar"><input id={`search-${config.table}`} name={`search_${config.table}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}...`} /><select id={`status-${config.table}`} name={`status_${config.table}`} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label={`Sort ${config.title}`} value={sort} onChange={(event) => setSort(event.target.value)}>{config.columns.map(([key, name]) => <option key={key} value={key}>Sort by {name}</option>)}</select><select aria-label="Sort direction" value={direction} onChange={(event) => setDirection(event.target.value as "asc" | "desc")}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select><button type="button" className="secondary" onClick={() => void load()}>Refresh</button><button type="button" className="secondary" onClick={exportCsv}>Export CSV</button><button type="button" className="secondary" onClick={() => window.print()}>Print</button></div>
      {visible.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{config.columns.map(([, name]) => <th key={name}>{name}</th>)}<th>Actions</th></tr></thead><tbody>{visible.map((row, index) => <tr key={String(row.id ?? index)}>{config.columns.map(([key]) => <td key={key}>{displayValue(row[key])}</td>)}<td><div className="row-actions">{label === "Notifications" ? <button type="button" disabled={busy} onClick={() => void setNotificationRead(row, !row.is_read)}>{row.is_read ? "Mark unread" : "Mark read"}</button> : label === "HR Help Desk" ? <><button type="button" onClick={() => void setRowStatus(row, "open")}>Open</button><button type="button" onClick={() => void setRowStatus(row, "in_progress")}>In progress</button><button type="button" onClick={() => void setRowStatus(row, "resolved")}>Resolve</button><button type="button" onClick={() => void setRowStatus(row, "closed")}>Close</button><button type="button" onClick={() => void setRowStatus(row, "reopened")}>Reopen</button></> : "status" in row ? <><button type="button" onClick={() => void setRowStatus(row, "approved")}>Approve</button><button type="button" onClick={() => void setRowStatus(row, "rejected")}>Reject</button></> : null}{label !== "Notifications" && <RecordActions accessToken={accessToken} table={config.table} row={row} columns={config.columns} label={label} onReload={load} />}<button type="button" onClick={() => window.print()}>Print</button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No records yet</h3><p>No records are available in this module. Use the actions above to begin where permitted.</p></div>}
    </article>
  </section>;
}
