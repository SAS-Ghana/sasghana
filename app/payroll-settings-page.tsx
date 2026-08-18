import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  callRpc,
  createRow,
  DataRow,
  deleteRow,
  listNamedRows,
  listRowsWhere,
  updateRow,
} from "./lib/supabase-data";
import {
  printTemplateDocument,
  renderTemplateContent,
} from "./lib/document-templates";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

const rateFields: [string, string, string][] = [
  ["employee_ssnit_rate", "Employee SSNIT", "5.5"],
  ["employer_ssnit_rate", "Employer SSNIT", "13"],
  ["tier_one_rate", "Tier 1", "13.5"],
  ["tier_two_rate", "Tier 2", "5"],
  ["nhis_from_tier_one_rate", "NHIS portion of Tier 1", "2.5"],
  ["tier_three_rate", "Default Tier 3", "0"],
  ["health_insurance_rate", "Additional employee health insurance", "0"],
  ["vat_rate", "VAT reference rate", "15"],
  ["nhil_rate", "NHIL reference rate", "2.5"],
  ["getfund_rate", "GETFund reference rate", "2.5"],
];

export function PayrollSettingsPage({
  accessToken,
  organisationId,
}: {
  accessToken: string;
  organisationId: string;
}) {
  const [settings, setSettings] = useState<DataRow>({}),
    [payroll, setPayroll] = useState<DataRow[]>([]),
    [employees, setEmployees] = useState<DataRow[]>([]),
    [comp, setComp] = useState<DataRow[]>([]),
    [components, setComponents] = useState<DataRow[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [payrollPeriod, setPayrollPeriod] = useState("all"),
    [dialog, setDialog] = useState<"salary" | "component" | "run" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [payslipTemplate, setPayslipTemplate] = useState<DataRow | null>(null);
  const load = useCallback(async () => {
    try {
      const [s, p, e, c, pc] = await Promise.all([
        listRowsWhere(
          accessToken,
          "payroll_settings",
          { organisation_id: organisationId },
          "*",
          1,
        ),
        listRowsWhere(
          accessToken,
          "payroll_records",
          { organisation_id: organisationId },
          "*",
          500,
        ),
        listNamedRows(
          accessToken,
          "employees",
          "id,first_name,middle_name,last_name,employee_number,position_title,department_id,department_name,start_date,work_email,basic_salary,salary_frequency,salary_currency,monthly_salary,annual_salary",
          "first_name",
        ),
        listRowsWhere(
          accessToken,
          "employee_compensation",
          { organisation_id: organisationId },
          "*",
          1000,
        ),
        listRowsWhere(
          accessToken,
          "payroll_component_assignments",
          { organisation_id: organisationId },
          "*",
          1000,
        ),
      ]);
      setSettings(s[0] ?? {});
      setPayroll(p);
      setEmployees(e);
      setComp(c);
      setComponents(pc);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payroll configuration could not be loaded.",
      );
    }
  }, [accessToken, organisationId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    listRowsWhere(
      accessToken,
      "document_templates",
      { template_type: "payslip", status: "active" },
      "*",
      1,
    )
      .then((rows) => setPayslipTemplate(rows[0] ?? null))
      .catch(() => setPayslipTemplate(null));
  }, [accessToken]);
  function printPayslip(row: DataRow) {
    const employee = employees.find(
      (x) => String(x.id) === String(row.employee_id),
    );
    if (!employee) return;
    if (payslipTemplate) {
      printTemplateDocument(
        String(payslipTemplate.name ?? "Payslip"),
        renderTemplateContent(
          String(payslipTemplate.content ?? ""),
          employee,
          row,
        ),
        undefined,
        {
          header: String(payslipTemplate.header_content ?? ""),
          footer: String(payslipTemplate.footer_content ?? ""),
          primaryColour: String(payslipTemplate.primary_colour ?? "#00AEEF"),
          secondaryColour: String(
            payslipTemplate.secondary_colour ?? "#0B1426",
          ),
          backgroundColour: String(
            payslipTemplate.background_colour ?? "#FFFFFF",
          ),
          textAlign: String(payslipTemplate.css ?? "left") as
            | "left"
            | "center"
            | "right"
            | "justify",
        },
      );
    } else {
      printTemplateDocument(
        "Payslip",
        `Payslip for ${name(row.employee_id)}\nPeriod: ${row.pay_period}\nNet pay: ${money(row.net_pay)}`,
      );
    }
  }
  const allSelected =
    employees.length > 0 && selected.length === employees.length;
  const toggle = (id: string) =>
    setSelected((x) =>
      x.includes(id) ? x.filter((v) => v !== id) : [...x, id],
    );
  const payrollPeriods = useMemo(
    () =>
      [...new Set(payroll.map((row) => String(row.pay_period ?? "")))]
        .filter(Boolean)
        .sort()
        .reverse(),
    [payroll],
  );
  const reportRows = useMemo(
    () =>
      payroll.filter(
        (row) =>
          (payrollPeriod === "all" ||
            String(row.pay_period) === payrollPeriod) &&
          (!selected.length || selected.includes(String(row.employee_id))),
      ),
    [payroll, payrollPeriod, selected],
  );
  function exportPayrollCsv() {
    const columns: [string, string][] = [
      ["employee_id", "Employee"],
      ["pay_period", "Period"],
      ["gross_salary", "Gross"],
      ["allowances_total", "Allowances"],
      ["benefits_total", "Benefits"],
      ["taxable_income", "Taxable income"],
      ["paye_tax", "PAYE"],
      ["employee_ssnit", "Employee SSNIT"],
      ["employer_ssnit", "Employer SSNIT"],
      ["tier_one", "Tier 1"],
      ["tier_two", "Tier 2"],
      ["tier_three", "Tier 3"],
      ["health_insurance_deduction", "Health"],
      ["other_deductions", "Other deductions"],
      ["net_pay", "Net pay"],
      ["status", "Status"],
    ];
    const lines = [
      columns.map(([, label]) => label),
      ...reportRows.map((row) =>
        columns.map(([key]) =>
          key === "employee_id"
            ? name(row.employee_id)
            : String(row[key] ?? ""),
        ),
      ),
    ];
    const blob = new Blob(
      [
        lines
          .map((line) =>
            line.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `payroll-${payrollPeriod}-${selected.length ? "selected" : "all"}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function printPayrollReport() {
    const content = reportRows
      .map(
        (row) =>
          `[heading]${name(row.employee_id)} — ${String(row.pay_period)}[/heading]\nGross: ${money(row.gross_salary)}\nAllowances: ${money(row.allowances_total ?? row.allowances)}\nBenefits: ${money(row.benefits_total)}\nTaxable income: ${money(row.taxable_income)}\nPAYE: ${money(row.paye_tax)}\nEmployee SSNIT: ${money(row.employee_ssnit)}\nEmployer SSNIT: ${money(row.employer_ssnit)}\nTier 1: ${money(row.tier_one)}\nTier 2: ${money(row.tier_two)}\nTier 3: ${money(row.tier_three)}\nHealth: ${money(row.health_insurance_deduction)}\nOther deductions: ${money(row.other_deductions)}\nNet pay: ${money(row.net_pay)}\n[line]`,
      )
      .join("\n");
    printTemplateDocument(
      `Payroll report — ${payrollPeriod === "all" ? "All periods" : payrollPeriod}`,
      content || "No payroll records match the selection.",
    );
  }
  async function removePayroll(row: DataRow) {
    if (
      !window.confirm(
        `Remove ${name(row.employee_id)} from payroll for ${String(row.pay_period)}?`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteRow(accessToken, "payroll_records", String(row.id));
      setNotice(
        "Payroll record removed. Employee history remains available in audit logs.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payroll record could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: DataRow = {
        organisation_id: organisationId,
        currency: String(settings.currency ?? "GHS"),
      };
      for (const [key] of rateFields) payload[key] = Number(settings[key] ?? 0);
      if (settings.id)
        await updateRow(
          accessToken,
          "payroll_settings",
          String(settings.id),
          payload,
        );
      else await createRow(accessToken, "payroll_settings", payload);
      setNotice("Payroll percentages saved.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payroll settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function recalc(id: string) {
    setBusy(true);
    try {
      await callRpc(accessToken, "recalculate_payroll_record", {
        p_record_id: id,
      });
      setNotice("Payroll tax, pension, benefits and net pay recalculated.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payroll could not be recalculated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function recalcAll() {
    setBusy(true);
    try {
      for (const row of payroll)
        if (row.id)
          await callRpc(accessToken, "recalculate_payroll_record", {
            p_record_id: row.id,
          });
      setNotice(`${payroll.length} payroll record(s) recalculated.`);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Bulk recalculation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const name = (id: unknown) => {
    const e = employees.find((x) => String(x.id) === String(id));
    return e ? `${e.first_name} ${e.last_name}` : "Employee";
  };
  return (
    <section>
      <header className="page-header">
        <div>
          <span className="eyebrow">Ghana payroll automation</span>
          <h1>
            <MenuIcon name={moduleIcon("Payroll")} />
            Payroll, tax, benefits and payslips
          </h1>
          <p className="muted">
            Set monthly or annual salaries, assign percentage or fixed benefits
            to multiple employees, and automatically calculate PAYE, SSNIT,
            tiers, allowances and net pay.
          </p>
        </div>
        <div className="row-actions">
          <button onClick={() => setDialog("salary")}>Set salaries</button>
          <button onClick={() => setDialog("component")}>
            Assign tax or benefit
          </button>
          <button className="primary" onClick={() => setDialog("run")}>
            Run payroll
          </button>
        </div>
      </header>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-message">{notice}</p>}
      <article className="card data-panel">
        <div className="panel-head">
          <div>
            <h2>Select employees</h2>
            <p className="muted">
              Selections apply to salary setup, components and payroll runs.
            </p>
          </div>
          <button
            onClick={() =>
              setSelected(allSelected ? [] : employees.map((x) => String(x.id)))
            }
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>
        <div className="checkbox-grid">
          {employees.map((e) => (
            <label className="check" key={String(e.id)}>
              <input
                type="checkbox"
                checked={selected.includes(String(e.id))}
                onChange={() => toggle(String(e.id))}
              />
              {e.first_name} {e.last_name} ({e.employee_number})
            </label>
          ))}
        </div>
      </article>
      <div className="grid">
        <article className="card panel">
          <h2>Rates and statutory references</h2>
          <form className="record-form" onSubmit={saveSettings}>
            {rateFields.map(([key, label, fallback]) => (
              <label key={key}>
                {label} %
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(settings[key] ?? fallback)}
                  onChange={(e) =>
                    setSettings({ ...settings, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Currency
              <input
                value={String(settings.currency ?? "GHS")}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    currency: e.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <div className="form-actions wide">
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save percentages"}
              </button>
            </div>
          </form>
        </article>
        <article className="card data-panel">
          <h2>Employee salary setup</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Frequency</th>
                  <th>Entered salary</th>
                  <th>Monthly basic</th>
                  <th>Allowance %</th>
                  <th>Tier 3 %</th>
                  <th>Health %</th>
                </tr>
              </thead>
              <tbody>
                {comp.map((r) => (
                  <tr key={String(r.id)}>
                    <td>{name(r.employee_id)}</td>
                    <td>{String(r.salary_frequency)}</td>
                    <td>{money(r.salary_amount)}</td>
                    <td>{money(r.monthly_basic_salary)}</td>
                    <td>{r.allowance_rate}%</td>
                    <td>{r.tier_three_rate}%</td>
                    <td>{r.health_insurance_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
      <article className="card data-panel">
        <div className="panel-head">
          <div>
            <h2>Assigned payroll components</h2>
            <p className="muted">
              Allowances, benefits, deductions, taxes and pensions assigned to
              employees.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Component</th>
                <th>Method</th>
                <th>Rate</th>
                <th>Fixed amount</th>
                <th>Employer paid</th>
              </tr>
            </thead>
            <tbody>
              {components.map((r) => (
                <tr key={String(r.id)}>
                  <td>{name(r.employee_id)}</td>
                  <td>{String(r.component_type)}</td>
                  <td>{String(r.component_name)}</td>
                  <td>{String(r.calculation_method)}</td>
                  <td>{r.rate}%</td>
                  <td>{money(r.fixed_amount)}</td>
                  <td>{r.employer_paid ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <article className="card data-panel">
        <div className="panel-head">
          <div>
            <h2>Payroll calculations</h2>
            <p className="muted">
              Published records become available in employee self service and
              payslips.
            </p>
          </div>
          <div className="row-actions">
            <select
              aria-label="Payroll report period"
              value={payrollPeriod}
              onChange={(event) => setPayrollPeriod(event.target.value)}
            >
              <option value="all">All months</option>
              {payrollPeriods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
            <button onClick={exportPayrollCsv}>Export Excel / CSV</button>
            <button onClick={printPayrollReport}>Print report</button>
            <button onClick={() => void recalcAll()} disabled={busy}>
              Recalculate all
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Period</th>
                <th>Frequency</th>
                <th>Annual</th>
                <th>Monthly</th>
                <th>Gross</th>
                <th>Allowances</th>
                <th>Benefits</th>
                <th>PAYE</th>
                <th>SSNIT</th>
                <th>Tier 2</th>
                <th>Tier 3</th>
                <th>Health</th>
                <th>Net pay</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row) => (
                <tr key={String(row.id)}>
                  <td>{name(row.employee_id)}</td>
                  <td>{String(row.pay_period ?? "—")}</td>
                  <td>{String(row.salary_frequency ?? "monthly")}</td>
                  <td>{money(row.annual_salary)}</td>
                  <td>{money(row.monthly_salary ?? row.basic_salary)}</td>
                  <td>{money(row.gross_salary)}</td>
                  <td>{money(row.allowances_total ?? row.allowances)}</td>
                  <td>{money(row.benefits_total)}</td>
                  <td>{money(row.paye_tax)}</td>
                  <td>{money(row.employee_ssnit)}</td>
                  <td>{money(row.tier_two)}</td>
                  <td>{money(row.tier_three)}</td>
                  <td>{money(row.health_insurance_deduction)}</td>
                  <td>{money(row.net_pay)}</td>
                  <td>{String(row.status)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        disabled={busy}
                        onClick={() => void recalc(String(row.id))}
                      >
                        Auto calculate
                      </button>
                      <button onClick={() => printPayslip(row)}>
                        Print payslip
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => void removePayroll(row)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      {dialog === "salary" && (
        <SalaryDialog
          accessToken={accessToken}
          organisationId={organisationId}
          employeeIds={selected}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await load();
            setNotice("Salary setup saved for selected employees.");
          }}
        />
      )}
      {dialog === "component" && (
        <ComponentDialog
          accessToken={accessToken}
          employeeIds={selected}
          onClose={() => setDialog(null)}
          onSaved={async (n) => {
            setDialog(null);
            await load();
            setNotice(`${n} component assignment(s) created.`);
          }}
        />
      )}
      {dialog === "run" && (
        <RunDialog
          accessToken={accessToken}
          employeeIds={selected}
          onClose={() => setDialog(null)}
          onSaved={async (n) => {
            setDialog(null);
            await load();
            setNotice(`${n} payroll record(s) created and calculated.`);
          }}
        />
      )}
    </section>
  );
}
function money(v: unknown) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "GHS",
  }).format(Number(v ?? 0));
}
function SalaryDialog({
  accessToken,
  organisationId,
  employeeIds,
  onClose,
  onSaved,
}: {
  accessToken: string;
  organisationId: string;
  employeeIds: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [v, setV] = useState({
      salary_amount: "",
      salary_frequency: "monthly",
      allowance_rate: "0",
      bonus_rate: "0",
      overtime_rate: "0",
      tier_three_rate: "0",
      health_insurance_rate: "0",
      effective_from: new Date().toISOString().slice(0, 10),
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!employeeIds.length) return setError("Select at least one employee.");
    setBusy(true);
    try {
      for (const id of employeeIds)
        await createRow(accessToken, "employee_compensation", {
          organisation_id: organisationId,
          employee_id: id,
          ...v,
          salary_amount: Number(v.salary_amount),
          allowance_rate: Number(v.allowance_rate),
          bonus_rate: Number(v.bonus_rate),
          overtime_rate: Number(v.overtime_rate),
          tier_three_rate: Number(v.tier_three_rate),
          health_insurance_rate: Number(v.health_insurance_rate),
        });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Salary setup failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Set salaries" onClose={onClose}>
      <form className="record-form" onSubmit={submit}>
        <label>
          Salary amount
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={v.salary_amount}
            onChange={(e) => setV({ ...v, salary_amount: e.target.value })}
          />
        </label>
        <label>
          Frequency
          <select
            value={v.salary_frequency}
            onChange={(e) => setV({ ...v, salary_frequency: e.target.value })}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        {(
          [
            ["allowance_rate", "Allowance %"],
            ["bonus_rate", "Bonus %"],
            ["overtime_rate", "Overtime %"],
            ["tier_three_rate", "Tier 3 %"],
            ["health_insurance_rate", "Health insurance %"],
          ] as [keyof typeof v, string][]
        ).map(([k, l]) => (
          <label key={k}>
            {l}
            <input
              type="number"
              min="0"
              step="0.01"
              value={v[k]}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Effective from
          <input
            type="date"
            value={v.effective_from}
            onChange={(e) => setV({ ...v, effective_from: e.target.value })}
          />
        </label>
        {error && <p className="form-error wide">{error}</p>}
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}
function ComponentDialog({
  accessToken,
  employeeIds,
  onClose,
  onSaved,
}: {
  accessToken: string;
  employeeIds: string[];
  onClose: () => void;
  onSaved: (n: number) => Promise<void>;
}) {
  const [v, setV] = useState({
      component_type: "benefit",
      component_name: "",
      calculation_method: "percentage",
      rate: "0",
      fixed_amount: "0",
      taxable: false,
      pensionable: false,
      employer_paid: false,
      effective_from: new Date().toISOString().slice(0, 10),
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!employeeIds.length) return setError("Select at least one employee.");
    setBusy(true);
    try {
      const n = await callRpc<number>(
        accessToken,
        "bulk_assign_payroll_component",
        {
          p_employee_ids: employeeIds,
          p_component_type: v.component_type,
          p_component_name: v.component_name,
          p_calculation_method: v.calculation_method,
          p_rate: Number(v.rate),
          p_fixed_amount: Number(v.fixed_amount),
          p_taxable: v.taxable,
          p_pensionable: v.pensionable,
          p_employer_paid: v.employer_paid,
          p_effective_from: v.effective_from,
        },
      );
      await onSaved(Number(n));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Component assignment failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Assign tax, allowance or benefit" onClose={onClose}>
      <form className="record-form" onSubmit={submit}>
        <label>
          Type
          <select
            value={v.component_type}
            onChange={(e) => setV({ ...v, component_type: e.target.value })}
          >
            {["allowance", "benefit", "deduction", "tax", "pension"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Name
          <input
            required
            value={v.component_name}
            onChange={(e) => setV({ ...v, component_name: e.target.value })}
          />
        </label>
        <label>
          Method
          <select
            value={v.calculation_method}
            onChange={(e) => setV({ ...v, calculation_method: e.target.value })}
          >
            <option value="percentage">Percentage of monthly basic</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </label>
        <label>
          Rate %
          <input
            type="number"
            step="0.01"
            value={v.rate}
            onChange={(e) => setV({ ...v, rate: e.target.value })}
          />
        </label>
        <label>
          Fixed amount
          <input
            type="number"
            step="0.01"
            value={v.fixed_amount}
            onChange={(e) => setV({ ...v, fixed_amount: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={v.taxable}
            onChange={(e) => setV({ ...v, taxable: e.target.checked })}
          />{" "}
          Taxable allowance
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={v.pensionable}
            onChange={(e) => setV({ ...v, pensionable: e.target.checked })}
          />{" "}
          Pensionable
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={v.employer_paid}
            onChange={(e) => setV({ ...v, employer_paid: e.target.checked })}
          />{" "}
          Employer paid benefit
        </label>
        {error && <p className="form-error wide">{error}</p>}
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}
function RunDialog({
  accessToken,
  employeeIds,
  onClose,
  onSaved,
}: {
  accessToken: string;
  employeeIds: string[];
  onClose: () => void;
  onSaved: (n: number) => Promise<void>;
}) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)),
    [publish, setPublish] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!employeeIds.length) return setError("Select at least one employee.");
    setBusy(true);
    try {
      const n = await callRpc<number>(accessToken, "bulk_create_payroll", {
        p_employee_ids: employeeIds,
        p_pay_period: period,
        p_salary_frequency: "monthly",
        p_publish: publish,
      });
      await onSaved(Number(n));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payroll run failed. Confirm every selected employee has salary setup.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Run payroll" onClose={onClose}>
      <form className="record-form" onSubmit={submit}>
        <label>
          Pay period
          <input
            required
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
          />{" "}
          Publish payslips immediately
        </label>
        {error && <p className="form-error wide">{error}</p>}
        <Actions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal record-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">Payroll automation</span>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
function Actions({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  return (
    <div className="form-actions wide">
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save and calculate"}
      </button>
    </div>
  );
}
