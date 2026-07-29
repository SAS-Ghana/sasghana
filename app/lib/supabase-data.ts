import { clearSession, getValidAccessToken, refreshSession } from "./supabase-auth";
import { publishableKey, serviceUrl } from "./supabase-config";

export type DataRow = Record<string, string | number | boolean | null | undefined>;

function emitDataChanged(resource:string){
  window.dispatchEvent(new CustomEvent("sas-data-changed",{detail:{resource}}));
  if(resource==="notifications"||/notification/i.test(resource))window.dispatchEvent(new Event("sas-notifications-changed"));
}

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
  const response=await authorisedFetch(accessToken,`${serviceUrl}/rest/v1/${path}`,init);
  if(!response.ok){const body=await response.json().catch(()=>({})) as {message?:string;hint?:string;details?:string};throw new Error(body.message??body.hint??body.details??"The requested operation could not be completed.");}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}

function whereQuery(filters:Record<string,string>){return Object.entries(filters).map(([key,value])=>`${encodeURIComponent(key)}=eq.${encodeURIComponent(value)}`).join("&");}
function orderedSuffix(orderColumn:string|undefined,ascending:boolean,limit:number){return `${orderColumn?`&order=${encodeURIComponent(orderColumn)}.${ascending?"asc":"desc"}`:""}&limit=${limit}`;}

export async function callFunction<T>(accessToken:string,functionName:string,body:Record<string,unknown>){const response=await authorisedFetch(accessToken,`${serviceUrl}/functions/v1/${functionName}`,{method:"POST",body:JSON.stringify(body)});const result=await response.json().catch(()=>({})) as T&{error?:string;message?:string};if(!response.ok)throw new Error(result.error??result.message??`Secure operation failed (${response.status}).`);emitDataChanged(functionName);return result;}
export async function callRpc<T>(accessToken:string,functionName:string,body:Record<string,unknown>){const result=await request<T>(accessToken,`rpc/${functionName}`,{method:"POST",body:JSON.stringify(body)});emitDataChanged(functionName);return result;}
export function listRows(accessToken:string,table:string,select="*",limit=250,orderColumn="created_at",ascending=false){return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}${orderedSuffix(orderColumn,ascending,limit)}`);}
export function listRowsUnordered(accessToken:string,table:string,select="*",limit=500){return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}&limit=${limit}`);}
export function listRowsWhere(accessToken:string,table:string,filters:Record<string,string>,select="*",limit=250,orderColumn="created_at",ascending=false){return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}&${whereQuery(filters)}${orderedSuffix(orderColumn,ascending,limit)}`);}
export function listRowsWhereUnordered(accessToken:string,table:string,filters:Record<string,string>,select="*",limit=250){return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}&${whereQuery(filters)}&limit=${limit}`);}
export function listNamedRows(accessToken:string,table:string,select:string,orderColumn="name"){return request<DataRow[]>(accessToken,`${table}?select=${encodeURIComponent(select)}&order=${orderColumn}.asc&limit=500`);}
export async function createRow(accessToken:string,table:string,row:DataRow){const result=await request<DataRow[]>(accessToken,table,{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(row)});emitDataChanged(table);return result;}
export async function createRows(accessToken:string,table:string,rows:DataRow[]){const result=await request<DataRow[]>(accessToken,table,{method:"POST",headers:{Prefer:"return=representation,resolution=ignore-duplicates"},body:JSON.stringify(rows)});emitDataChanged(table);return result;}
export async function updateRow(accessToken:string,table:string,id:string,row:DataRow){const result=await request<DataRow[]>(accessToken,`${table}?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(row)});emitDataChanged(table);return result;}
export async function updateRowsWhere(accessToken:string,table:string,column:string,value:string,row:DataRow){const result=await request<DataRow[]>(accessToken,`${table}?${column}=eq.${encodeURIComponent(value)}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(row)});emitDataChanged(table);return result;}
export async function deleteRow(accessToken:string,table:string,id:string){await request<void>(accessToken,`${table}?id=eq.${id}`,{method:"DELETE"});emitDataChanged(table);}
export async function uploadStorageFile(accessToken:string,bucket:string,path:string,file:File){const response=await authorisedFetch(accessToken,`${serviceUrl}/storage/v1/object/${bucket}/${path}`,{method:"POST",headers:{"Content-Type":file.type,"x-upsert":"true"},body:file});if(!response.ok){const body=await response.json().catch(()=>({})) as {message?:string};throw new Error(body.message??"File upload failed.");}emitDataChanged(bucket);return path;}
export async function createSignedStorageUrl(accessToken:string,bucket:string,path:string,expiresIn=300){const response=await authorisedFetch(accessToken,`${serviceUrl}/storage/v1/object/sign/${bucket}/${path}`,{method:"POST",body:JSON.stringify({expiresIn})});const body=await response.json() as {signedURL?:string;message?:string};if(!response.ok||!body.signedURL)throw new Error(body.message??"Secure preview could not be created.");return `${serviceUrl}/storage/v1${body.signedURL}`;}
