import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  callRpc,
  createRow,
  createRows,
  DataRow,
  listNamedRows,
  listRows,
  updateRow,
} from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";
import { RecordActions } from "./record-actions";

type Config = {
  table: string;
  description: string;
  columns: [string, string][];
  actions: string[];
};

type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
  source?: "employees" | "assets";
  placeholder?: string;
  allowOther?: boolean;
  allowAllEmployees?: boolean;
};

type ActionConfig = {
  table: string;
  title: string;
  fields: Field[];
  defaults?: DataRow;
  mode?: "create" | "assign_asset" | "leave_entitlement";
};

const configs: Record<string, Config> = {
  "Roles & Permissions": {
    table: "roles",
    description:
      "Manage default and custom roles, permissions, scopes, temporary access and conflicts.",
    columns: [
      ["name", "Role"],
      ["updated_at", "Updated"],
    ],
    actions: ["Create role", "Duplicate role", "Review conflicts"],
  },
  "Leave Management": {
    table: "leave_requests",
    description:
      "Configure leave types, balances, accruals, workflows, holidays and organization leave decisions.",
    columns: [
      ["employee_name", "Employee"],
      ["leave_type", "Type"],
      ["start_date", "Start"],
      ["end_date", "End"],
      ["days", "Days"],
      ["status", "Status"],
    ],
    actions: ["Set leave days", "Create leave type", "Record leave", "Export report"],
  },
  Recruitment: {
    table: "job_openings",
    description:
      "Manage vacancies, stages, applicants, interviews, offers and completed campaigns.",
    columns: [
      ["title", "Vacancy"],
      ["location", "Location"],
      ["employment_type", "Type"],
      ["status", "Status"],
      ["closing_date", "Closing"],
    ],
    actions: ["Create vacancy", "Review applicants", "Export report"],
  },
  Offboarding: {
    table: "employee_offboarding",
    description:
      "Manage resignations, terminations, clearance, access revocation, exit records and archiving.",
    columns: [
      ["employee_name", "Employee"],
      ["reason", "Reason"],
      ["last_working_date", "Last day"],
      ["status", "Status"],
      ["final_payroll_status", "Payroll"],
    ],
    actions: ["Start offboarding", "Export report"],
  },
  "Payroll & Payslips": {
    table: "payroll_records",
    description:
      "Internal employee payroll administration only, including periods, inputs, approvals, payslips and audit history.",
    columns: [
      ["employee_name", "Employee"],
      ["pay_period", "Period"],
      ["basic_salary", "Basic salary"],
      ["net_pay", "Net pay"],
      ["status", "Status"],
    ],
    actions: ["Create payroll period", "Publish payslips", "Export report"],
  },
  "Learning & Development": {
    table: "employee_training",
    description:
      "Manage programs, materials, workshops, requests, certificates, skills and development plans.",
    columns: [
      ["record_type", "Type"],
      ["course_name", "Program / training"],
      ["employee_name", "Employee"],
      ["status", "Status"],
      ["progress", "Progress"],
      ["due_date", "Due"],
    ],
    actions: ["Create program", "Assign training", "Export report"],
  },
  Expenses: {
    table: "expense_claims",
    description:
      "Configure categories and workflows, review receipts, decisions and reimbursement status.",
    columns: [
      ["employee_name", "Employee"],
      ["category", "Category"],
      ["amount", "Amount"],
      ["submitted_at", "Submitted"],
      ["status", "Status"],
    ],
    actions: ["Create category", "Export report"],
  },
  Benefits: {
    table: "employee_benefits",
    description:
      "Manage plans, eligibility, enrollment, insurance, pension, loans, allowances and benefit history.",
    columns: [
      ["employee_name", "Employee"],
      ["benefit_name", "Benefit"],
      ["plan_name", "Plan"],
      ["status", "Status"],
      ["start_date", "Start"],
    ],
    actions: ["Create plan", "Assign benefit", "Export report"],
  },
  "Asset Management": {
    table: "assets",
    description:
      "Register, assign, hand over, return, replace and report organization assets.",
    columns: [
      ["asset_code", "Asset ID"],
      ["category", "Category"],
      ["description", "Description"],
      ["employee_name", "Assigned to"],
      ["condition", "Condition"],
      ["status", "Status"],
    ],
    actions: ["Register asset", "Assign asset", "Export report"],
  },
  "Employee Relations & Cases": {
    table: "employee_cases",
    description:
      "Manage authorized complaints, grievances, disciplinary cases, evidence, hearings and appeals.",
    columns: [
      ["case_number", "Case"],
      ["employee_name", "Employee"],
      ["case_type", "Type"],
      ["assigned_to", "Handler"],
      ["status", "Status"],
      ["created_at", "Opened"],
    ],
    actions: ["Open case"],
  },
  Communication: {
    table: "announcements",
    description:
      "Manage targeted announcements, urgent alerts, policy updates, surveys, reminders and delivery status.",
    columns: [
      ["title", "Announcement"],
      ["audience", "Audience"],
      ["status", "Status"],
      ["publish_at", "Publish date"],
      ["created_at", "Created"],
    ],
    actions: ["Create announcement", "Send urgent alert"],
  },
  "Reports & Analytics": {
    table: "report_runs",
    description:
      "Organization reports with search, filters, date ranges, saved views and multiple export formats.",
    columns: [
      ["report_name", "Report"],
      ["report_type", "Type"],
      ["created_by", "Created by"],
      ["created_at", "Created"],
      ["status", "Status"],
    ],
    actions: ["Build report", "Export CSV", "Export Excel", "Export PDF"],
  },
  "Help Desk & Support": {
    table: "support_tickets",
    description:
      "Review employee support requests, assign ownership, respond, resolve, reopen and track service status.",
    columns: [
      ["ticket_number", "Ticket"],
      ["ticket_type", "Type"],
      ["subject", "Subject"],
      ["priority", "Priority"],
      ["status", "Status"],
      ["created_at", "Created"],
      ["resolution_note", "Resolution"],
    ],
    actions: ["Export report"],
  },
  "Audit Logs": {
    table: "audit_logs",
    description:
      "Read only history of logins, security, role, workforce, settings, export and operational activity.",
    columns: [
      ["created_at", "Time"],
      ["actor_name", "Actor"],
      ["action", "Action"],
      ["entity_type", "Area"],
      ["description", "Details"],
    ],
    actions: ["Export audit log"],
  },
  Notifications: {
    table: "notifications",
    description:
      "Review administrator alerts for users, security, deadlines, imports and failed system processes.",
    columns: [
      ["title", "Notification"],
      ["category", "Category"],
      ["priority", "Priority"],
      ["created_at", "Created"],
      ["read_at", "Read"],
    ],
    actions: ["Mark all read"],
  },
};

