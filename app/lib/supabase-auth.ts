export type AuthSession = { access_token:string; refresh_token:string; expires_in?:number; expires_at?:number; token_type?:string; user:{id:string;email?:string} };
export type UserProfile = { id:string;organisation_id:string;username:string;email?:string;display_name:string;status:string;account_type:string;job_title?:string;employee_id?:string;avatar_path?:string|null;dashboard_access:string[];roles:string[];permissions:string[];preferred_dashboard?:string;self_service_enabled?:boolean;two_step_email_enabled?:boolean;two_step_email_verified_at?:string|null };
import { jsonHeaders, publishableKey, serviceUrl } from "./supabase-config";

const browserSessionKey="sas-people-browser-session-id";
let refreshPromise:Promise<AuthSession|null>|null=null;

// Sign-in requests used to run on a bare fetch(), which has no timeout at all. On connections that
// intermittently fail to reach the Supabase host -- measured at roughly one attempt in five from the
// Accra office, each stalling ~21s before the OS gives up -- the promise simply never settled, so the
// button sat on "Signing in..." indefinitely with no error and no way to recover but a page reload.
// Auth itself was healthy throughout; the request never arrived.
const authRequestTimeoutMs=12000;

/** Raised when the Supabase host could not be reached, as opposed to rejecting the credentials. */
export class NetworkUnavailableError extends Error{
  constructor(message="Could not reach the sign-in service. Check your internet connection and try again."){
    super(message);
    this.name="NetworkUnavailableError";
  }
}

async function fetchWithTimeout(input:string,init:RequestInit={},timeoutMs=authRequestTimeoutMs){
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(input,{...init,signal:controller.signal});}
  finally{window.clearTimeout(timer);}
}

/**
 * fetch() that gives up quickly and retries once, then reports a connection failure distinctly.
 *
 * Only the connection is retried: a response of any status (including 400/401) is returned as-is, so
 * a wrong password still fails immediately rather than being retried.
 */
export async function fetchResilient(input:string,init:RequestInit={},retries=1,timeoutMs=authRequestTimeoutMs){
  for(let attempt=0;attempt<=retries;attempt++){
    try{return await fetchWithTimeout(input,init,timeoutMs);}
    catch{/* aborted or the connection never opened -- fall through and retry once */}
  }
  throw new NetworkUnavailableError();
}

