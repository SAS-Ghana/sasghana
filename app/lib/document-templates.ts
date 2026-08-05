import { DataRow } from "./supabase-data";

export function money(value: unknown, currency = "GHS") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(value ?? 0));
}

// Shared with app/document-studio.tsx so payslip printing elsewhere in the app (PayrollPage,
// payroll-settings-page) renders through the same admin-editable template instead of a separate
// hardcoded layout.
export function buildMergeFields(employee: DataRow, payrollRecord: DataRow | null): Record<string, string> {
  const fullName = `${employee.first_name ?? ""} ${employee.middle_name ?? ""} ${employee.last_name ?? ""}`.replace(/\s+/g, " ").trim();
  const currency = String(employee.salary_currency ?? payrollRecord?.currency ?? "GHS");
  return {
    "{{today}}": new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    "{{employee.full_name}}": fullName,
    "{{employee.employee_number}}": String(employee.employee_number ?? ""),
    "{{employee.position_title}}": String(employee.position_title ?? ""),
    "{{employee.department}}": String(employee.department_name ?? employee.department_id ?? ""),
    "{{employee.start_date}}": String(employee.start_date ?? ""),
    "{{employee.work_email}}": String(employee.work_email ?? ""),
    "{{employee.salary_amount}}": money(employee.basic_salary, currency),
    "{{employee.salary_frequency}}": String(employee.salary_frequency ?? "monthly"),
    "{{employee.monthly_salary}}": money(employee.monthly_salary ?? employee.basic_salary, currency),
    "{{employee.annual_salary}}": money(employee.annual_salary, currency),
    "{{employee.salary_currency}}": currency,
    "{{payroll.pay_period}}": String(payrollRecord?.pay_period ?? "Not yet processed"),
    "{{payroll.basic_salary}}": money(payrollRecord?.basic_salary ?? employee.monthly_salary ?? employee.basic_salary, currency),
    "{{payroll.allowances}}": money(payrollRecord?.allowances, currency),
    "{{payroll.paye_tax}}": money(payrollRecord?.paye_tax, currency),
    "{{payroll.employee_ssnit}}": money(payrollRecord?.employee_ssnit, currency),
    "{{payroll.tier_one}}": money(payrollRecord?.tier_one, currency),
    "{{payroll.tier_two}}": money(payrollRecord?.tier_two, currency),
    "{{payroll.tier_three}}": money(payrollRecord?.tier_three, currency),
    "{{payroll.net_pay}}": money(payrollRecord?.net_pay, currency),
  };
}

export function renderTemplateContent(templateContent: string, employee: DataRow, payrollRecord: DataRow | null) {
  let content = templateContent;
  for (const [field, result] of Object.entries(buildMergeFields(employee, payrollRecord))) content = content.replaceAll(field, result);
  return content;
}

export function printTemplateDocument(title: string, content: string, signatureUrl?: string) {
  const popup = window.open("", "_blank", "width=900,height=900");
  const escaped = content.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character));
  popup?.document.write(`<!doctype html><html><head><title>${escaped ? title : title}</title><style>body{font:15px Arial;color:#0b1426;padding:48px;line-height:1.65}header{border-bottom:3px solid #00afe3;padding-bottom:18px;margin-bottom:36px}header img{width:220px}main{white-space:pre-wrap}.signature{width:180px;max-height:90px;object-fit:contain;margin-top:36px}button{margin-top:30px;padding:10px 14px}@media print{button{display:none}}</style></head><body><header><img src="/logo.png" alt="Company logo"/></header><main>${escaped}</main>${signatureUrl ? `<img class="signature" src="${signatureUrl}"/>` : ""}<button onclick="window.print()">Print / Save PDF</button></body></html>`);
  popup?.document.close();
}
