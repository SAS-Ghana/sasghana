import { useCallback, useEffect, useRef, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows, updateRow } from "./lib/supabase-data";
import { realtimeClient } from "./lib/supabase-realtime";

export function NotificationCenter({accessToken,profile}:{accessToken:string;profile:UserProfile}) {
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<DataRow[]>([]);
  const containerRef=useRef<HTMLDivElement>(null);
  const load=useCallback(async()=>setItems(await listRows(accessToken,"notifications","*",50)),[accessToken]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  useEffect(()=>{
    const client=realtimeClient(accessToken);
    const channel=client.channel(`notifications-${profile.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`recipient_id=eq.${profile.id}`},payload=>{
      const item=payload.new as DataRow;setItems(current=>[item,...current]);
      if("Notification" in window&&Notification.permission==="granted")new Notification(String(item.title),{body:String(item.body)});
    }).subscribe();
    return()=>{void client.removeChannel(channel);};
  },[accessToken,profile.id]);
  useEffect(()=>{function close(event:PointerEvent){if(containerRef.current&&!containerRef.current.contains(event.target as Node))setOpen(false);}document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[]);
  async function read(item:DataRow){if(!item.is_read){await updateRow(accessToken,"notifications",String(item.id),{is_read:true});await load();}}
  const unread=items.filter(item=>!item.is_read).length;
  return <div className="notification-center" ref={containerRef}><button className="icon-btn" aria-label="Notifications" onClick={()=>setOpen(value=>!value)}>N{unread>0&&<span className="notification-count">{unread}</span>}</button>{open&&<section className="notification-popover"><header><strong>Notifications</strong><button onClick={()=>setOpen(false)}>×</button></header>{items.length===0?<p>No notifications yet.</p>:items.map(item=><button className={item.is_read?"":"unread"} key={String(item.id)} onClick={()=>void read(item)}><strong>{String(item.title)}</strong><span>{String(item.body)}</span><time>{new Date(String(item.created_at)).toLocaleString()}</time></button>)}</section>}</div>;
}
