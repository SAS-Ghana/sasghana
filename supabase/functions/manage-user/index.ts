import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: allowed } = await caller.rpc("has_permission", { required_permission: "users.manage" });
    if (!allowed) return json({ error: "You do not have permission to manage accounts." }, 403);

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await request.json();
    const username = String(body.username ?? "").trim().toLowerCase();
    const email = String(body.email || `${username}@saspeople.local`).trim().toLowerCase();
    if (!username) return json({ error: "Username is required." }, 400);

    if (body.action === "create") {
      const authResult = body.send_invite
        ? await admin.auth.admin.inviteUserByEmail(email, { data: { username, display_name: body.display_name } })
        : await admin.auth.admin.createUser({
            email, password: body.password, email_confirm: true,
            user_metadata: { username, display_name: body.display_name },
          });
      if (authResult.error) throw authResult.error;
      const userId = authResult.data.user.id;
      const { data: organisation } = await admin.from("profiles").select("organisation_id").eq("id", (await caller.auth.getUser()).data.user!.id).single();
      const { error: profileError } = await admin.from("profiles").insert({
        id: userId, organisation_id: organisation!.organisation_id, username,
        display_name: body.display_name, status: body.send_invite ? "invited" : "password_change_required",
        account_type: body.account_type, employee_id: body.employee_id || null,
        job_title: body.job_title || null, force_password_change: !body.send_invite,
        invitation_status: body.send_invite ? "sent" : "accepted",
        dashboard_access: body.dashboard_access ?? [],
      });
      if (profileError) throw profileError;
      if (body.role_ids?.length) await admin.from("user_roles").insert(body.role_ids.map((role_id: string) => ({ profile_id: userId, role_id })));
      if (body.permission_ids?.length) await admin.from("user_permission_overrides").insert(body.permission_ids.map((permission_id: string) => ({ profile_id: userId, permission_id, granted: true })));
      await admin.from("audit_logs").insert({ organisation_id: organisation!.organisation_id, actor_id: (await caller.auth.getUser()).data.user!.id, action: "user.created", resource: "profiles", resource_id: userId, outcome: "success", metadata: { username, account_type: body.account_type } });
      return json({ id: userId, username, email }, 201);
    }

    if (body.action === "status") {
      const { error } = await admin.from("profiles").update({ status: body.status }).eq("id", body.user_id);
      if (error) throw error;
      if (["disabled","suspended","locked"].includes(body.status)) await admin.auth.admin.signOut(body.user_id, "global");
      return json({ ok: true });
    }

    if (body.action === "reset_password") {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) throw error;
      await admin.from("profiles").update({ status: "password_change_required", force_password_change: true }).eq("id", body.user_id);
      return json({ ok: true });
    }
    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Account operation failed." }, 400);
  }
}

export default { fetch: handleRequest };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
