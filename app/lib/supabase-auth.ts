export type AuthSession = { access_token:string; refresh_token:string; expires_in?:number; expires_at?:number; token_type?:string; user:{id:string;email?:string} };
export type UserProfile = { id:string;organisation_id:string;username:string;email?:string;display_name:string;status:string;account_type:string;job_title?:string;employee_id?:string;avatar_path?:string|null;dashboard_access:string[];roles:string[];permissions:string[];preferred_dashboard?:string;self_service_enabled?:boolean;two_step_email_enabled?:boolean;two_step_email_verified_at?:string|null };
import { jsonHeaders, publishableKey, serviceUrl } from "./supabase-config";

const browserSessionKey="sas-people-browser-session-id";
let refreshPromise:Promise<AuthSession|null>|null=null;

function loginEmail(username:string){const clean=username.trim();return clean.includes("@")?clean.toLowerCase():`${clean.toLowerCase()}@saspeople.local`;}
export async function resolveLoginEmail(usernameOrEmail:string){const clean=usernameOrEmail.trim().toLowerCase();if(clean.includes("@"))return clean;const response=await fetch(`${serviceUrl}/rest/v1/rpc/resolve_login_email`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({login_name:clean})});if(!response.ok)return loginEmail(clean);const email=await response.json() as string|null;return email||loginEmail(clean);}
export async function signIn(username:string,password:string):Promise<{session:AuthSession;profile:UserProfile}>{const response=await fetch(`${serviceUrl}/auth/v1/token?grant_type=password`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({email:await resolveLoginEmail(username),password})});if(!response.ok){void recordLoginEvent(username,false);throw new Error("The username or password is incorrect.");}const session=normaliseSession(await response.json() as AuthSession);const profile=await fetchProfile(session.access_token,session.user.id);if(!profile||!["active","password_change_required"].includes(profile.status))throw new Error("This account is not active. Contact an administrator.");void recordLoginEvent(username,true,session.access_token);return{session,profile};}
// Best-effort approximate location for the audit trail -- resolved via the browser's own request to
// a free IP-geolocation lookup (the request naturally carries the user's real public IP), since
// Postgres has no city/country database of its own. Never blocks or fails the login flow: any error
// (offline, blocked, rate-limited) just means the audit entry has no location, not a broken sign-in.
async function resolveApproximateLocation():Promise<{ip?:string;city?:string;region?:string;country?:string}>{
  try{
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),3000);
    const response=await fetch("https://ipapi.co/json/",{signal:controller.signal});
    window.clearTimeout(timeout);
    if(!response.ok)return{};
    const data=await response.json() as {ip?:string;city?:string;region?:string;country_name?:string};
    return{ip:data.ip,city:data.city,region:data.region,country:data.country_name};
  }catch{return{};}
}
async function recordLoginEvent(login:string,success:boolean,accessToken?:string){const location=await resolveApproximateLocation();await fetch(`${serviceUrl}/rest/v1/rpc/record_login_event`,{method:"POST",headers:{...jsonHeaders,...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},body:JSON.stringify({login_name:login,was_successful:success,client_agent:navigator.userAgent,p_ip_address:location.ip??null,p_city:location.city??null,p_region:location.region??null,p_country:location.country??null})}).catch(()=>undefined);}
export async function requestPasswordReset(usernameOrEmail:string){const email=await resolveLoginEmail(usernameOrEmail);await fetch(`${serviceUrl}/rest/v1/rpc/request_password_reset_notice`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({login_name:usernameOrEmail.trim()})});const response=await fetch(`${serviceUrl}/auth/v1/recover`,{method:"POST",headers:jsonHeaders,body:JSON.stringify({email,redirect_to:`${window.location.origin}/`})});if(!response.ok)throw new Error("Password reset email could not be sent. Confirm that this account has a valid email.");return "If the account exists and has an email, a secure reset link has been sent. An administrator has also been notified.";}
const profileBaseColumns="id,organisation_id,username,email,display_name,status,account_type,job_title,employee_id,dashboard_access,preferred_dashboard,self_service_enabled,two_step_email_enabled,two_step_email_verified_at";
export async function fetchProfile(accessToken:string,userId:string){
  // avatar_path is requested optimistically -- the column only exists once the profile-avatar
  // migration has been applied. If PostgREST rejects the unknown column, retry without it so
  // login/profile loading never hard-fails on a migration the user hasn't run yet.
  let profileResponse=await fetch(`${serviceUrl}/rest/v1/profiles?select=${profileBaseColumns},avatar_path&id=eq.${userId}`,{headers:{apikey:publishableKey,Authorization:`Bearer ${accessToken}`}});
  if(!profileResponse.ok)profileResponse=await fetch(`${serviceUrl}/rest/v1/profiles?select=${profileBaseColumns}&id=eq.${userId}`,{headers:{apikey:publishableKey,Authorization:`Bearer ${accessToken}`}});
  const [permissionsResponse,rolesResponse]=await Promise.all([
    fetch(`${serviceUrl}/rest/v1/rpc/current_permissions`,{method:"POST",headers:{...jsonHeaders,Authorization:`Bearer ${accessToken}`},body:"{}"}),
    fetch(`${serviceUrl}/rest/v1/user_roles?select=roles(name)&profile_id=eq.${userId}`,{headers:{apikey:publishableKey,Authorization:`Bearer ${accessToken}`}})
  ]);if(!profileResponse.ok)return null;const profiles=await profileResponse.json() as Omit<UserProfile,"roles"|"permissions">[];if(!profiles[0])return null;const permissionRows=permissionsResponse.ok?await permissionsResponse.json() as {permission_key:string}[]:[];const roleRows=rolesResponse.ok?await rolesResponse.json() as {roles:{name:string}|null}[]:[];return{...profiles[0],dashboard_access:profiles[0].dashboard_access??[],preferred_dashboard:profiles[0].preferred_dashboard??"Dashboard",self_service_enabled:profiles[0].self_service_enabled!==false,two_step_email_enabled:profiles[0].two_step_email_enabled===true,permissions:permissionRows.map(row=>row.permission_key),roles:roleRows.flatMap(row=>row.roles?.name?[row.roles.name]:[])};}
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
