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
};

type ActionConfig = {
  table: string;
  title: string;
  fields: Field[];
  defaults?: DataRow;
  mode?: "create" | "assign_asset";
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
    actions: ["Create leave type", "Record leave", "Export report"],
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
       ïº¶‰ËkºwµçY¥•±¹­•åt€üü€ˆˆ¤¹ÑÉ¥´ ¤ì(€€€€€€€€€¥˜€ …ÕÍÑ½´¤(€€€€€€€€€€€Ñ¡É½Ü¹•ÜÉÉ½È¡¹Ñ•ÈÑ¡”ÕÍÑ½´€‘í™¥•±¹±…‰•°¹Ñ½1½İ•É…Í” ¥ô¹€¤ì(€€€€€€€€€Á…å±½…‘m™¥•±¹­•åt€ôÕÍÑ½´ì(€€€€€€€ô(€€€€€€€¥˜€ (€€€€€€€€€™¥•±¹ÑåÁ”€ôôô€‰¹Õµ‰•Èˆ€˜˜(€€€€€€€€€Á…å±½…‘m™¥•±¹­•åt€„ôôÕ¹‘•™¥¹•€˜˜(€€€€€€€€€Á…å±½…‘m™¥•±¹­•åt€„ôô€ˆˆ(€€€€€€€€¤(€€€€€€€€€Á…å±½…‘m™¥•±¹­•åt€ô9Õµ‰•È¡Á…å±½…‘m™¥•±¹­•åt¤ì(€€€€€€€¥˜€¡™¥•±¹ÑåÁ”€ôôô€‰‘…Ñ•Ñ¥µ”µ±½…°ˆ€˜˜Á…å±½…‘m™¥•±¹­•åt¤(€€€€€€€€€Á…å±½…‘m™¥•±¹­•åt€ô¹•Ü…Ñ” (€€€€€€€€€€€MÑÉ¥¹œ¡Á…å±½…‘m™¥•±¹­•åt¤°(€€€€€€€€€€¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€€€¥˜€¡™¥•±¹ÑåÁ”€ôôô€‰ÕÉ°ˆ¤(€€€€€€€€€Á…å±½…‘m™¥•±¹­•åt€ô¹½Éµ…±¥Í•UÉ°¡Á…å±½…‘m™¥•±¹­•åt¤ì(€€€€€ô((€€€€€¥˜€¡½¹™¥œ¹µ½‘”€ôôô€‰…ÍÍ¥¹}…ÍÍ•Ğˆ¤ì(€€€€€€€½¹ÍĞ…ÍÍ•Ñ%€ôMÑÉ¥¹œ¡Á…å±½…¹…ÍÍ•Ñ}¥€üü€ˆˆ¤ì(€€€€€€€¥˜€ ……ÍÍ•Ñ%¤Ñ¡É½Ü¹•ÜÉÉ½È ‰M•±•Ğ…¸…ÍÍ•ĞÑ¼…ÍÍ¥¸¸ˆ¤ì(€€€€€€€‘•±•Ñ”Á…å±½…¹…ÍÍ•Ñ}¥ì(€€€€€€€‘•±•Ñ”Á…å±½…¹½É…¹¥Í…Ñ¥½¹}¥ì(€€€€€€€…İ…¥ĞÕÁ‘…Ñ•I½Ü¡…•ÍÍQ½­•¸°€‰…ÍÍ•ÑÌˆ°…ÍÍ•Ñ%°ì(€€€€€€€€€€¸¸¹Á…å±½…°(€€€€€€€€€ÍÑ…ÑÕÌè€‰…ÍÍ¥¹•ˆ°(€€€€€€€ô¤ì(€€€€€ô•±Í”ì(€€€€€€€¥˜€¡…Ñ¥½¸€ôôô€‰=Á•¸…Í”ˆ¤(€€€€€€€€€Á…å±½…¹…Í•}¹Õµ‰•È€ôM´‘íÉåÁÑ¼¹É…¹‘½µUU% ¤¹Í±¥” À°€à¤¹Ñ½UÁÁ•É…Í” ¥õ€ì(€€€€€€€¥˜€¡…Ñ¥½¸€ôôô€‰É•…Ñ”Á…åÉ½±°Á•É¥½ˆ¤(€€€€€€€€€Á…å±½…¹¹•Ñ}Á…ä€ô9Õµ‰•È¡Á…å±½…¹‰…Í¥}Í…±…Éä€üü€À¤ì(€€€€€€€…İ…¥ĞÉ•…Ñ•I½Ü¡…•ÍÍQ½­•¸°½¹™¥œ¹Ñ…‰±”°Á…å±½…¤ì(€€€€€ô((€€€€€…İ…¥Ğ½¹M…Ù• ¤ì(€€€ô…Ñ €¡…ÕÍ”¤ì(€€€€€Í•ÑÉÉ½È (€€€€€€€…ÕÍ”¥¹ÍÑ…¹•½˜ÉÉ½È(€€€€€€€€€€ü…ÕÍ”¹µ•ÍÍ…”(€€€€€€€€€€è€‰Q¡”É•½É½Õ±¹½Ğ‰”Í…Ù•¸ˆ°(€€€€€€¤ì(€€€ô™¥¹…±±äì(€€€€€Í•Ñ	ÕÍä¡™…±Í”¤ì(€€€ô(€ô((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø(€€€€€±…ÍÍ9…µ”ô‰µ½‘…°µ‰…­‘É½Àˆ(€€€€€½¹5½ÕÍ•½İ¸õì¡•Ù•¹Ğ¤€ôøì(€€€€€€€¥˜€¡•Ù•¹Ğ¹Ñ…É•Ğ€ôôô•Ù•¹Ğ¹ÕÉÉ•¹ÑQ…É•Ğ¤½¹±½Í” ¤ì(€€€€€õô(€€€€ø(€€€€€€ñÍ•Ñ¥½¸(€€€€€€€±…ÍÍ9…µ”ô‰µ½‘…°É•½Éµµ½‘…°ˆ(€€€€€€€É½±”ô‰‘¥…±½œˆ(€€€€€€€…É¥„µµ½‘…°ô‰ÑÉÕ”ˆ(€€€€€€€…É¥„µ±…‰•±±•‘‰äõí‘¥…±½œ´‘í…Ñ¥½¸¹É•Á±…•±° ˆ€ˆ°€ˆ´ˆ¤¹Ñ½1½İ•É…Í” ¥õô(€€€€€€ø(€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€±…ÍÍ9…µ”ô‰µ½‘…°µ±½Í”ˆ(€€€€€€€€€…É¥„µ±…‰•°ô‰±½Í”ˆ(€€€€€€€€€½¹±¥¬õí½¹±½Í•ô(€€€€€€€€ø(€€€€€€€€€ƒ\(€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùY…±¥‘…Ñ•…‘µ¥¹¥ÍÑÉ…Ñ½È™½É´ğ½ÍÁ…¸ø(€€€€€€€€ñ È¥õí‘¥…±½œ´‘í…Ñ¥½¸¹É•Á±…•±° ˆ€ˆ°€ˆ´ˆ¤¹Ñ½1½İ•É…Í” ¥õôø(€€€€€€€€€í½¹™¥œ¹Ñ¥Ñ±•ô(€€€€€€€€ğ½ Èø(€€€€€€€€ñ™½É´±…ÍÍ9…µ”ô‰É•½Éµ™½É´ˆ½¹MÕ‰µ¥ĞõíÍÕ‰µ¥Ñôø(€€€€€€€€€í½¹™¥œ¹™¥•±‘Ì¹µ…À ¡™¥•±¤€ôøì(€€€€€€€€€€€½¹ÍĞ¥€ô…‘µ¥¸µ™½É´´‘í…Ñ¥½¸¹É•Á±…•±° ˆ€ˆ°€ˆ´ˆ¤¹Ñ½1½İ•É…Í” ¥ô´‘í™¥•±¹­•åõ€ì(€€€€€€€€€€€½¹ÍĞÍ•±•Ñ•€ôMÑÉ¥¹œ¡Ù…±Õ•Ím™¥•±¹­•åt€üü€ˆˆ¤ì(€€€€€€€€€€€½¹ÍĞ½ÁÑ¥½¹Ì€ô™¥•±¹½ÁÑ¥½¹Ì(€€€€€€€€€€€€€€ül(€€€€€€€€€€€€€€€€€€¸¸¹™¥•±¹½ÁÑ¥½¹Ì°(€€€€€€€€€€€€€€€€€€¸¸¸¡™¥•±¹…±±½İ=Ñ¡•È€˜˜€…™¥•±¹½ÁÑ¥½¹Ì¹¥¹±Õ‘•Ì ‰½Ñ¡•Èˆ¤(€€€€€€€€€€€€€€€€€€€€ül‰½Ñ¡•È‰t(€€€€€€€€€€€€€€€€€€€€èmt¤°(€€€€€€€€€€€€€€€t(€€€€€€€€€€€€€€èmtì(€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€ñ±…‰•°­•äõí™¥•±¹­•åô¡Ñµ±½Èõí¥‘ôø(€€€€€€€€€€€€€€€í™¥•±¹±…‰•±ô(€€€€€€€€€€€€€€€í™¥•±¹Í½ÕÉ”€ôôô€‰•µÁ±½å••Ìˆ€ü€ (€€€€€€€€€€€€€€€€€€ñÍ•±•Ğ(€€€€€€€€€€€€€€€€€€€¥õí¥‘ô(€€€€€€€€€€€€€€€€€€€¹…µ”õí™¥•±¹­•åô(€€€€€€€€€€€€€€€€€€€É•ÅÕ¥É•õí™¥•±¹É•ÅÕ¥É•‘ô(€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíÍ•±•Ñ•‘ô(€€€€€€€€€€€€€€€€€€€½¹¡…¹”õì¡•Ù•¹Ğ¤€ôø(€€€€€€€€€€€€€€€€€€€€€Í•ÑY…±Õ•Ì¡ì€¸¸¹Ù…±Õ•Ì°m™¥•±¹­•åtè•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”ô¤(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆùM•±•Ğ•µÁ±½å•”ğ½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€í•µÁ±½å••Ì¹µ…À ¡Á•ÉÍ½¸¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸­•äõíMÑÉ¥¹œ¡Á•ÉÍ½¸¹¥¥ôÙ…±Õ”õíMÑÉ¥¹œ¡Á•ÉÍ½¸¹¥¥ôø(€€€€€€€€€€€€€€€€€€€€€€€íMÑÉ¥¹œ¡Á•ÉÍ½¸¹™¥ÉÍÑ}¹…µ”¥ôíMÑÉ¥¹œ¡Á•ÉÍ½¸¹±…ÍÑ}¹…µ”¥ô€ (€€€€€€€€€€€€€€€€€€€€€€€íMÑÉ¥¹œ¡Á•ÉÍ½¸¹•µÁ±½å••}¹Õµ‰•È€üü€ˆˆ¥ô¤(€€€€€€€€€€€€€€€€€€€€€€ğ½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€€€ğ½Í•±•Ğø(€€€€€€€€€€€€€€€€¤€è™¥•±¹Í½ÕÉ”€ôôô€‰…ÍÍ•ÑÌˆ€ü€ (€€€€€€€€€€€€€€€€€€ñÍ•±•Ğ(€€€€€€€€€€€€€€€€€€€¥õí¥‘ô(€€€€€€€€€€€€€€€€€€€¹…µ”õí™¥•±¹­•åô(€€€€€€€€€€€€€€€€€€€É•ÅÕ¥É•õí™¥•±¹É•ÅÕ¥É•‘ô(€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíÍ•±•Ñ•‘ô(€€€€€€€€€€€€€€€€€€€½¹¡…¹”õì¡•Ù•¹Ğ¤€ôø(€€€€€€€€€€€€€€€€€€€€€Í•ÑY…±Õ•Ì¡ì€¸¸¹Ù…±Õ•Ì°m™¥•±¹­•åtè•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”ô¤(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆùM•±•Ğ…Ù…¥±…‰±”…ÍÍ•Ğğ½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€íÉ•½É‘Ì(€€€€€€€€€€€€€€€€€€€€€€¹™¥±Ñ•È ¡É•½É¤€ôø(€€€€€€€€€€€€€€€€€€€€€€€l‰…Ù…¥±…‰±”ˆ°€‰µ…¥¹Ñ•¹…¹”‰t¹¥¹±Õ‘•Ì (€€€€€€€€€€€€€€€€€€€€€€€€€MÑÉ¥¹œ¡É•½É¹ÍÑ…ÑÕÌ¤°(€€€€€€€€€€€€€€€€€€€€€€€€¤°(€€€€€€€€€€€€€€€€€€€€€€¤(€€€€€€€€€€€€€€€€€€€€€€¹µ…À ¡É•½É¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸(€€€€€€€€€€€€€€€€€€€€€€€€€­•äõíMÑÉ¥¹œ¡É•½É¹¥¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíMÑÉ¥¹œ¡É•½É¹¥¥ô(€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€íMÑÉ¥¹œ¡É•½É¹…ÍÍ•Ñ}½‘”¥ôƒ
İìˆ€‰ô(€€€€€€€€€€€€€€€€€€€€€€€€€íMÑÉ¥¹œ¡É•½É¹‘•ÍÉ¥ÁÑ¥½¸¥ô(€€€€€€€€€€€€€€€€€€€€€€€€ğ½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€€€ğ½Í•±•Ğø(€€€€€€€€€€€€€€€€¤€è™¥•±¹½ÁÑ¥½¹Ì€ü€ (€€€€€€€€€€€€€€€€€€ğø(€€€€€€€€€€€€€€€€€€€€ñÍ•±•Ğ(€€€€€€€€€€€€€€€€€€€€€¥õí¥‘ô(€€€€€€€€€€€€€€€€€€€€€¹…µ”õí™¥•±¹­•åô(€€€€€€€€€€€€€€€€€€€€€É•ÅÕ¥É•õí™¥•±¹É•ÅÕ¥É•‘ô(€€€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíÍ•±•Ñ•‘ô(€€€€€€€€€€€€€€€€€€€€€½¹¡…¹”õì¡•Ù•¹Ğ¤€ôø(€€€€€€€€€€€€€€€€€€€€€€€Í•ÑY…±Õ•Ì¡ì(€€€€€€€€€€€€€€€€€€€€€€€€€€¸¸¹Ù…±Õ•Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€m™¥•±¹­•åtè•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”°(€€€€€€€€€€€€€€€€€€€€€€€ô¤(€€€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆø(€€€€€€€€€€€€€€€€€€€€€€€M•±•Ğí™¥•±¹±…‰•°¹Ñ½1½İ•É…Í” ¥ô(€€€€€€€€€€€€€€€€€€€€€€ğ½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€€€í½ÁÑ¥½¹Ì¹µ…À ¡½ÁÑ¥½¸¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸­•äõí½ÁÑ¥½¹ôÙ…±Õ”õí½ÁÑ¥½¹ôø(€€€€€€€€€€€€€€€€€€€€€€€€€í½ÁÑ¥½¸€ôôô€‰½Ñ¡•Èˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ü€‰=Ñ¡•Èˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€è½ÁÑ¥½¸¹É•Á±…•±° ‰|ˆ°€ˆ€ˆ¥ô(€€€€€€€€€€€€€€€€€€€€€€€€ğ½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€€€€€ğ½Í•±•Ğø(€€€€€€€€€€€€€€€€€€€íÍ•±•Ñ•€ôôô€‰½Ñ¡•Èˆ€˜˜€ (€€€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞ(€€€€€€€€€€€€€€€€€€€€€€€¥õí€‘í¥‘ôµ½Ñ¡•Éô(€€€€€€€€€€€€€€€€€€€€€€€¹…µ”õí€‘í™¥•±¹­•åõ}½Ñ¡•Éô(€€€€€€€€€€€€€€€€€€€€€€€É•ÅÕ¥É•(€€€€€€€€€€€€€€€€€€€€€€€Ù…±Õ”õí½Ñ¡•ÉY…±Õ•Ím™¥•±¹­•åt€üü€ˆ‰ô(€€€€€€€€€€€€€€€€€€€€€€€½¹¡…¹”õì¡•Ù•¹Ğ¤€ôø(€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ=Ñ¡•ÉY…±Õ•Ì¡ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€¸¸¹½Ñ¡•ÉY…±Õ•Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€m™¥•±¹­•åtè•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”°(€€€€€€€€€€€€€€€€€€€€€€€€€ô¤(€€€€€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€€€€€Á±…•¡½±‘•Èõí¹Ñ•È€‘í™¥•±¹±…‰•°¹Ñ½1½İ•É…Í” ¥õô(€€€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€ğ¼ø(€€€€€€€€€€€€€€€€¤€è™¥•±¹ÑåÁ”€ôôô€‰Ñ•áÑ…É•„ˆ€ü€ (€€€€€€€€€€€€€€€€€€ñÑ•áÑ…É•„(€€€€€€€€€€€€€€€€€€€¥õí¥‘ô(€€€€€€€€€€€€€€€€€€€¹…µ”õí™¥•±¹­•åô(€€€€€€€€€€€€€€€€€€€É•ÅÕ¥É•õí™¥•±¹É•ÅÕ¥É•‘ô(€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíÍ•±•Ñ•‘ô(€€€€€€€€€€€€€€€€€€€½¹¡…¹”õì¡•Ù•¹Ğ¤€ôø(€€€€€€€€€€€€€€€€€€€€€Í•ÑY…±Õ•Ì¡ì€¸¸¹Ù…±Õ•Ì°m™¥•±¹­•åtè•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”ô¤(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€Á±…•¡½±‘•Èõí™¥•±¹Á±…•¡½±‘•Éô(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕĞ(€€€€€€€€€€€€€€€€€€€¥õí¥‘ô(€€€€€€€€€€€€€€€€€€€¹…µ”õí™¥•±¹­•åô(€€€€€€€€€€€€€€€€€€€É•ÅÕ¥É•õì(€€€€€€€€€€€€€€€€€€€€€™¥•±¹É•ÅÕ¥É•ñğ(€€€€€€€€€€€€€€€€€€€€€€¡™¥•±¹­•ä€ôôô€‰…ÍÍ•Ñ}½‘”ˆ€˜˜(€€€€€€€€€€€€€€€€€€€€€€€…Ñ¥½¸€„ôô€‰I•¥ÍÑ•È…ÍÍ•Ğˆ¤(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€É•…‘=¹±äõì(€€€€€€€€€€€€€€€€€€€€€…Ñ¥½¸€ôôô€‰I•¥ÍÑ•È…ÍÍ•Ğˆ€˜˜™¥•±¹­•ä€ôôô€‰…ÍÍ•Ñ}½‘”ˆ(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€ÑåÁ”õí™¥•±¹ÑåÁ”€üü€‰Ñ•áĞ‰ô(€€€€€€€€€€€€€€€€€€€Ù…±Õ”õíÍ•±•Ñ•‘ô(€€€€€€€€€€€€€€€€€€€½¹¡…¹”õì¡•Ù•¹Ğ¤€ôø(€€€€€€€€€€€€€€€€€€€€€Í•ÑY…±Õ•Ì¡ì€¸¸¹Ù…±Õ•Ì°m™¥•±¹­•åtè•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”ô¤(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€Á±…•¡½±‘•Èõí™¥•±¹Á±…•¡½±‘•Éô(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€ğ½±…‰•°ø(€€€€€€€€€€€€¤ì(€€€€€€€€€ô¥ô(€€€€€€€€€í•ÉÉ½È€˜˜€ (€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰™½É´µ•ÉÉ½ÈˆÉ½±”ô‰…±•ÉĞˆø(€€€€€€€€€€€€€í•ÉÉ½Éô(€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€¥ô(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™½É´µ…Ñ¥½¹Ìˆø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÍ9…µ”ô‰Í•½¹‘…Éäˆ½¹±¥¬õí½¹±½Í•ôø(€€€€€€€€€€€€€…¹•°(€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰ÍÕ‰µ¥Ğˆ±…ÍÍ9…µ”ô‰ÁÉ¥µ…Éäˆ‘¥Í…‰±•õí‰ÕÍåôø(€€€€€€€€€€€€€í‰ÕÍä€ü€‰M…Ù¥¹ŸŠ˜ˆ€è€‰M…Ù”‰ô(€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½™½É´ø(€€€€€€ğ½Í•Ñ¥½¸ø(€€€€ğ½‘¥Øø(€€¤ì)ô()½¹ÍĞ•áÁ½ÉÑQ…‰±•ÌèmÍÑÉ¥¹œ°ÍÑÉ¥¹umt€ôl(€l‰•µÁ±½å••Ìˆ°€‰µÁ±½å••Ì‰t°(€l‰‘•Á…ÉÑµ•¹ÑÌˆ°€‰•Á…ÉÑµ•¹ÑÌ‰t°(€l‰‰É…¹¡•Ìˆ°€‰	É…¹¡•Ì‰t°)tì()•áÁ½ÉĞ™Õ¹Ñ¥½¸%µÁ½ÉÑáÁ½ÉÑA…”¡ì(€…•ÍÍQ½­•¸°(€½É…¹¥Í…Ñ¥½¹%°)ôèì(€…•ÍÍQ½­•¸èÍÑÉ¥¹œì(€½É…¹¥Í…Ñ¥½¹%èÍÑÉ¥¹œì)ô¤ì(€½¹ÍĞm‰ÕÍä°Í•Ñ	ÕÍåt€ôÕÍ•MÑ…Ñ” ˆˆ¤ì(€½¹ÍĞm•ÉÉ½È°Í•ÑÉÉ½Ét€ôÕÍ•MÑ…Ñ” ˆˆ¤ì(€½¹ÍĞm¹½Ñ¥”°Í•Ñ9½Ñ¥•t€ôÕÍ•MÑ…Ñ” ˆˆ¤ì(€½¹ÍĞm™¥±”°Í•Ñ¥±•t€ôÕÍ•MÑ…Ñ”ñ¥±”ğ¹Õ±°ø¡¹Õ±°¤ì(€½¹ÍĞmÁÉ•Ù¥•Ü°Í•ÑAÉ•Ù¥•İt€ôÕÍ•MÑ…Ñ”ñ…Ñ…I½İmtø¡mt¤ì((€…Íå¹Œ™Õ¹Ñ¥½¸•áÁ½ÉÑQ…‰±”¡Ñ…‰±”èÍÑÉ¥¹œ¤ì(€€€Í•Ñ	ÕÍä¡Ñ…‰±”¤ì(€€€Í•ÑÉÉ½È ˆˆ¤ì(€€€Í•Ñ9½Ñ¥” ˆˆ¤ì(€€€ÑÉäì(€€€€€½¹ÍĞÉ½İÌ€ô…İ…¥Ğ±¥ÍÑI½İÌ¡…•ÍÍQ½­•¸°Ñ…‰±”°€ˆ¨ˆ°€ÔÀÀÀ¤ì(€€€€€½¹ÍĞ­•åÌ€ôÉ½İÌ¹±•¹Ñ €ü=‰©•Ğ¹­•åÌ¡É½İÍlÁt¤€èl‰¥‰tì(€€€€€½¹ÍĞÍØ€ôl(€€€€€€€­•åÌ¹©½¥¸ ˆ°ˆ¤°(€€€€€€€€¸¸¹É½İÌ¹µ…À ¡É½Ü¤€ôø(€€€€€€€€€­•åÌ(€€€€€€€€€€€€¹µ…À ¡­•ä¤€ôø€ˆ‘íMÑÉ¥¹œ¡É½İm­•åt€üü€ˆˆ¤¹É•Á±…•±° œˆœ°€œˆˆœ¥ô‰€¤(€€€€€€€€€€€€¹©½¥¸ ˆ°ˆ¤°(€€€€€€€€¤°(€€€€€t¹©½¥¸ ‰q¸ˆ¤ì(€€€€€½¹ÍĞÕÉ°€ôUI0¹É•…Ñ•=‰©•ÑUI0¡¹•Ü	±½ˆ¡mÍÙt°ìÑåÁ”è€‰Ñ•áĞ½ÍØˆô¤¤ì(€€€€€½¹ÍĞ…¹¡½È€ô‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰„ˆ¤ì(€€€€€…¹¡½È¹¡É•˜€ôÕÉ°ì(€€€€€…¹¡½È¹‘½İ¹±½…€ô€‘íÑ…‰±•ô¹ÍÙ€ì(€€€€€…¹¡½È¹±¥¬ ¤ì(€€€€€UI0¹É•Ù½­•=‰©•ÑUI0¡ÕÉ°¤ì(€€€ô…Ñ €¡…ÕÍ”¤ì(€€€€€Í•ÑÉÉ½È (€€€€€€€…ÕÍ”¥¹ÍÑ…¹•½˜ÉÉ½È(€€€€€€€€€€ü…ÕÍ”¹µ•ÍÍ…”(€€€€€€€€€€è€‰Q¡”•áÁ½ÉĞ½Õ±¹½Ğ‰”ÁÉ•Á…É•¸ˆ°(€€€€€€¤ì(€€€ô™¥¹…±±äì(€€€€€Í•Ñ	ÕÍä ˆˆ¤ì(€€€ô(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸É•…‘¥±”¡Í•±•Ñ•è¥±”ğ¹Õ±°¤ì(€€€Í•Ñ¥±”¡Í•±•Ñ•¤ì(€€€Í•ÑAÉ•Ù¥•Ü¡mt¤ì(€€€Í•ÑÉÉ½È ˆˆ¤ì(€€€¥˜€ …Í•±•Ñ•¤É•ÑÕÉ¸ì(€€€ÑÉäì(€€€€€Í•ÑAÉ•Ù¥•Ü¡Á…ÉÍ•ÍØ¡…İ…¥ĞÍ•±•Ñ•¹Ñ•áĞ ¤¤¹Í±¥” À°€ÈÀ¤¤ì(€€€ô…Ñ ì(€€€€€Í•ÑÉÉ½È ‰Q¡”Í•±•Ñ•™¥±”½Õ±¹½Ğ‰”É•……ÌMX¸ˆ¤ì(€€€ô(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸¥µÁ½ÉÑµÁ±½å••Ì ¤ì(€€€¥˜€ …™¥±”¤ì(€€€€€Í•ÑÉÉ½È ‰¡½½Í”„MX™¥±”™¥ÉÍĞ¸ˆ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€Í•Ñ	ÕÍä ‰¥µÁ½ÉĞˆ¤ì(€€€Í•ÑÉÉ½È ˆˆ¤ì(€€€Í•Ñ9½Ñ¥” ˆˆ¤ì(€€€ÑÉäì(€€€€€½¹ÍĞÉ½İÌ€ôÁ…ÉÍ•ÍØ¡…İ…¥Ğ™¥±”¹Ñ•áĞ ¤¤¹µ…À ¡É½Ü¤€ôø€¡ì(€€€€€€€€¸¸¹É½Ü°(€€€€€€€½É…¹¥Í…Ñ¥½¹}¥è½É…¹¥Í…Ñ¥½¹%°(€€€€€ô¤¤ì(€€€€€¥˜€ …É½İÌ¹±•¹Ñ ¤(€€€€€€€Ñ¡É½Ü¹•ÜÉÉ½È ‰9¼É½İÌİ•É”™½Õ¹¥¸Ñ¡”Í•±•Ñ•™¥±”¸ˆ¤ì(€€€€€…İ…¥ĞÉ•…Ñ•I½İÌ¡…•ÍÍQ½­•¸°€‰•µÁ±½å••Ìˆ°É½İÌ¤ì(€€€€€Í•Ñ9½Ñ¥”¡€‘íÉ½İÌ¹±•¹Ñ¡ô•µÁ±½å•”É•½É¡Ì¤¥µÁ½ÉÑ•¹€¤ì(€€€€€Í•Ñ¥±”¡¹Õ±°¤ì(€€€€€Í•ÑAÉ•Ù¥•Ü¡mt¤ì(€€€ô…Ñ €¡…ÕÍ”¤ì(€€€€€Í•ÑÉÉ½È (€€€€€€€…ÕÍ”¥¹ÍÑ…¹•½˜ÉÉ½È(€€€€€€€€€€ü…ÕÍ”¹µ•ÍÍ…”(€€€€€€€€€€è€‰Q¡”™¥±”½Õ±¹½Ğ‰”¥µÁ½ÉÑ•¸ˆ°(€€€€€€¤ì(€€€ô™¥¹…±±äì(€€€€€Í•Ñ	ÕÍä ˆˆ¤ì(€€€ô(€ô((€É•ÑÕÉ¸€ (€€€€ñÍ•Ñ¥½¸ø(€€€€€€ñ¡•…‘•È±…ÍÍ9…µ”ô‰Á…”µ¡•…‘•Èˆø(€€€€€€€€ñ‘¥Øø(€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½Üˆù=É…¹¥é…Ñ¥½¸…‘µ¥¹¥ÍÑÉ…Ñ¥½¸ğ½ÍÁ…¸ø(€€€€€€€€€€ñ Äø(€€€€€€€€€€€€ñ5•¹Õ%½¸¹…µ”õíµ½‘Õ±•%½¸ ‰%µÁ½ÉĞ€˜áÁ½ÉĞˆ¥ô€¼ø(€€€€€€€€€€€%µÁ½ÉĞ€˜áÁ½ÉĞ(€€€€€€€€€€ğ½ Äø(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µÕÑ•ˆø(€€€€€€€€€€€½İ¹±½…É•™•É•¹”‘…Ñ„…ÌMX°½È‰Õ±¬¥µÁ½ÉĞ¹•Ü•µÁ±½å•”É•½É‘Ì(€€€€€€€€€€€™É½´„MX™¥±”¸(€€€€€€€€€€ğ½Àø(€€€€€€€€ğ½‘¥Øø(€€€€€€ğ½¡•…‘•Èø(€€€€€í•ÉÉ½È€˜˜€ (€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰™½É´µ•ÉÉ½ÈˆÉ½±”ô‰…±•ÉĞˆø(€€€€€€€€€í•ÉÉ½Éô(€€€€€€€€ğ½Àø(€€€€€€¥ô(€€€€€í¹½Ñ¥”€˜˜€ (€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰™½É´µµ•ÍÍ…”ˆ…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆø(€€€€€€€€€í¹½Ñ¥•ô(€€€€€€€€ğ½Àø(€€€€€€¥ô((€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰…É‘…Ñ„µÁ…¹•°ˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…¹•°µ¡•…ˆø(€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€ñ ÈùáÁ½ÉĞğ½ Èø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µÕÑ•ˆø(€€€€€€€€€€€€€½İ¹±½…Ñ¡”ÕÉÉ•¹ĞÉ•½É‘Ì™½È„Ñ…‰±”…ÌMX¸(€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Üµ…Ñ¥½¹Ìˆø(€€€€€€€€€í•áÁ½ÉÑQ…‰±•Ì¹µ…À ¡mÑ…‰±”°±…‰•±t¤€ôø€ (€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€­•äõíÑ…‰±•ô(€€€€€€€€€€€€€‘¥Í…‰±•õí‰ÕÍä€ôôôÑ…‰±•ô(€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÙ½¥•áÁ½ÉÑQ…‰±”¡Ñ…‰±”¥ô(€€€€€€€€€€€€ø(€€€€€€€€€€€€€í‰ÕÍä€ôôôÑ…‰±”€ü€‰AÉ•Á…É¥¹ŸŠ˜ˆ€èáÁ½ÉĞ€‘í±…‰•±õô(€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€¤¥ô(€€€€€€€€ğ½‘¥Øø(€€€€€€ğ½…ÉÑ¥±”ø((€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰…É‘…Ñ„µÁ…¹•°ˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…¹•°µ¡•…ˆø(€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€ñ Èù%µÁ½ÉĞ•µÁ±½å••Ìğ½ Èø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µÕÑ•ˆø(€€€€€€€€€€€€€MX½±Õµ¸¡•…‘•ÉÌÍ¡½Õ±µ…Ñ •µÁ±½å•”™¥•±¹…µ•Ì€¡™¥ÉÍÑ}¹…µ”°(€€€€€€€€€€€€€±…ÍÑ}¹…µ”°İ½É­}•µ…¥°°•µÁ±½å••}¹Õµ‰•È°‘•Á…ÉÑµ•¹Ñ}¹…µ”°(€€€€€€€€€€€€€Á½Í¥Ñ¥½¹}Ñ¥Ñ±”¸¸¸¤¸9•ÜÉ½İÌ…É”É•…Ñ•ì•á¥ÍÑ¥¹œ•µÁ±½å••Ì…É”(€€€€€€€€€€€€€¹½Ğµ…Ñ¡•½ÈÕÁ‘…Ñ•¸(€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø(€€€€€€€€ñ±…‰•°¡Ñµ±½Èô‰¥µÁ½ÉĞµ™¥±”ˆø(€€€€€€€€€MX™¥±”(€€€€€€€€€€ñ¥¹ÁÕĞ(€€€€€€€€€€€¥ô‰¥µÁ½ÉĞµ™¥±”ˆ(€€€€€€€€€€€¹…µ”ô‰¥µÁ½ÉÑ}™¥±”ˆ(€€€€€€€€€€€ÑåÁ”ô‰™¥±”ˆ(€€€€€€€€€€€…•ÁĞôˆ¹ÍØ±Ñ•áĞ½ÍØˆ(€€€€€€€€€€€½¹¡…¹”õì¡•Ù•¹Ğ¤€ôøÙ½¥É•…‘¥±”¡•Ù•¹Ğ¹Ñ…É•Ğ¹™¥±•Ìü¹lÁt€üü¹Õ±°¥ô(€€€€€€€€€€¼ø(€€€€€€€€ğ½±…‰•°ø(€€€€€€€íÁÉ•Ù¥•Ü¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ñ…‰±”µÍÉ½±°ˆø(€€€€€€€€€€€€ñÑ…‰±”±…ÍÍ9…µ”ô‰‘…Ñ„µÑ…‰±”ˆø(€€€€€€€€€€€€€€ñÑ¡•…ø(€€€€€€€€€€€€€€€€ñÑÈø(€€€€€€€€€€€€€€€€€í=‰©•Ğ¹­•åÌ¡ÁÉ•Ù¥•İlÁt¤¹µ…À ¡­•ä¤€ôø€ (€€€€€€€€€€€€€€€€€€€€ñÑ ­•äõí­•åôùí­•åôğ½Ñ ø(€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€ğ½ÑÈø(€€€€€€€€€€€€€€ğ½Ñ¡•…ø(€€€€€€€€€€€€€€ñÑ‰½‘äø(€€€€€€€€€€€€€€€íÁÉ•Ù¥•Ü¹µ…À ¡É½Ü°¥¹‘•à¤€ôø€ (€€€€€€€€€€€€€€€€€€ñÑÈ­•äõí¥¹‘•áôø(€€€€€€€€€€€€€€€€€€€í=‰©•Ğ¹­•åÌ¡ÁÉ•Ù¥•İlÁt¤¹µ…À ¡­•ä¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€ñÑ­•äõí­•åôùíMÑÉ¥¹œ¡É½İm­•åt€üü€ˆˆ¥ôğ½Ñø(€€€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€€€ğ½ÑÈø(€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€ğ½Ñ‰½‘äø(€€€€€€€€€€€€ğ½Ñ…‰±”ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€¥ô(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™½É´µ…Ñ¥½¹Ìˆø(€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€±…ÍÍ9…µ”ô‰ÁÉ¥µ…Éäˆ(€€€€€€€€€€€‘¥Í…‰±•õì…™¥±”ñğ‰ÕÍä€ôôô€‰¥µÁ½ÉĞ‰ô(€€€€€€€€€€€½¹±¥¬õì ¤€ôøÙ½¥¥µÁ½ÉÑµÁ±½å••Ì ¥ô(€€€€€€€€€€ø(€€€€€€€€€€€í‰ÕÍä€ôôô€‰¥µÁ½ÉĞˆ€ü€‰%µÁ½ÉÑ¥¹ŸŠ˜ˆ€è€‰%µÁ½ÉĞ•µÁ±½å••Ì‰ô(€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€ğ½‘¥Øø(€€€€€€ğ½…ÉÑ¥±”ø(€€€€ğ½Í•Ñ¥½¸ø(€€¤ì)ô()™Õ¹Ñ¥½¸Á…ÉÍ•ÍØ¡Ñ•áĞèÍÑÉ¥¹œ¤è…Ñ…I½İmtì(€½¹ÍĞ±¥¹•Ì€ôÑ•áĞ(€€€€¹É•Á±…” ½qÉq¸½œ°€‰q¸ˆ¤(€€€€¹ÍÁ±¥Ğ ‰q¸ˆ¤(€€€€¹™¥±Ñ•È ¡±¥¹”¤€ôø±¥¹”¹ÑÉ¥´ ¤¹±•¹Ñ €ø€À¤ì(€¥˜€ …±¥¹•Ì¹±•¹Ñ ¤É•ÑÕÉ¸mtì(€½¹ÍĞÁ…ÉÍ•1¥¹”€ô€¡±¥¹”èÍÑÉ¥¹œ¤€ôøì(€€€½¹ÍĞ•±±ÌèÍÑÉ¥¹mt€ômtì(€€€±•ĞÕÉÉ•¹Ğ€ô€ˆˆ°(€€€€€¥¹EÕ½Ñ•Ì€ô™…±Í”ì(€€€™½È€¡±•Ğ¥¹‘•à€ô€Àì¥¹‘•à€ğ±¥¹”¹±•¹Ñ ì¥¹‘•à€¬ô€Ä¤ì(€€€€€½¹ÍĞ¡…È€ô±¥¹•m¥¹‘•átì(€€€€€¥˜€¡¥¹EÕ½Ñ•Ì¤ì(€€€€€€€¥˜€¡¡…È€ôôô€œˆœ€˜˜±¥¹•m¥¹‘•à€¬€Åt€ôôô€œˆœ¤ì(€€€€€€€€€ÕÉÉ•¹Ğ€¬ô€œˆœì(€€€€€€€€€¥¹‘•à€¬ô€Äì(€€€€€€€ô•±Í”¥˜€¡¡…È€ôôô€œˆœ¤¥¹EÕ½Ñ•Ì€ô™…±Í”ì(€€€€€€€•±Í”ÕÉÉ•¹Ğ€¬ô¡…Èì(€€€€€ô•±Í”¥˜€¡¡…È€ôôô€œˆœ¤¥¹EÕ½Ñ•Ì€ôÑÉÕ”ì(€€€€€•±Í”¥˜€¡¡…È€ôôô€ˆ°ˆ¤ì(€€€€€€€•±±Ì¹ÁÕÍ ¡ÕÉÉ•¹Ğ¤ì(€€€€€€€ÕÉÉ•¹Ğ€ô€ˆˆì(€€€€€ô•±Í”ÕÉÉ•¹Ğ€¬ô¡…Èì(€€€ô(€€€•±±Ì¹ÁÕÍ ¡ÕÉÉ•¹Ğ¤ì(€€€É•ÑÕÉ¸•±±Ìì(€ôì(€½¹ÍĞ¡•…‘•ÉÌ€ôÁ…ÉÍ•1¥¹”¡±¥¹•ÍlÁt¤¹µ…À ¡¡•…‘•È¤€ôø¡•…‘•È¹ÑÉ¥´ ¤¤ì(€É•ÑÕÉ¸±¥¹•Ì¹Í±¥” Ä¤¹µ…À ¡±¥¹”¤€ôøì(€€€½¹ÍĞ•±±Ì€ôÁ…ÉÍ•1¥¹”¡±¥¹”¤ì(€€€½¹ÍĞÉ½Üè…Ñ…I½Ü€ôíôì(€€€¡•…‘•ÉÌ¹™½É…  ¡¡•…‘•È°¥¹‘•à¤€ôøì(€€€€€É½İm¡•…‘•Ét€ô€¡•±±Ím¥¹‘•át€üü€ˆˆ¤¹ÑÉ¥´ ¤ì(€€€ô¤ì(€€€É•ÑÕÉ¸É½Üì(€ô¤ì)ô