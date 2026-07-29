import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publishableKey, serviceUrl } from "./supabase-config";

const clients=new Map<string,SupabaseClient>();

export function realtimeClient(accessToken:string){
  const existing=clients.get(accessToken);
  if(existing)return existing;
  const client=createClient(serviceUrl,publishableKey,{
    global:{headers:{Authorization:`Bearer ${accessToken}`}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  void client.realtime.setAuth(accessToken);
  clients.set(accessToken,client);
  return client;
}
