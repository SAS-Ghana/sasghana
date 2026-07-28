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

      if (parsed.pathname.endsWith("/rest/v1/user_preferences")) {
        if (parsed.searchParams.get("order")?.startsWith("created_at")) parsed.searchParams.delete("order");

        const profileFilter = parsed.searchParams.get("profile_id");
        if ((!profileFilter || profileFilter === "eq.") && session?.user.id && method === "GET") {
          parsed.searchParams.set("profile_id", `eq.${session.user.id}`);
        }

        if ((method === "POST" || method === "PATCH") && typeof init?.body === "string") {
          const body = JSON.parse(init.body) as JsonRecord;
          parsed.pathname = parsed.pathname.replace(/\/user_preferences$/, "/rpc/upsert_my_user_preferences");
          parsed.search = "";
          nextInit = {
            ...init,
            method: "POST",
            body: JSON.stringify(preferencesRpcBody(body)),
          };
        }
      }

      if (parsed.pathname.endsWith("/rest/v1/notifications") && parsed.searchParams.has("recipient_employee_id")) {
        parsed.searchParams.delete("recipient_employee_id");
        if (session?.user.id) parsed.searchParams.set("recipient_id", `eq.${session.user.id}`);
      }

      if (
        parsed.pathname.endsWith("/rest/v1/employee_change_requests") &&
        method === "POST" &&
        session?.user.id &&
        typeof init?.body === "string"
      ) {
        const body = JSON.parse(init.body) as JsonRecord;
        body.requested_by = session.user.id;
        nextInit = { ...init, body: JSON.stringify(body) };
      }

      url = parsed.toString();
    } catch {
      // Leave unrelated requests untouched.
    }

    return original(url, nextInit);
  };
}

installRuntimeDataFixes();
