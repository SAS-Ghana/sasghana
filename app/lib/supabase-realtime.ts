import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (() => {
  const v = import.meta.env.VITE_SUPABASE_URL;
  if (!v) throw new Error("VITE_SUPABASE_URL is not set. Set VITE_SUPABASE_URL in your environment (see README.md)");
  return v;
})();

const key = (() => {
  const k = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!k) throw new Error("VITE_SUPABASE_ANON_KEY is not set. Set VITE_SUPABASE_ANON_KEY in your environment (see README.md)");
  return k;
})();
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
