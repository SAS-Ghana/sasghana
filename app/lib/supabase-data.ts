import { clearSession, getValidAccessToken, refreshSession } from "./supabase-auth";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://nbuqipukkpbcxkofnaib.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_WIuZltSLSSWN63fat12CoA_FsOuf_6G";
export type DataRow = Record<string, string | number | boolean | null | undefined>;

async function authorisedFetch(accessToken:string,url:string,init:RequestInit={},retry=true){
  const token=await getValidAccessToken(accessToken);
  const response=await fetch(url,{...init,headers:{apikey:publishableKey,Authorization:`Bearer ${token}`,"Content-Type":"application/json",...init.headers}});
  if(retry&&(response.status===401||response.status===403)){
    const body=await response.clone().json().catch(()=>({})) as {message?:string;msg?:string;code?:string};
    if(/jwt|token|expired/i.test(`${body.message??""} ${body.msg??""} ${body.code??""}`)){
      const next=await refreshSession();
      if(next)return authorisedFetch(next.access_token,url,init,false);
      clearSession();
      window.dispatchEvent(new Event("sas-session-expired"));
      throw new Error("Your session expired. Please sign in again.");
    }
  }
  return response;
}

async function request<T>(accessToken:string,path:string,init:RequestInit={}):Promise<T>{
  const response=await authorisedFetch(accessToken,`${supabaseUrl}/rest/v1/${path}`,init);
  if(!response.ok){const body=await response.json().catch(()=>({})) as {message?:string;hint?:string;details?:string};throw new Error(body.message??body.hint??body.details??"Supabase request failed.");}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}
export async function callFunction<T>(accessToken:string,functionName:string,body:Record<string,unknown>){const response=await authorisedFetch(accessToken,`${supabaseUrl}/functions/v1/${functionName}`,{method:"POST",body:JSON.stringify(body)});const result=await response.json().catch(()=>({})) as T&{error?:string;message?:string};if(!response.ok)throw new Error(result.error??result.message??`Secure operation failed (${response.status}).`);return result;}
export function callRpc<T>(accessToken:string,functionName:string,body:Record<string,unknown>){return request<T>(accessToken,`rpc/${functionName}`,{method:"POST",body:JSON.stringify(body)});}
export function listRows(accessToken:string,table:string,select="*",limit=250){return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}&order=created_at.desc&limit=${limit}`);}
export function listRowsUnordered(accessToken:string,table:string,select="*",limit=500){return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}&limit=${limit}`);}
export function listRowsWhere(accessToken:string,table:string,filters:Record<string,string>,select="*",limit=250){const filterQuery=Object.entries(filters).map(([key,value])=>`${encodeURIComponent(key)}=eq.${encodeURIComponent(value)}`).join("&");return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}&${filterQuery}&order=created_at.desc&limit=${limit}`);}
export function listNamedRows(accessToken:string,table:string,select:string,orderColumn="name"){return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}&order=${orderColumn}.asc&limit=500`);}
export function createRow(accessToken:string,table:string,row:DataRow){return request<DataRow[]>(accessToken,table,{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(row)});}
export function createRows(accessToken:string,table:string,rows:DataRow[]){return request<DataRow[]>(accessToken,table,{method:"POST",headers:{Prefer:"return=representation,resolution=ignore-duplicates"},body:JSON.stringify(rows)});}
export function updateRow(accessToken:string,table:string,id:string,row:DataRow){return request<DataRow[]>(accessToken,`${table}?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(row)});}
export function updateRowsWhere(accessToken:string,table:string,column:string,value:string,row:DataRow){return request<DataRow[]>(accessToken,`${table}?${column}=eq.${encodeURIComponent(value)}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(row)});}
export function deleteRow(accessToken:string,table:string,id:string){return request<void>(accessToken,`${table}?id=eq.${id}`,{method:"DELETE"});}
export async function uploadStorageFile(accessToken:string,bucket:string,path:string,file:File){const response=await authorisedFetch(accessToken,`${supabaseUrl}/storage/v1/object/${bucket}/${path}`,{method:"POST",headers:{"Content-Type":file.type,"x-upsert":"true"},body:file});if(!response.ok){const body=await response.json().catch(()=>({})) as {message?:string};throw new Error(body.message??"File upload failed.");}return path;}
export async function createSignedStorageUrl(accessToken:string,bucket:string,path:string,expiresIn=300){const response=await authorisedFetch(accessToken,`${supabaseUrl}/storage/v1/object/sign/${bucket}/${path}`,{method:"POST",body:JSON.stringify({expiresIn})});const body=await response.json() as {signedURL?:string;message?:string};if(!response.ok||!body.signedURL)throw new Error(body.message??"Secure preview could not be created.");return `${supabaseUrl}/storage/v1${body.signedURL}`;}