import { readSession } from "./lib/supabase-auth";

type JsonRecord = Record<string, unknown>;
let installed = false;

function preferencesRpcBody(body: JsonRecord) {
  return {
    p_language: String(body.language ?? "English"),
    p_theme: String(body.theme ?? "system"),
    p_accessibility: String(body.accessibility ?? "standard"),
    p_text_size: String(body.text_size ?? "medium"),
    p_ui_density: String(body.ui_density ?? "comfortable"),
    p_profile_visibility: String(body.profile_visibility ?? "team"),
    p_show_email: body.show_email !== false,
    p_show_phone: body.show_phone === true,
    p_show_birthday: body.show_birthday === true,
    p_show_last_active: body.show_last_active !== false,
    p_allow_location_for_attendance: body.allow_location_for_attendance !== false,
    p_allow_ai_personalisation: body.allow_ai_personalisation !== false,
  };
}

function requestBody(init?: RequestInit) {
  if (typeof init?.body !== "string") return null;
  try { return JSON.parse(init.body) as JsonRecord; }
  catch { return null; }
}

function inclusiveDays(start: unknown, end: unknown) {
  const from = new Date(String(start ?? ""));
  const to = new Date(String(end ?? ""));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return 1;
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86400000) + 1);
}

export function installRuntimeDataFixes() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let nextInit = init;

    try {
      const parsed = new URL(url, window.location.origin);
      const session = readSession();
      const method = (init?.method || "GET").toUpperCase();

      // Compatibility for older preference components. New employee settings call the RPC directly.
      if (parsed.pathname.endsWith("/rest/v1/user_preferences")) {
        if (parsed.searchParams.get("order")?.startsWith("created_at")) parsed.searchParams.delete("order");
        const profileFilter = parsed.searchParams.get("profile_id");
        if ((!profileFilter || profileFilter === "eq.") && session?.user.id && method === "GET") parsed.searchParams.set("profile_id", `eq.${session.user.id}`);
        if ((method === "POST" || method === "PATCH") && typeof init?.body === "string") {
          const body = JSON.parse(init.body) as JsonRecord;
          parsed.pathname = parsed.pathname.replace(/\/user_preferences$/, "/rpc/upsert_my_user_preferences");
          parsed.search = "";
          nextInit = { ...init, method: "POST", body: JSON.stringify(preferencesRpcBody(body)) };
        }
      }

      // Compatibility for older notification components that used the employee id instead of profile id.
      if (parsed.pathname.endsWith("/rest/v1/notifications") && parsed.searchParams.has("recipient_employee_id")) {
        parsed.searchParams.delete("recipient_employee_id");
        if (session?.user.id) parsed.searchParams.set("recipient_id", `eq.${session.user.id}`);
      }

      // Normalise legacy self-service payloads. Current employee forms already send these fields.
      const body = requestBody(nextInit);
      if (method === "POST" && body) {
        if (parsed.pathname.endsWith("/rest/v1/leave_requests")) {
          body.days = body.days ?? inclusiveDays(body.start_date, body.end_date);
          body.status = body.status ?? "pending";
          body.workflow_stage = body.workflow_stage ?? "manager_review";
          nextInit = { ...nextInit, body: JSON.stringify(body) };
        }
        if (parsed.pathname.endsWith("/rest/v1/expense_claims")) {
          body.category = body.category ?? body.expense_type ?? "Other";
          body.expense_type = body.expense_type ?? body.category;
          body.status = body.status === "pending" ? "submitted" : body.status ?? "submitted";
          body.submitted_at = body.submitted_at ?? new Date().toISOString();
          body.currency = body.currency ?? "GHS";
          nextInit = { ...nextInit, body: JSON.stringify(body) };
        }
        if (parsed.pathname.endsWith("/rest/v1/asset_requests")) {
          body.category = body.category ?? body.asset_type ?? "Other";
          body.asset_type = body.asset_type ?? body.category;
          body.priority = body.priority ?? "normal";
          body.status = body.status ?? "pending";
          nextInit = { ...nextInit, body: JSON.stringify(body) };
        }
      }

      if (parsed.pathname.endsWith("/rest/v1/employee_change_requests") && method === "POST" && session?.user.id && typeof nextInit?.body === "string") {
        const changeBody = JSON.parse(nextInit.body) as JsonRecord;
        changeBody.requested_by = session.user.id;
        nextInit = { ...nextInit, body: JSON.stringify(changeBody) };
      }

      url = parsed.toString();
    } catch {
      // Unrelated requests continue unchanged.
    }

    return original(url, nextInit);
  };
}

installRuntimeDataFixes();
