export type AuthSession = {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string };
};

export type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  status: string;
};

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://nbuqipukkpbcxkofnaib.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "sb_publishable_WIuZltSLSSWN63fat12CoA_FsOuf_6G";

const jsonHeaders = {
  apikey: publishableKey,
  "Content-Type": "application/json",
};

function loginEmail(username: string) {
  const clean = username.trim();
  return clean.includes("@")
    ? clean.toLowerCase()
    : `${clean.toLowerCase()}@saspeople.local`;
}

export async function signIn(
  username: string,
  password: string,
): Promise<{ session: AuthSession; profile: UserProfile }> {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email: loginEmail(username), password }),
    },
  );
  if (!response.ok) throw new Error("The username or password is incorrect.");
  const session = (await response.json()) as AuthSession;
  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,username,display_name,status&id=eq.${session.user.id}`,
    {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );
  const profiles = (await profileResponse.json()) as UserProfile[];
  const profile = profiles[0];
  if (!profile || !["active", "password_change_required"].includes(profile.status)) {
    throw new Error("This account is not active. Contact an administrator.");
  }
  return { session, profile };
}

export async function changePassword(
  accessToken: string,
  newPassword: string,
) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      ...jsonHeaders,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!response.ok) {
    const body = (await response.json()) as { msg?: string; message?: string };
    throw new Error(body.msg ?? body.message ?? "Password could not be changed.");
  }
}

export async function signOut(accessToken: string) {
  await fetch(`${supabaseUrl}/auth/v1/logout`, {
    method: "POST",
    headers: { ...jsonHeaders, Authorization: `Bearer ${accessToken}` },
  });
}

export function saveSession(session: AuthSession, remember: boolean) {
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem("sas-people-session", JSON.stringify(session));
}

export function readSession(): AuthSession | null {
  const raw =
    sessionStorage.getItem("sas-people-session") ??
    localStorage.getItem("sas-people-session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem("sas-people-session");
  localStorage.removeItem("sas-people-session");
}
