import { DataRow } from "./supabase-data";

export function money(value: unknown, currency = "GHS") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    Number(value ?? 0),
  );
}

// Shared with app/document-studio.tsx so payslip printing elsewhere in the app (PayrollPage,
// payroll-settings-page) renders through the same admin-editable template instead of a separate
// hardcoded layout.
export function buildMergeFields(
  employee: DataRow,
  payrollRecord: DataRow | null,
): Record<string, string> {
  const fullName =
    `${employee.first_name ?? ""} ${employee.middle_name ?? ""} ${employee.last_name ?? ""}`
      .replace(/\s+/g, " ")
      .trim();
  const currency = String(
    employee.salary_currency ?? payrollRecord?.currency ?? "GHS",
  );
  return {
    "{{today}}": new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    "{{employee.full_name}}": fullName,
    "{{employee.employee_number}}": String(employee.employee_number ?? ""),
    "{{employee.position_title}}": String(employee.position_title ?? ""),
    "{{employee.department}}": String(
      employee.department_name ?? employee.department_id ?? "",
    ),
    "{{employee.start_date}}": String(employee.start_date ?? ""),
    "{{employee.work_email}}": String(employee.work_email ?? ""),
    "{{employee.salary_amount}}": money(employee.basic_salary, currency),
    "{{employee.salary_frequency}}": String(
      employee.salary_frequency ?? "monthly",
    ),
    "{{employee.monthly_salary}}": money(
      employee.monthly_salary ?? employee.basic_salary,
      currency,
    ),
    "{{employee.annual_salary}}": money(employee.annual_salary, currency),
    "{{employee.salary_currency}}": currency,
    "{{payroll.pay_period}}": String(
      payrollRecord?.pay_period ?? "Not yet processed",
    ),
    "{{payroll.basic_salary}}": money(
      payrollRecord?.basic_salary ??
        employee.monthly_salary ??
        employee.basic_salary,
      currency,
    ),
    "{{payroll.allowances}}": money(payrollRecord?.allowances, currency),
    "{{payroll.paye_tax}}": money(payrollRecord?.paye_tax, currency),
    "{{payroll.employee_ssnit}}": money(
      payrollRecord?.employee_ssnit,
      currency,
    ),
    "{{payroll.tier_one}}": money(payrollRecord?.tier_one, currency),
    "{{payroll.tier_two}}": money(payrollRecord?.tier_two, currency),
    "{{payroll.tier_three}}": money(payrollRecord?.tier_three, currency),
    "{{payroll.net_pay}}": money(payrollRecord?.net_pay, currency),
  };
}

export function renderTemplateContent(
  templateContent: string,
  employee: DataRow,
  payrollRecord: DataRow | null,
) {
  let content = templateContent;
  for (const [field, result] of Object.entries(
    buildMergeFields(employee, payrollRecord),
  ))
    content = content.replaceAll(field, result);
  return content;
}

export type PrintTemplateOptions = {
  header?: string;
  footer?: string;
  primaryColour?: string;
  secondaryColour?: string;
  backgroundColour?: string;
  textAlign?: "left" | "center" | "right" | "justify";
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

function renderDocumentMarkup(content: string) {
  return escapeHtml(content)
    .replace(/\[heading\]([\s\S]*?)\[\/heading\]/gi, "<h2>$1</h2>")
    .replace(
      /\[align=(left|center|right|justify)\]([\s\S]*?)\[\/align\]/gi,
      '<div style="text-align:$1">$2</div>',
    )
    .replace(
      /\[box\]([\s\S]*?)\[\/box\]/gi,
      '<div class="document-box">$1</div>',
    )
    .replace(/\[line\]/gi, "<hr>")
    .replace(/\n/g, "<br>");
}

export function printTemplateDocument(
  title: string,
  content: string,
  signatureUrl?: string,
  options: PrintTemplateOptions = {},
) {
  const popup = window.open("", "_blank", "width=900,height=900");
  const root = document.documentElement.dataset;
  const companyName = root.companyName || "SAS Finance Group Ghana";
  const companyAddress = root.companyAddress || "";
  const companyLogo = root.companyLogo || "/logo.png";
  const primary =
    options.primaryColour ||
    getComputedStyle(document.documentElement)
      .getPropertyValue("--brand")
      .trim() ||
    "#00AEEF";
  const secondary = options.secondaryColour || "#0b1426";
  const background = options.backgroundColour || "#ffffff";
  const align = options.textAlign || "left";
  const safeTitle = escapeHtml(title);
  popup?.document.write(
    `<!doctype html><html><head><title>${safeTitle}</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:14px Arial;color:${secondary};background:${background};padding:32px;line-height:1.65}header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid ${primary};padding-bottom:18px;margin-bottom:30px}header img{width:190px;max-height:80px;object-fit:contain;object-position:left top}.company{text-align:right}.company strong{display:block;font-size:16px}.company span{display:block;max-width:300px;white-space:pre-line}main{text-align:${align}}h1,h2,h3{color:${secondary};line-height:1.25}.document-box{border:1px solid #cbd5e1;border-left:4px solid ${primary};padding:14px 16px;margin:14px 0;border-radius:6px}hr{border:0;border-top:2px solid ${primary};margin:20px 0}.signature{width:180px;max-height:90px;object-fit:contain;margin-top:36px}footer{border-top:1px solid #cbd5e1;margin-top:38px;padding-top:12px;color:#64748b;font-size:11px;white-space:pre-line}button{margin-top:30px;padding:10px 14px}@media print{body{padding:0}button{display:none}}</style></head><body><header><img src="${escapeHtml(companyLogo)}" alt="${escapeHtml(companyName)} logo"/><div class="company"><strong>${escapeHtml(companyName)}</strong><span>${escapeHtml(options.header || companyAddress)}</span></div></header><main><h1>${safeTitle}</h1>${renderDocumentMarkup(content)}</main>${signatureUrl ? `<img class="signature" src="${escapeHtml(signatureUrl)}" alt="Authorised signature"/>` : ""}<footer>${escapeHtml(options.footer || `${companyName}${companyAddress ? `\n${companyAddress}` : ""}`)}</footer><button onclick="window.print()">Print / Save PDF</button></body></html>`,
  );
  popup?.document.close();
}