const actionConfigs: Record<string, ActionConfig> = {
  "Set leave days": {
    table: "leave_entitlements",
    title: "Set employee leave days",
    mode: "leave_entitlement",
    defaults: {
      leave_type: "Annual leave",
      leave_year: new Date().getFullYear(),
      carry_over_days: 0,
      emergency_days: 0,
    },
    fields: [
      {
        key: "employee_id",
        label: "Employee",
        source: "employees",
        required: true,
        allowAllEmployees: true,
      },
      { key: "leave_type", label: "Leave type", required: true },
      { key: "leave_year", label: "Leave year", type: "number", required: true },
      { key: "allocated_days", label: "Allocated days", type: "number", required: true },
      { key: "carry_over_days", label: "Carried over days", type: "number" },
      { key: "emergency_days", label: "Emergency days", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  "Create role": {
    table: "roles",
    title: "Create role",
    fields: [{ key: "name", label: "Role name", required: true }],
  },
  "Create leave type": {
    table: "master_data",
    title: "Create leave type",
    defaults: { data_type: "leave_category", status: "active" },
    fields: [
      { key: "name", label: "Leave type name", required: true },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  "Record leave": {
    table: "leave_requests",
    title: "Record employee leave",
    defaults: { status: "pending" },
    fields: [
      {
        key: "employee_id",
        label: "Employee",
        source: "employees",
        required: true,
      },
      { key: "leave_type", label: "Leave type", required: true },
      { key: "start_date", label: "Start date", type: "date", required: true },
      { key: "end_date", label: "End date", type: "date", required: true },
      { key: "days", label: "Number of days", type: "number", required: true },
      { key: "reason", label: "Reason", type: "textarea", required: true },
    ],
  },
  "Create vacancy": {
    table: "job_openings",
    title: "Create vacancy",
    defaults: { status: "draft", openings: 1 },
    fields: [
      { key: "title", label: "Job title", required: true },
      { key: "location", label: "Location", required: true },
      {
        key: "employment_type",
        label: "Employment type",
        options: ["Full time", "Part time", "Contract", "Internship"],
        required: true,
        allowOther: true,
      },
      { key: "openings", label: "Openings", type: "number", required: true },
      {
        key: "closing_date",
        label: "Closing date",
        type: "date",
        required: true,
      },
      {
        key: "description",
        label: "Description",
        type: "textarea",
        required: true,
      },
      { key: "requirements", label: "Requirements", type: "textarea" },
    ],
  },
  "Start offboarding": {
    table: "employee_offboarding",
    title: "Start offboarding",
    defaults: { status: "in_progress", progress: 0 },
    fields: [
      {
        key: "employee_id",
        label: "Employee",
        source: "employees",
        required: true,
      },
      {
        key: "separation_type",
        label: "Separation type",
        options: ["resignation", "termination", "retirement", "contract_end"],
        required: true,
        allowOther: true,
      },
      { key: "reason", label: "Reason", type: "textarea", required: true },
      {
        key: "last_working_date",
        label: "Last working date",
        type: "date",
        required: true,
      },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  "Create payroll period": {
    table: "payroll_records",
    title: "Create payroll record",
    defaults: {
      status: "draft",
      currency: "GHS",
      allowances: 0,
      bonuses: 0,
      overtime: 0,
      tax_deduction: 0,
      ssnit_deduction: 0,
      other_deductions: 0,
    },
    fields: [
      {
        key: "employee_id",
        label: "Employee",
        source: "employees",
        required: true,
      },
      { key: "pay_period", label: "Pay period", required: true },
      {
        key: "basic_salary",
        label: "Basic salary",
        type: "number",
        required: true,
      },
      { key: "payment_date", label: "Payment date", type: "date" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  "Create program": {
    table: "learning_courses",
    title: "Create training program",
    defaults: { status: "active", mandatory: false },
    fields: [
      { key: "title", label: "Program title", required: true },
      { key: "category", label: "Category", required: true },
      {
        key: "delivery_type",
        label: "Delivery type",
        options: ["in_person", "online", "hybrid", "self_paced"],
        required: true,
        allowOther: true,
      },
      {
        key: "description",
        label: "Description",
        type: "textarea",
        required: true,
      },
      {
        key: "content_url",
        label: "Learning material URL",
        type: "url",
        placeholder: "https://example.com/course",
      },
    ],
  },
  "Assign training": {
    table: "employee_training",
    title: "Assign training",
    defaults: { status: "assigned", progress: 0 },
    fields: [
      {
        key: "employee_id",
        label: "Employee",
        source: "employees",
        required: true,
      },
      { key: "course_name", label: "Course name", required: true },
      { key: "due_date", label: "Due date", type: "date", required: true },
    ],
  },
  "Create category": {
    table: "master_data",
    title: "Create expense category",
    defaults: { data_type: "expense_category", status: "active" },
    fields: [
      { key: "name", label: "Category name", required: true },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  "Create plan": {
    table: "benefit_plans",
    title: "Create benefit plan",
    defaults: {
      status: "active",
      employer_contribution: 0,
      employee_contribution: 0,
    },
    fields: [
      { key: "name", label: "Plan name", required: true },
      { key: "category", label: "Category", required: true },
      { key: "provider", label: "Provider" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "eligibility", label: "Eligibility", type: "textarea" },
    ],
  },
  "Assign benefit": {
    table: "employee_benefits",
    title: "Assign employee benefit",
    defaults: { status: "active", enrollment_status: "enrolled" },
    fields: [
      {
        key: "employee_id",
        label: "Employee",
        source: "employees",
        required: true,
      },
      { key: "benefit_name", label: "Benefit name", required: true },
      { key: "plan_name", label: "Plan name", required: true },
      { key: "provider", label: "Provider" },
      { key: "start_date", label: "Start date", type: "date", required: true },
      { key: "end_date", label: "End date", type: "date" },
    ],
  },
  "Register asset": {
    table: "assets",
    title: "Register asset",
    defaults: { status: "available", condition: "good" },
    fields: [
      {
        key: "asset_code",
        label: "Asset code",
        placeholder: "Generated automatically from category",
      },
      { key: "category", label: "Category", required: true },
      { key: "description", label: "Description", required: true },
      { key: "brand", label: "Brand" },
      { key: "model", label: "Model" },
      { key: "serial_number", label: "Serial number" },
      {
        key: "condition",
        label: "Condition",
        options: ["new", "good", "fair", "damaged"],
        required: true,
      },
    ],
  },
  "Assign asset": {
    table: "assets",
    title: "Assign existing asset",
    mode: "assign_asset",
    fields: [
      { key: "asset_id", label: "Asset", source: "assets", required: true },
      {
        key: "assigned_employee_id",
        label: "Employee",
        source: "employees",
        required: true,
      },
      {
        key: "assignment_date",
        label: "Assignment date",
        type: "date",
        required: true,
      },
      {
        key: "condition",
        label: "Condition",
        options: ["new", "good", "fair", "damaged"],
        required: true,
      },
    ],
  },
  "Open case": {
    table: "employee_cases",
    title: "Open employee case",
    defaults: { status: "open", confidentiality: "restricted" },
    fields: [
      {
        key: "employee_id",
        label: "Employee",
        source: "employees",
        required: true,
      },
      {
        key: "case_type",
        label: "Case type",
        options: [
          "complaint",
          "grievance",
          "disciplinary",
          "warning",
          "investigation",
        ],
        required: true,
        allowOther: true,
      },
      { key: "subject", label: "Subject", required: true },
      {
        key: "description",
        label: "Description",
        type: "textarea",
        required: true,
      },
    ],
  },
  "Create announcement": {
    table: "announcements",
    title: "Create announcement",
    defaults: { status: "published" },
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "body", label: "Message", type: "textarea", required: true },
      {
        key: "audience",
        label: "Audience",
        options: ["all", "employees", "managers", "hr", "administrators"],
        required: true,
        allowOther: true,
      },
      {
        key: "publish_at",
        label: "Publish date and time",
        type: "datetime-local",
      },
    ],
  },
  "Send urgent alert": {
    table: "announcements",
    title: "Send urgent alert",
    defaults: {
      status: "published",
      audience: "all",
      publish_at: new Date().toISOString(),
    },
    fields: [
      { key: "title", label: "Alert title", required: true },
      {
        key: "body",
        label: "Urgent message",
        type: "textarea",
        required: true,
      },
    ],
  },
  "Build report": {
    table: "report_runs",
    title: "Build report",
    defaults: { status: "queued", filters: "{}" },
    fields: [
      { key: "report_name", label: "Report name", required: true },
      {
        key: "report_type",
        label: "Report type",
        options: [
          "headcount",
          "attendance",
          "leave",
          "payroll",
          "recruitment",
          "performance",
          "training",
          "assets",
          "custom",
        ],
        required: true,
      },
    ],
  },
};

const statusActions: Record<string, [string, string][]> = {
  "Leave Management": [
    ["Approve", "approved"],
    ["Reject", "rejected"],
  ],
  Recruitment: [
    ["Publish", "published"],
    ["Close", "closed"],
    ["Archive", "archived"],
  ],
  Offboarding: [
    ["Start", "in_progress"],
    ["Complete", "completed"],
  ],
  "Payroll & Payslips": [["Publish", "published"]],
  "Learning & Development": [
    ["Start", "in_progress"],
    ["Complete", "completed"],
  ],
  "Asset Management": [
    ["Available", "available"],
    ["Maintenance", "maintenance"],
    ["Retire", "retired"],
    ["Lost", "lost"],
  ],
  "Employee Relations & Cases": [
    ["Open", "open"],
    ["In progress", "in_progress"],
    ["Resolve", "resolved"],
    ["Close", "closed"],
  ],
  Communication: [
    ["Publish", "published"],
    ["Archive", "archived"],
  ],
  "Help Desk & Support": [
    ["Open", "open"],
    ["In progress", "in_progress"],
    ["Resolve", "resolved"],
    ["Close", "closed"],
  ],
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text))
    return new Date(text).toLocaleString("en-GB");
  return text.replaceAll("_", " ");
}

function normaliseUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

export function AdminSectionPage({
  label,
  accessToken,
  organisationId,
}: {
  label: string;
  accessToken: string;
  organisationId: string;
}) {
  const config = configs[label];
  const [rows, setRows] = useState<DataRow[]>([]);
  const [employees, setEmployees] = useState<DataRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<DataRow[]>([]);
  const [showApplicants, setShowApplicants] = useState(false);
  const [leaveBalances, setLeaveBalances] = useState<DataRow[]>([]);

  const load = useCallback(async () => {
    if (!config) return;
    setError("");
    try {
      const [records, people, programs, accounts, applications, balances] = await Promise.all([
        listRows(accessToken, config.table, "*", 1000),
        listNamedRows(
          accessToken,
          "employees",
          "id,first_name,last_name,employee_number",
          "first_name",
        ),
        label === "Learning & Development"
          ? listRows(accessToken, "learning_courses", "*", 1000)
          : Promise.resolve([]),
        listRows(accessToken, "profiles", "id,display_name,username,profile_code", 1000),
        label === "Recruitment" ? listRows(accessToken, "internal_job_applications", "*", 1000) : Promise.resolve([]),
        label === "Leave Management"
          ? listRows(accessToken, "leave_balance_summary", "*", 1000, "employee_name", true)
          : Promise.resolve([]),
      ]);
      setEmployees(people);
      setLeaveBalances(balances);
      const assignmentRows = records.map((row) => {
        const employeeId = String(
          row.employee_id ?? row.assigned_employee_id ?? "",
        );
        const person = people.find(
          (candidate) => String(candidate.id) === employeeId,
        );
        const creator = accounts.find((account) => String(account.id) === String(row.created_by ?? ""));
        const handler = accounts.find((account) => String(account.id) === String(row.assigned_to ?? ""));
        return {
          ...row,
          employee_name:
            row.employee_name ??
            (person ? `${person.first_name} ${person.last_name}` : null),
          created_by: creator?.display_name ?? row.created_by,
          assigned_to: handler?.display_name ?? row.assigned_to,
        };
      });
      setApplicants(applications.map((application) => {
        const person = people.find((employee) => String(employee.id) === String(application.employee_id));
        const opening = records.find((record) => String(record.id) === String(application.job_opening_id));
        return { ...application, employee_name: person ? `${person.first_name} ${person.last_name}` : "Employee", employee_number: person?.employee_number, vacancy_name: opening?.title ?? "Vacancy" };
      }));
      setRows(
        label === "Learning & Development"
          ? [
              ...programs.map((program) => ({
                ...program,
                _source_table: "learning_courses",
                record_type: "Program",
                course_name: program.title,
                employee_name: null,
                progress: null,
                due_date: null,
              })),
              ...assignmentRows.map((assignment) => ({
                ...assignment,
                _source_table: "employee_training",
                record_type: "Assignment",
              })),
            ]
          : assignmentRows,
      );
    } catch (cause) {
      setRows([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "This administrator module could not be loaded.",
      );
    }
  }, [accessToken, config, label]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setSort(config?.columns[0]?.[0] ?? "");
    setDirection("desc");
  }, [config]);

  const visible = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            (status === "all" || String(row.status) === status) &&
            (!query ||
              Object.values(row).some((value) =>
                String(value ?? "")
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )),
        )
        .sort((a, b) =>
          sort
            ? String(a[sort] ?? "").localeCompare(
                String(b[sort] ?? ""),
                undefined,
                { numeric: true },
              ) * (direction === "asc" ? 1 : -1)
            : 0,
        ),
    [rows, query, status, sort, direction],
  );

  if (!config)
    return (
      <section className="card data-panel">
        <h2>Module unavailable</h2>
      </section>
    );

  const statuses = [
    ...new Set(rows.map((row) => String(row.status ?? "")).filter(Boolean)),
  ];

  function exportCsv() {
    const keys = config.columns.map(([key]) => key);
    const csv = [
      config.columns.map(([, name]) => name).join(","),
      ...visible.map((row) =>
        keys
          .map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${label.toLowerCase().replaceAll(" ", "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function action(name: string) {
    setError("");
    setNotice("");

    if (/export|download/i.test(name)) {
      exportCsv();
      return;
    }
    if (name === "Review applicants") {
      setShowApplicants(true);
      setNotice(`${applicants.length} applicant record(s) loaded.`);
      return;
    }
    if (name === "Mark all read") {
      setBusy(true);
      try {
        const count = await callRpc<number>(
          accessToken,
          "mark_all_my_notifications_read",
          {},
        );
        await load();
        setNotice(`${Number(count) || 0} notification(s) marked as read.`);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Notifications could not be updated.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    if (name === "Publish payslips") {
      setBusy(true);
      try {
        for (const row of rows.filter(
          (record) => record.status !== "published" && record.id,
        )) {
          await updateRow(accessToken, "payroll_records", String(row.id), {
            status: "published",
          });
        }
        await load();
        setNotice("All eligible payslips were published.");
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Payslips could not be published.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (actionConfigs[name]) setDialog(name);
    else setNotice(`${name} is available from its full management page.`);
  }

  async function setState(row: DataRow, next: string) {
    if (!row.id || label === "Audit Logs") return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (label === "Leave Management" && ["approved", "rejected"].includes(next)) {
        await callRpc(accessToken, "review_leave_request", {
          p_request_id: String(row.id),
          p_decision: next,
          p_allow_emergency: false,
          p_note: null,
        });
      } else {
        await updateRow(
          accessToken,
          String(row._source_table ?? config.table),
          String(row.id),
          { status: next },
        );
      }
      await load();
      setNotice(`Record updated to ${next.replaceAll("_", " ")}.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Record could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveEmergencyLeave(row: DataRow) {
    if (!row.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callRpc<{ emergency_days_added?: number }>(
        accessToken,
        "review_leave_request",
        {
          p_request_id: String(row.id),
          p_decision: "approved",
          p_allow_emergency: true,
          p_note: "Emergency leave approved beyond the available balance.",
        },
      );
      await load();
      setNotice(
        Number(result?.emergency_days_added ?? 0) > 0
          ? `Emergency leave approved. ${result.emergency_days_added} extra day(s) were added to the employee's entitlement.`
          : "Leave approved from the employee's available balance.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Emergency leave could not be approved.");
    } finally {
      setBusy(false);
    }
  }

  async function setNotificationRead(row: DataRow) {
    if (!row.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    const next = !row.is_read;
    try {
      await callRpc(accessToken, "set_my_notification_read", {
        p_notification_id: String(row.id),
        p_is_read: next,
      });
      await load();
      setNotice(
        next
          ? "Notification marked as read."
          : "Notification marked as unread.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Notification could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <span className="eyebrow">Organization administration</span>
          <h1>
            <MenuIcon name={moduleIcon(label)} />
            {label}
          </h1>
          <p className="muted">{config.description}</p>
        </div>
        <div className="row-actions">
          {config.actions.map((name, index) => (
            <button
              type="button"
              key={name}
              className={index === 0 ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => void action(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-message" aria-live="polite">
          {notice}
        </p>
      )}

      {label === "Recruitment" && showApplicants && <article className="card data-panel applicant-review-panel"><div className="panel-head"><div><h2>Applicants</h2><p className="muted">Review candidates and move them through the recruitment stages.</p></div><button type="button" onClick={() => setShowApplicants(false)}>Close applicants</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Applicant</th><th>Employee ID</th><th>Vacancy</th><th>Applied</th><th>Status</th><th>Update</th></tr></thead><tbody>{applicants.map((applicant) => <tr key={String(applicant.id)}><td>{String(applicant.employee_name)}</td><td>{String(applicant.employee_number ?? "—")}</td><td>{String(applicant.vacancy_name)}</td><td>{displayValue(applicant.created_at)}</td><td><span className={`status-pill ${String(applicant.status)}`}>{displayValue(applicant.status)}</span></td><td><select aria-label={`Application status for ${String(applicant.employee_name)}`} value={String(applicant.status)} onChange={async (event) => { await updateRow(accessToken, "internal_job_applications", String(applicant.id), { status: event.target.value }); await load(); }}><option value="submitted">Submitted</option><option value="reviewing">Reviewing</option><option value="shortlisted">Shortlisted</option><option value="interview">Interview</option><option value="offered">Offered</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></td></tr>)}</tbody></table></div>{!applicants.length && <div className="empty-state compact"><h3>No applications yet</h3><p>Applications submitted by employees will appear here immediately.</p></div>}</article>}

      {label === "Leave Management" && (
        <article className="card data-panel">
          <div className="panel-head"><div><h2>Employee leave balances</h2><p className="muted">Yearly allocations update automatically when leave is approved.</p></div></div>
          {leaveBalances.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Year</th><th>Type</th><th>Allocated</th><th>Carry over</th><th>Emergency</th><th>Used</th><th>Pending</th><th>Remaining</th></tr></thead>
                <tbody>{leaveBalances.map((balance) => (
                  <tr key={String(balance.id)}>
                    <td>{displayValue(balance.employee_name)} <small>{displayValue(balance.employee_number)}</small></td>
                    <td>{displayValue(balance.leave_year)}</td><td>{displayValue(balance.leave_type)}</td><td>{displayValue(balance.allocated_days)}</td>
                    <td>{displayValue(balance.carry_over_days)}</td><td>{displayValue(balance.emergency_days)}</td><td>{displayValue(balance.used_days)}</td>
                    <td>{displayValue(balance.pending_days)}</td><td><strong>{displayValue(balance.remaining_days)}</strong></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state compact"><h3>No leave days set</h3><p>Use Set leave days to allocate a yearly balance to one employee or everybody.</p></div>
          )}
        </article>
      )}

      <article className="card data-panel">
        <div className="filter-toolbar">
          <input
            id={`search-${config.table}`}
            name={`search_${config.table}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
          />
          <select
            id={`status-${config.table}`}
            name={`status_${config.table}`}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {displayValue(item)}
              </option>
            ))}
          </select>
          <select
            aria-label={`Sort ${label}`}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {config.columns.map(([key, name]) => (
              <option key={key} value={key}>
                Sort by {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort direction"
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as "asc" | "desc")
            }
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" onClick={exportCsv}>
            Export CSV
          </button>
        </div>

        {visible.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {config.columns.map(([, name]) => (
                    <th key={name}>{name}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr
                    key={`${String(row._source_table ?? config.table)}-${String(row.id ?? index)}`}
                  >
                    {config.columns.map(([key]) => (
                      <td key={key}>{displayValue(row[key])}</td>
                    ))}
                    <td>
                      <div className="row-actions">
                        {label === "Notifications" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setNotificationRead(row)}
                          >
                            {row.is_read ? "Mark unread" : "Mark read"}
                          </button>
                        ) : (
                          (label === "Learning & Development" &&
                          row._source_table === "learning_courses"
                            ? ([
                                ["Activate", "active"],
                                ["Archive", "archived"],
                              ] as [string, string][])
                            : (statusActions[label] ?? [])
                          ).map(([actionLabel, next]) => (
                            <button
                              type="button"
                              key={next}
                              disabled={busy || String(row.status) === next}
                              onClick={() => void setState(row, next)}
                            >
                              {actionLabel}
                            </button>
                          ))
                        )}
                        {label === "Leave Management" && String(row.status) === "pending" && (
                          <button type="button" disabled={busy} onClick={() => void approveEmergencyLeave(row)}>
                            Emergency approve
                          </button>
                        )}
                        {label !== "Audit Logs" &&
                          label !== "Notifications" && (
                            <RecordActions
                              accessToken={accessToken}
                              table={String(row._source_table ?? config.table)}
                              row={row}
                              columns={
                                row._source_table === "learning_courses"
                                  ? [
                                      ["title", "Program title"],
                                      ["category", "Category"],
                                      ["delivery_type", "Delivery type"],
                                      ["description", "Description"],
                                      ["content_url", "Learning material URL"],
                                      ["status", "Status"],
                                    ]
                                  : config.columns
                                      .filter(([key]) => key !== "record_type")
                                      .map(([key, fieldLabel]) =>
                                        label === "Asset Management" &&
                                        key === "employee_name"
                                          ? ([
                                              "assigned_employee_id",
                                              fieldLabel,
                                            ] as [string, string])
                                          : ([key, fieldLabel] as [
                                              string,
                                              string,
                                            ]),
                                      )
                              }
                              label={
                                row._source_table === "learning_courses"
                                  ? "Learning program"
                                  : label
                              }
                              onReload={load}
                            />
                          )}
                        <button type="button" onClick={() => window.print()}>
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>No records yet</h3>
            <p>Use the actions above to add the first validated record.</p>
          </div>
        )}
      </article>

      {dialog && (
        <ActionDialog
          action={dialog}
          config={actionConfigs[dialog]}
          accessToken={accessToken}
          organisationId={organisationId}
          employees={employees}
          records={rows}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            setError("");
            await load();
            window.setTimeout(() => void load(), 350);
            setNotice(`${dialog} completed successfully.`);
          }}
        />
      )}
    </section>
  );
}

function ActionDialog({
  action,
  config,
  accessToken,
  organisationId,
  employees,
  records,
  onClose,
  onSaved,
}: {
  action: string;
  config: ActionConfig;
  accessToken: string;
  organisationId: string;
  employees: DataRow[];
  records: DataRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<DataRow>({ ...config.defaults });
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload: DataRow = {
        organisation_id: organisationId,
        ...config.defaults,
        ...values,
      };
      for (const [key, value] of Object.entries(payload)) {
        if (value === "" && /(^id$|_id$|_by$)/.test(key)) delete payload[key];
      }

      for (const field of config.fields) {
        if (field.options && String(payload[field.key] ?? "") === "other") {
          const custom = String(otherValues[field.key] ?? "").trim();
          if (!custom)
            throw new Error(`Enter the custom ${field.label.toLowerCase()}.`);
          payload[field.key] = custom;
        }
        if (
          field.type === "number" &&
          payload[field.key] !== undefined &&
          payload[field.key] !== ""
        )
          payload[field.key] = Number(payload[field.key]);
        if (field.type === "datetime-local" && payload[field.key])
          payload[field.key] = new Date(
            String(payload[field.key]),
          ).toISOString();
        if (field.type === "url")
          payload[field.key] = normaliseUrl(payload[field.key]);
      }

      if (config.mode === "assign_asset") {
        const assetId = String(payload.asset_id ?? "");
        if (!assetId) throw new Error("Select an asset to assign.");
        delete payload.asset_id;
        delete payload.organisation_id;
        await updateRow(accessToken, "assets", assetId, {
          ...payload,
          status: "assigned",
        });
      } else if (config.mode === "leave_entitlement") {
        await callRpc<number>(accessToken, "set_leave_entitlement", {
          p_employee_id: payload.employee_id === "all" ? null : payload.employee_id,
          p_leave_type: payload.leave_type,
          p_leave_year: payload.leave_year,
          p_allocated_days: payload.allocated_days,
          p_carry_over_days: payload.carry_over_days ?? 0,
          p_emergency_days: payload.emergency_days ?? 0,
          p_notes: payload.notes ?? null,
        });
      } else {
        if (action === "Open case")
          payload.case_number = `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        if (action === "Create payroll period")
          payload.net_pay = Number(payload.basic_salary ?? 0);
        await createRow(accessToken, config.table, payload);
      }

      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The record could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal record-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`dialog-${action.replaceAll(" ", "-").toLowerCase()}`}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <span className="eyebrow">Validated administrator form</span>
        <h2 id={`dialog-${action.replaceAll(" ", "-").toLowerCase()}`}>
          {config.title}
        </h2>
        <form className="record-form" onSubmit={submit}>
          {config.fields.map((field) => {
            const id = `admin-form-${action.replaceAll(" ", "-").toLowerCase()}-${field.key}`;
            const selected = String(values[field.key] ?? "");
            const options = field.options
              ? [
                  ...field.options,
                  ...(field.allowOther && !field.options.includes("other")
                    ? ["other"]
                    : []),
                ]
              : [];
            return (
              <label key={field.key} htmlFor={id}>
                {field.label}
                {field.source === "employees" ? (
                  <select
                    id={id}
                    name={field.key}
                    required={field.required}
                    value={selected}
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                  >
                    <option value="">Select employee</option>
                    {field.allowAllEmployees && <option value="all">Everybody</option>}
                    {employees.map((person) => (
                      <option key={String(person.id)} value={String(person.id)}>
                        {String(person.first_name)} {String(person.last_name)} (
                        {String(person.employee_number ?? "")})
                      </option>
                    ))}
                  </select>
                ) : field.source === "assets" ? (
                  <select
                    id={id}
                    name={field.key}
                    required={field.required}
                    value={selected}
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                  >
                    <option value="">Select available asset</option>
                    {records
                      .filter((record) =>
                        ["available", "maintenance"].includes(
                          String(record.status),
                        ),
                      )
                      .map((record) => (
                        <option
                          key={String(record.id)}
                          value={String(record.id)}
                        >
                          {String(record.asset_code)} ·{" "}
                          {String(record.description)}
                        </option>
                      ))}
                  </select>
                ) : field.options ? (
                  <>
                    <select
                      id={id}
                      name={field.key}
                      required={field.required}
                      value={selected}
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [field.key]: event.target.value,
                        })
                      }
                    >
                      <option value="">
                        Select {field.label.toLowerCase()}
                      </option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option === "other"
                            ? "Other"
                            : option.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                    {selected === "other" && (
                      <input
                        id={`${id}-other`}
                        name={`${field.key}_other`}
                        required
                        value={otherValues[field.key] ?? ""}
                        onChange={(event) =>
                          setOtherValues({
                            ...otherValues,
                            [field.key]: event.target.value,
                          })
                        }
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    )}
                  </>
                ) : field.type === "textarea" ? (
                  <textarea
                    id={id}
                    name={field.key}
                    required={field.required}
                    value={selected}
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                    placeholder={field.placeholder}
                  />
                ) : (
                  <input
                    id={id}
                    name={field.key}
                    required={
                      field.required ||
                      (field.key === "asset_code" &&
                        action !== "Register asset")
                    }
                    readOnly={
                      action === "Register asset" && field.key === "asset_code"
                    }
                    type={field.type ?? "text"}
                    value={selected}
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                    placeholder={field.placeholder}
                  />
                )}
              </label>
            );
          })}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

const exportTables: [string, string][] = [
  ["employees", "Employees"],
  ["departments", "Departments"],
  ["branches", "Branches"],
];

export function ImportExportPage({
  accessToken,
  organisationId,
}: {
  accessToken: string;
  organisationId: string;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DataRow[]>([]);

  async function exportTable(table: string) {
    setBusy(table);
    setError("");
    setNotice("");
    try {
      const rows = await listRows(accessToken, table, "*", 5000);
      const keys = rows.length ? Object.keys(rows[0]) : ["id"];
      const csv = [
        keys.join(","),
        ...rows.map((row) =>
          keys
            .map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`)
            .join(","),
        ),
      ].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${table}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The export could not be prepared.",
      );
    } finally {
      setBusy("");
    }
  }

  async function readFile(selected: File | null) {
    setFile(selected);
    setPreview([]);
    setError("");
    if (!selected) return;
    try {
      setPreview(parseCsv(await selected.text()).slice(0, 20));
    } catch {
      setError("The selected file could not be read as CSV.");
    }
  }

  async function importEmployees() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const rows = parseCsv(await file.text()).map((row) => ({
        ...row,
        organisation_id: organisationId,
      }));
      if (!rows.length)
        throw new Error("No rows were found in the selected file.");
      await createRows(accessToken, "employees", rows);
      setNotice(`${rows.length} employee record(s) imported.`);
      setFile(null);
      setPreview([]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The file could not be imported.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <span className="eyebrow">Organization administration</span>
          <h1>
            <MenuIcon name={moduleIcon("Import & Export")} />
            Import & Export
          </h1>
          <p className="muted">
            Download reference data as CSV, or bulk import new employee records
            from a CSV file.
          </p>
        </div>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-message" aria-live="polite">
          {notice}
        </p>
      )}

      <article className="card data-panel">
        <div className="panel-head">
          <div>
            <h2>Export</h2>
            <p className="muted">
              Download the current records for a table as CSV.
            </p>
          </div>
        </div>
        <div className="row-actions">
          {exportTables.map(([table, label]) => (
            <button
              type="button"
              key={table}
              disabled={busy === table}
              onClick={() => void exportTable(table)}
            >
              {busy === table ? "Preparing…" : `Export ${label}`}
            </button>
          ))}
        </div>
      </article>

      <article className="card data-panel">
        <div className="panel-head">
          <div>
            <h2>Import employees</h2>
            <p className="muted">
              CSV column headers should match employee field names (first_name,
              last_name, work_email, employee_number, department_name,
              position_title...). New rows are created; existing employees are
              not matched or updated.
            </p>
          </div>
        </div>
        <label htmlFor="import-file">
          CSV file
          <input
            id="import-file"
            name="import_file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {preview.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {Object.keys(preview[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index}>
                    {Object.keys(preview[0]).map((key) => (
                      <td key={key}>{String(row[key] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="primary"
            disabled={!file || busy === "import"}
            onClick={() => void importEmployees()}
          >
            {busy === "import" ? "Importing…" : "Import employees"}
          </button>
        </div>
      </article>
    </section>
  );
}

function parseCsv(text: string): DataRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let current = "",
      inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (inQuotes) {
        if (char === '"' && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else if (char === '"') inQuotes = false;
        else current += char;
      } else if (char === '"') inQuotes = true;
      else if (char === ",") {
        cells.push(current);
        current = "";
      } else current += char;
    }
    cells.push(current);
    return cells;
  };
  const headers = parseLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: DataRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
}
