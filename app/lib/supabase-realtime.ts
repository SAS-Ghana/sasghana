import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url=import.meta.env.VITE_SUPABASE_URL??"https://nbuqipukkpbcxkofnaib.supabase.co";
const key=import.meta.env.VITE_SUPABASE_ANON_KEY??"sb_publishable_WIuZltSLSSWN63fat12CoA_FsOuf_6G";
const clients=new Map<string,SupabaseClient>();

export function realtimeClient(accessToken:string){
  const existing=clients.get(accessToken);
  if(existing)return existing;
  const client=createClient(url,key,{
    global:{headers:{Authorization:`Bearer ${accessToken}`}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  void client.realtime.setAuth(accessToken);
  clients.set(accessToken,client);
  return client;
}
