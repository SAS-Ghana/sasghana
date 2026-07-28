import { readSession } from "./lib/supabase-auth";

let installed=false;
export function installRuntimeDataFixes(){
 if(installed||typeof window==="undefined")return;installed=true;
 const original=window.fetch.bind(window);
 window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  let url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
  let nextInit=init;
  try{
   const parsed=new URL(url,window.location.origin);
   const session=readSession();
   if(parsed.pathname.endsWith("/rest/v1/user_preferences")&&parsed.searchParams.get("order")?.startsWith("created_at"))parsed.searchParams.delete("order");
   if(parsed.pathname.endsWith("/rest/v1/notifications")&&parsed.searchParams.has("recipient_employee_id")){
    parsed.searchParams.delete("recipient_employee_id");
    if(session?.user.id)parsed.searchParams.set("recipient_id",`eq.${session.user.id}`);
   }
   if(parsed.pathname.endsWith("/rest/v1/employee_change_requests")&&(init?.method||"GET").toUpperCase()==="POST"&&session?.user.id&&typeof init?.body==="string"){
    const body=JSON.parse(init.body) as Record<string,unknown>;
    body.requested_by=session.user.id;
    nextInit={...init,body:JSON.stringify(body)};
   }
   url=parsed.toString();
  }catch{/* Leave unrelated fetches untouched. */}
  return original(url,nextInit);
 };
}

installRuntimeDataFixes();