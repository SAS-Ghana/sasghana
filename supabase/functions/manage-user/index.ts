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

    if (body.action === "create") {
      if (!username) return json({ error: "Username is required." }, 400);
      if (body.send_invite && !body.email) return json({ error: "An email address is required when sending an invitation." }, 400);
      if (!body.send_invite && String(body.password ?? "").length < 10) return json({ error: "Temporary passwords must contain at least 10 characters." }, 400);
      const { data: organisation } = await admin.from("profiles").select("organisation_id").eq("id", (await caller.auth.getUser()).data.user!.id).single();
      const authResult = body.send_invite
        ? await admin.auth.admin.inviteUserByEmail(email, { data: { username, display_name: body.display_name, organisation_id: organisation!.organisation_id } })
        : await admin.auth.admin.createUser({
            email, password: body.password, email_confirm: true,
            user_metadata: { username, display_name: body.display_name, organisation_id: organisation!.organisation_id },
          });
      if (authResult.error) throw authResult.error;
      const userId = authResult.data.user.id;
      const { error: profileError } = await admin.from("profiles").insert({
        id: userId, organisation_id: organisation!.organisation_id, username, email,
        display_name: body.display_name, status: body.send_invite ? "invited" : "password_change_required",
        account_type: body.account_type, employee_id: body.employee_id || null,
        job_title: body.job_title || null, force_password_change: !body.send_invite,
        invitation_status: body.send_invite ? "sent" : "accepted",
        dashboard_access: body.dashboard_access ?? [],
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(userId);
        throw profileError;
      }
      if (body.role_ids?.length) await admin.from("user_roles").insert(body.role_ids.map((role_id: string) => ({ profile_id: userId, role_id })));
      if (body.permission_ids?.length) await admin.from("user_permission_overrides").insert(body.permission_ids.map((permission_id: string) => ({ profile_id: userId, permission_id, granted: true })));
      await admin.from("audit_logs").insert({ organisation_id: organisation!.organisation_id, actor_id: (await caller.auth.getUser()).data.user!.id, action: "user.created", resource: "profiles", resource_id: userId, outcome: "success", metadata: { username, account_type: body.account_type } });
      return json({ id: userId, username, email }, 201);
    }

    if (body.action === "update") {
      if (!body.user_id || !body.username || !body.email) return json({ error: "User, username and email are required." }, 400);
      const authChanges: Record<string, unknown> = {
        email: String(body.email).trim().toLowerCase(),
        email_confirm: true,
        user_metadata: { username: String(body.username).trim().toLowerCase(), display_name: body.display_name },
      };
      if (body.password) {
        if (String(body.password).length < 10) return json({ error: "Temporary passwords must contain at least 10 characters." }, 400);
        authChanges.password = body.password;
      }
      const { error: authError } = await admin.auth.admin.updateUserById(body.user_id, authChanges);
      if (authError) throw authError;
      const profileChanges = {
        username: String(body.username).trim().toLowerCase(), email: String(body.email).trim().toLowerCase(),
        display_name: body.display_name, job_title: body.job_title || null,
        account_type: body.account_type, status: body.password ? "password_change_required" : body.status,
        force_password_change: Boolean(body.password),
      };
      const { error: updateError } = await admin.from("profiles").update(profileChanges).eq("id", body.user_id);
      if (updateError) throw updateError;
      return json({ ok: true });
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
    if (body.action === "delete") {
      if (body.user_id === (await caller.auth.getUser()).data.user!.id) return json({ error: "You cannot delete the account currently in use." }, 400);
      await admin.from("employees").update({profile_id:null}).eq("profile_id",body.user_id);
      await admin.from("user_permission_overrides").delete().eq("profile_id",body.user_id);
      await admin.from("user_roles").delete().eq("profile_id",body.user_id);
      const { error: profileDeleteError }=await admin.from("profiles").delete().eq("id",body.user_id);
      if(profileDeleteError)throw profileDeleteError;
      const { error: authDeleteError }=await admin.auth.admin.deleteUser(body.user_id);
      if(authDeleteError)throw authDeleteError;
      return json({ok:true});
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
