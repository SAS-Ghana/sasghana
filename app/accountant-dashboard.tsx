import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { callRpc, DataRow, listRows, updateRow } from "./lib/supabase-data";
import { realtimeClient } from "./lib/supabase-realtime";
import { AvatarPhoto } from "./avatar-photo";
import { BarChart } from "./dashboard-charts";
import { MenuIcon } from "./menu-icon";

function money(value: unknown, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(Number(value ?? 0));
}

function nameOf(row: DataRow | undefined) {
  if (!row) return "—";
  return String(row.display_name ?? row.full_name ?? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "—");
}

function monthIndex(row: DataRow) {
  const raw = row.payment_date ?? row.published_at ?? row.created_at;
  const date = raw ? new Date(String(raw)) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().getMonth() : date.getMonth();
}

export function AccountantDashboard({ accessToken, profile, onNavigate }: { accessToken: string; profile: UserProfile; onNavigate: (page: string) => void }) {
  const [data, setData] = useState<Record<string, DataRow[]>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    const read = async (table: string, limit = 1000) => {
      try { return await listRows(accessToken, table, "*", limit); }
      catch { return []; }
    };
    try {
      const [employees, payroll, expenses, purchases, pettyCash, budgets, benefits, profiles, tasks, audit] = await Promise.all([
        read("employees"), read("payroll_records"), read("expense_claims"), read("purchase_requests"), read("petty_cash_requests"),
        read("department_budgets"), read("employee_benefits"), read("profiles"), read("tasks", 200), read("audit_logs", 100),
      ]);
      setData({ employees, payroll, expenses, purchases, pettyCash, budgets, benefits, profiles, tasks, audit });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Accounts dashboard could not be loaded.");
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const client = realtimeClient(accessToken);
    let channel = client.channel(`accountant-dashboard-${profile.organisation_id}-${profile.id}`);
    for (const table of ["payroll_records", "expense_claims", "purchase_requests", "petty_cash_requests", "department_budgets", "employee_benefits"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `organisation_id=eq.${profile.organisation_id}` }, () => void load());
    }
    channel.subscribe();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { window.clearInterval(timer); void client.removeChannel(channel); };
  }, [accessToken, load, profile.id, profile.organisation_id]);

  const employees = data.employees ?? [], payroll = data.payroll ?? [], expenses = data.expenses ?? [], purchases = data.purchases ?? [], pettyCash = data.pettyCash ?? [], budgets = data.budgets ?? [], benefits = data.benefits ?? [], profiles = data.profiles ?? [];
  const profilesById = useMemo(() => new Map(profiles.map((row) => [String(row.id), row])), [profiles]);
  const payrollByEmployee = useMemo(() => {
    const map = new Map<string, DataRow>();
    for (const row of payroll) if (!map.has(String(row.employee_id))) map.set(String(row.employee_id), row);
    return map;
  }, [payroll]);

  const financeExpenses = expenses.filter((row) => ["finance_review", "approved"].includes(String(row.status)));
  const accountPurchases = purchases.filter((row) => String(row.status) === "accounts_review");
  const accountPettyCash = pettyCash.filter((row) => ["manager_approved", "accounts_review", "approved"].includes(String(row.status)));
  const grossPayroll = payroll.reduce((sum, row) => sum + Number(row.gross_salary ?? row.total_rewards ?? row.basic_salary ?? 0), 0);
  const netPayroll = payroll.reduce((sum, row) => sum + Number(row.net_pay ?? 0), 0);
  const paye = payroll.reduce((sum, row) => sum + Number(row.paye_tax ?? row.tax_deduction ?? 0), 0);
  const ssnit = payroll.reduce((sum, row) => sum + Number(row.employee_ssnit ?? row.ssnit_deduction ?? 0) + Number(row.employer_ssnit ?? 0), 0);
  const benefitsTotal = payroll.reduce((sum, row) => sum + Number(row.benefits_total ?? row.employer_benefits_total ?? 0), 0);
  const pendingPayments = financeExpenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) + accountPurchases.reduce((sum, row) => sum + Number(row.estimated_total ?? 0), 0) + accountPettyCash.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const netByMonth = Array.from({ length: 12 }, () => 0);
  for (const row of payroll) netByMonth[monthIndex(row)] += Number(row.net_pay ?? 0);

  const queue = [
    ...financeExpenses.map((row) => ({ kind: "Expense", id: row.id, title: String(row.description ?? row.category ?? "Expense claim"), amount: Number(row.amount ?? 0), status: String(row.status), approver: nameOf(profilesById.get(String(row.reviewed_by ?? row.finance_reviewed_by ?? ""))), page: "Expense Approvals" })),
    ...accountPurchases.map((row) => ({ kind: "Purchase", id: row.id, title: String(row.title ?? "Purchase request"), amount: Number(row.estimated_total ?? 0), status: String(row.status), approver: nameOf(profilesById.get(String(row.manager_reviewed_by ?? ""))), page: "Purchase Approvals" })),
    ...accountPettyCash.map((row) => ({ kind: "Petty cash", id: row.id, title: String(row.purpose ?? "Petty cash request"), amount: Number(row.amount ?? 0), status: String(row.status), approver: nameOf(profilesById.get(String(row.approved_by ?? ""))), page: "Expense Approvals" })),
  ].slice(0, 8);

  async function payPurchase(rowId: unknown) {
    const id = String(rowId ?? ""); if (!id) return;
    const reference = window.prompt("Enter payment reference, bank transfer reference or voucher number:", "");
    if (reference === null) return;
    const comment = window.prompt("Accounts note (optional):", "") ?? "";
    setBusy(id); setError(""); setNotice("");
    try {
      try {
        await callRpc(accessToken, "process_purchase_request_accounts", { p_request_id: id, p_action: "pay_and_send", p_comment: comment || null, p_payment_reference: reference || null });
      } catch {
        await updateRow(accessToken, "purchase_requests", id, { status: "pending_procurement", current_stage: "procurement", accounts_comment: comment || `Paid by Accounts${reference ? ` — ${reference}` : ""}` });
      }
      await load();
      setNotice("Payment recorded and the request has been forwarded to Procurement.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Payment could not be recorded."); }
    finally { setBusy(""); }
  }

  return <section className="accountant-dashboard dashboard-workspace enterprise-home-dashboard">
    <header className="finance-welcome card">
      <div className="page-header-with-photo"><AvatarPhoto accessToken={accessToken} path={profile.avatar_path} name={profile.display_name} size={58} /><div><span className="eyebrow">Finance & Accounts workspace</span><h1>Welcome back, {profile.display_name.split(" ")[0]}</h1><p>{queue.length} item{queue.length === 1 ? "" : "s"} require Accounts attention · {money(pendingPayments)} currently awaiting payment or release.</p></div></div>
      <div className="page-header-actions"><button className="secondary" onClick={() => void load()}>Refresh</button><button className="primary" onClick={() => onNavigate("Purchase Approvals")}>Open Accounts Queue</button></div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-message">{notice}</p>}

    <div className="finance-kpi-grid">
      {[["Gross payroll", money(grossPayroll)], ["Net payroll", money(netPayroll)], ["PAYE due", money(paye)], ["SSNIT & employer contributions", money(ssnit)], ["Benefits cost", money(benefitsTotal)], ["Expense payments", financeExpenses.length], ["Purchases awaiting Accounts", accountPurchases.length], ["Petty cash queue", accountPettyCash.length]].map(([label, value]) => <article className="card finance-kpi" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
    </div>

    <div className="finance-main-grid">
      <article className="card enterprise-widget finance-chart-card"><header><div><h2>Payroll & Statutory Overview</h2><p>Monthly net payroll movement</p></div><button onClick={() => onNavigate("Reports & Analytics")}>View reports</button></header><BarChart values={netByMonth} xLabels={months} /></article>
      <article className="card enterprise-widget payment-queue-widget"><header><div><h2>Accounts Payment Queue</h2><p>Approved requests awaiting Accounts action</p></div><button onClick={() => onNavigate("Purchase Approvals")}>View All</button></header>
        <div className="finance-payment-list">{queue.map((item) => <div key={`${item.kind}-${String(item.id)}`}><div><span className="finance-type">{item.kind}</span><strong>{item.title}</strong><small>Approved by {item.approver}</small></div><div className="finance-payment-meta"><b>{money(item.amount)}</b><span className={`status-pill ${item.status}`}>{item.status.replaceAll("_", " ")}</span>{item.kind === "Purchase" && <button disabled={busy === String(item.id)} onClick={() => void payPurchase(item.id)}>Pay & send</button>}</div></div>)}{!queue.length && <div className="empty-state compact">No approved requests are waiting for Accounts.</div>}</div>
      </article>
    </div>

    <div className="finance-secondary-grid">
      <article className="card enterprise-widget"><header><div><h2>Employee Accounting Details</h2><p>Salary, tax, pension, benefits and bank information</p></div><button onClick={() => onNavigate("My Team")}>View employees</button></header>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Bank</th><th>Basic salary</th><th>PAYE</th><th>SSNIT</th><th>Benefits</th><th>Net pay</th></tr></thead><tbody>{employees.map((employee) => { const pay = payrollByEmployee.get(String(employee.id)); return <tr key={String(employee.id)}><td><strong>{nameOf(employee)}</strong><small className="table-subline">{String(employee.employee_number ?? "")}</small></td><td>{String(employee.bank_name ?? "—")}</td><td>{money(pay?.basic_salary ?? employee.monthly_salary ?? employee.basic_salary, String(pay?.currency ?? employee.salary_currency ?? "GHS"))}</td><td>{money(pay?.paye_tax ?? pay?.tax_deduction ?? 0)}</td><td>{money(pay?.employee_ssnit ?? pay?.ssnit_deduction ?? 0)}</td><td>{money(pay?.benefits_total ?? 0)}</td><td><strong>{money(pay?.net_pay ?? 0)}</strong></td></tr>; })}</tbody></table></div>
      </article>
      <article className="card enterprise-widget finance-todo"><header><div><h2>Accounts Todo</h2><p>Priority finance work</p></div></header><div className="finance-todo-list">
        <button onClick={() => onNavigate("Purchase Approvals")}><MenuIcon name="asset" /><span>Pay approved procurement requests</span><b>{accountPurchases.length}</b></button>
        <button onClick={() => onNavigate("Expense Approvals")}><MenuIcon name="expense" /><span>Process expense reimbursements</span><b>{financeExpenses.length}</b></button>
        <button onClick={() => onNavigate("Reports & Analytics")}><MenuIcon name="report" /><span>Review PAYE and SSNIT liabilities</span><b>{money(paye + ssnit)}</b></button>
        <button onClick={() => onNavigate("Reports & Analytics")}><MenuIcon name="report" /><span>Check department budgets</span><b>{budgets.length}</b></button>
        <button onClick={() => onNavigate("Reports & Analytics")}><MenuIcon name="benefit" /><span>Review active employee benefits</span><b>{benefits.filter((row) => String(row.status) === "active").length}</b></button>
      </div></article>
    </div>

    <article className="card enterprise-widget"><header><div><h2>Recent Finance Activity</h2><p>Audit trail from payroll, expenses and approvals</p></div></header><div className="activity">{(data.audit ?? []).filter((row) => /payroll|expense|purchase|accounts|finance|petty/i.test(`${row.action ?? ""} ${row.resource ?? ""}`)).slice(0, 8).map((row) => <div className="activity-row" key={String(row.id)}><div><strong>{String(row.action ?? "Finance activity").replaceAll("_", " ")}</strong><small>{String(row.resource ?? "")} · {String(row.created_at ?? "")}</small></div></div>)}{!(data.audit ?? []).length && <div className="empty-state compact">No finance activity has been recorded yet.</div>}</div></article>
  </section>;
}