function loginEmail(username:string){const clean=username.trim();return clean.includes("@")?clean.toLowerCase():`${clean.toLowerCase()}@saspeople.local`;}
export async function resolveLoginEmail(usernameOrEmail:string){const clean=usernameOrEmail.trim().toLowerCase();if(clean.includes("@"))return clean;const response=await fetchResilient(`${serviceUrl}/rest/v1/rpc/resolve_login_email`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({login_name:clean})});if(!response.ok)return loginEmail(clean);const email=await response.json() as string|null;return email||loginEmail(clean);}
export async function signIn(username:string,password:string):Promise<{session:AuthSession;profile:UserProfile}>{const response=await fetchResilient(`${serviceUrl}/auth/v1/token?grant_type=password`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({email:await resolveLoginEmail(username),password})});if(!response.ok){void recordLoginEvent(username,false);throw new Error("The username or password is incorrect.");}const session=normaliseSession(await response.json() as AuthSession);const profile=await fetchProfile(session.access_token,session.user.id);if(!profile||!["active","password_change_required"].includes(profile.status))throw new Error("This account is not active. Contact an administrator.");void recordLoginEvent(username,true,session.access_token);return{session,profile};}
// The audit trail's IP address is read server-side by record_login_event, from the request headers
// the platform already sets. It used to be resolved in the browser through a third-party lookup
// (ipapi.co), which sent every employee's real IP to an outside service on every sign-in attempt --
// successful or failed -- and let the caller name its own address and location in the audit log.
async function recordLoginEvent(login:string,success:boolean,accessToken?:string){await fetch(`${serviceUrl}/rest/v1/rpc/record_login_event`,{method:"POST",headers:{...jsonHeaders,...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},body:JSON.stringify({login_name:login,was_successful:success,client_agent:navigator.userAgent})}).catch(()=>undefined);}
export async function requestPasswordReset(usernameOrEmail:string){const email=await resolveLoginEmail(usernameOrEmail);await fetch(`${serviceUrl}/rest/v1/rpc/request_password_reset_notice`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({login_name:usernameOrEmail.trim()})});const response=await fetch(`${serviceUrl}/auth/v1/recover`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({email,redirect_to:`${window.location.origin}/`})});if(!response.ok)throw new Error("Password reset email could not be sent. Confirm that this account has a valid email.");return "If the account exists and has an email, a secure reset link has been sent. An administrator has also been notified.";}
const profileBaseColumns="id,organisation_id,username,email,display_name,status,account_type,job_title,employee_id,dashboard_access,preferred_dashboard,self_service_enabled,two_step_email_enabled,two_step_email_verified_at";
export async function fetchProfile(accessToken:string,userId:string){
  const authHeaders={apikey:publishableKey,Authorization:`Bearer ${accessToken}`};
  // All three lookups are issued in a single wave. The profile row used to be awaited before the
  // permission/role requests were even started, which cost a full extra round trip on every sign-in
  // and every session restore.
  //
  // avatar_path is requested optimistically -- the column only exists once the profile-avatar
  // migration has been applied. If PostgREST rejects the unknown column, retry without it so
  // login/profile loading never hard-fails on a migration the user hasn't run yet.
  const [profileResponse,permissionsResponse,rolesResponse]=await Promise.all([
    fetchResilient(`${serviceUrl}/rest/v1/profiles?select=${profileBaseColumns},avatar_path&id=eq.${userId}`,{headers:authHeaders})
      .then(response=>response.ok?response:fetchResilient(`${serviceUrl}/rest/v1/profiles?select=${profileBaseColumns}&id=eq.${userId}`,{headers:authHeaders})),
    fetchResilient(`${serviceUrl}/rest/v1/rpc/current_permissions`,{method:"POST",headers:{...jsonHeaders,Authorization:`Bearer ${accessToken}`},body:"{}"}),
    fetchResilient(`${serviceUrl}/rest/v1/user_roles?select=roles(name)&profile_id=eq.${userId}`,{headers:authHeaders})
  ]);
  if(!profileResponse.ok)return null;
  const profiles=await profileResponse.json() as Omit<UserProfile,"roles"|"permissions">[];
  if(!profiles[0])return null;
  const permissionRows=permissionsResponse.ok?await permissionsResponse.json() as {permission_key:string}[]:[];
  const roleRows=rolesResponse.ok?await rolesResponse.json() as {roles:{name:string}|null}[]:[];
  // preferred_dashboard is deliberately NOT defaulted to "Dashboard" here. No role's sidebar defines
  // a page by that name, so the old default sent every user without an explicit preference to a page
  // that could not render. Leaving it unset lets resolveLandingPage() pick the role's real home.
  return{...profiles[0],dashboard_access:profiles[0].dashboard_access??[],self_service_enabled:profiles[0].self_service_enabled!==false,two_step_email_enabled:profiles[0].two_step_email_enabled===true,permissions:permissionRows.map(row=>row.permission_key),roles:roleRows.flatMap(row=>row.roles?.name?[row.roles.name]:[])};
}
async function recordVerificationEvent(accessToken:string,eventType:"verified"|"failed"){await fetch(`${serviceUrl}/rest/v1/rpc/record_login_verification_event`,{method:"POST",headers:{...jsonHeaders,Authorization:`Bearer ${accessToken}`},body:JSON.stringify({p_event_type:eventType,p_user_agent:navigator.userAgent})}).catch(()=>undefined);}
export async function sendEmailLoginCode(session:AuthSession,email:string){if(!email||email.endsWith("@saspeople.local"))throw new Error("A valid work email is required for two-step verification.");const response=await fetch(`${serviceUrl}/auth/v1/otp`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({email,create_user:false,should_create_user:false,data:{purpose:"login_verification"}})});if(!response.ok){const body=await response.json().catch(()=>({})) as {msg?:string;message?:string};throw new Error(body.msg??body.message??"The verification code could not be sent.");}await fetch(`${serviceUrl}/rest/v1/rpc/record_login_verification_event`,{method:"POST",headers:{...jsonHeaders,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({p_event_type:"code_requested",p_user_agent:navigator.userAgent})}).catch(()=>undefined);}
export async function verifyEmailLoginCode(email:string,token:string){const response=await fetch(`${serviceUrl}/auth/v1/verify`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({email,token:token.trim(),type:"email"})});if(!response.ok){const current=readSession();if(current)await recordVerificationEvent(current.access_token,"failed");const body=await response.json().catch(()=>({})) as {msg?:string;message?:string};throw new Error(body.msg??body.message??"The verification code is incorrect or expired.");}const session=normaliseSession(await response.json() as AuthSession);await recordVerificationEvent(session.access_token,"verified");return session;}
export async function setEmailTwoStep(accessToken:string,enabled:boolean){const token=await getValidAccessToken(accessToken);const response=await fetch(`${serviceUrl}/rest/v1/rpc/set_email_two_step_enabled`,{method:"POST",headers:{...jsonHeaders,Authorization:`Bearer ${token}`},body:JSON.stringify({p_enabled:enabled})});if(!response.ok){const body=await response.json().catch(()=>({})) as {message?:string;hint?:string};throw new Error(body.message??body.hint??"Security preference could not be updated.");}return (await response.json()) as {two_step_email_enabled:boolean;two_step_email_verified_at:string|null;email:string}[];}
export async function changePassword(accessToken:string,newPassword:string){const token=await getValidAccessToken(accessToken);const response=await fetch(`${serviceUrl}/auth/v1/user`,{method:"PUT",headers:{...jsonHeaders,Authorization:`Bearer ${token}`},body:JSON.stringify({password:newPassword})});if(!response.ok){const body=await response.json() as {msg?:string;message?:string};throw new Error(body.msg??body.message??"Password could not be changed.");}const user=await response.json();const profileResponse=await fetch(`${serviceUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,{method:"PATCH",headers:{...jsonHeaders,Authorization:`Bearer ${token}`,Prefer:"return=minimal"},body:JSON.stringify({status:"active",force_password_change:false})});if(!profileResponse.ok)throw new Error("Password changed, but the account status could not be updated. Contact your administrator.");}

export function getBrowserSessionIdentifier(){
  const storage=localStorage;
  const existing=storage.getItem(browserSessionKey);
  if(existing)return existing;
  const next=crypto.randomUUID();
  storage.setItem(browserSessionKey,next);
  return next;
}

function currentDeviceName(){
  const platform=navigator.platform||"Browser device";
  const mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return `${mobile?"Mobile":"Desktop"} · ${platform}`.slice(0,200);
}

export async function registerCurrentSession(accessToken:string){
  const token=await getValidAccessToken(accessToken);
  const response=await fetch(`${serviceUrl}/rest/v1/rpc/register_current_session`,{
    method:"POST",
    headers:{...jsonHeaders,Authorization:`Bearer ${token}`},
    body:JSON.stringify({p_session_identifier:getBrowserSessionIdentifier(),p_device_name:currentDeviceName(),p_user_agent:navigator.userAgent}),
  });
  if(!response.ok){const body=await response.json().catch(()=>({})) as {message?:string};throw new Error(body.message??"The active session could not be recorded.");}
  return response.json() as Promise<string>;
}

export async function revokeCurrentSession(accessToken:string){
  const token=await getValidAccessToken(accessToken).catch(()=>accessToken);
  const identifier=localStorage.getItem(browserSessionKey);
  if(!identifier)return false;
  const response=await fetch(`${serviceUrl}/rest/v1/rpc/revoke_current_session`,{
    method:"POST",
    headers:{...jsonHeaders,Authorization:`Bearer ${token}`},
    body:JSON.stringify({p_session_identifier:identifier}),
  });
  return response.ok;
}

export async function signOut(accessToken:string){try{const token=await getValidAccessToken(accessToken).catch(()=>accessToken);if(readSession()&&token)await fetch(`${serviceUrl}/auth/v1/logout`,{method:"POST",headers:{...jsonHeaders,Authorization:`Bearer ${token}`}});}finally{clearSession();}}
function normaliseSession(session:AuthSession):AuthSession{return {...session,expires_at:session.expires_at??(session.expires_in?Math.floor(Date.now()/1000)+session.expires_in:undefined)};}
function sessionStorageTarget(){return sessionStorage.getItem("sas-people-session")?sessionStorage:localStorage;}
export function saveSession(session:AuthSession,remember:boolean){const next=normaliseSession(session);(remember?localStorage:sessionStorage).setItem("sas-people-session",JSON.stringify(next));window.dispatchEvent(new CustomEvent("sas-session-changed",{detail:next}));}
export function readSession():AuthSession|null{const raw=sessionStorage.getItem("sas-people-session")??localStorage.getItem("sas-people-session");if(!raw)return null;try{return JSON.parse(raw) as AuthSession;}catch{return null;}}
export async function refreshSession():Promise<AuthSession|null>{if(refreshPromise)return refreshPromise;refreshPromise=(async()=>{const current=readSession();if(!current?.refresh_token)return null;const response=await fetch(`${serviceUrl}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({refresh_token:current.refresh_token})});if(!response.ok){clearSession();return null;}const next=normaliseSession(await response.json() as AuthSession);sessionStorageTarget().setItem("sas-people-session",JSON.stringify(next));window.dispatchEvent(new CustomEvent("sas-session-refreshed",{detail:next}));return next;})().finally(()=>{refreshPromise=null;});return refreshPromise;}
export async function getValidAccessToken(fallback?:string){const current=readSession();if(!current)return fallback??"";const expiresAt=current.expires_at??0;if(expiresAt&&expiresAt-Math.floor(Date.now()/1000)>60)return current.access_token;const refreshed=await refreshSession();if(refreshed)return refreshed.access_token;return fallback??current.access_token;}
export function clearSession(){sessionStorage.removeItem("sas-people-session");localStorage.removeItem("sas-people-session");window.dispatchEvent(new CustomEvent("sas-session-changed",{detail:null}));}
