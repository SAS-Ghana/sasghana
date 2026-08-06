import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { callRpc, DataRow, deleteRow, listRows, updateRow } from "./lib/supabase-data";
import { realtimeClient } from "./lib/supabase-realtime";
import { MenuIcon } from "./menu-icon";

type Filter="all"|"unread"|"read"|"archived";
type Sort="newest"|"oldest"|"priority"|"unread";
const rank:Record<string,number>={critical:4,high:3,normal:2,low:1};

export function NotificationCenter({accessToken,profile}:{accessToken:string;profile:UserProfile}) {
  const [open,setOpen]=useState(false),[items,setItems]=useState<DataRow[]>([]),[filter,setFilter]=useState<Filter>("all"),[sort,setSort]=useState<Sort>("newest"),[query,setQuery]=useState(""),[busy,setBusy]=useState("");
  const containerRef=useRef<HTMLDivElement>(null);
  const load=useCallback(async()=>setItems(await listRows(accessToken,"notifications","*",200)),[accessToken]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  useEffect(()=>{
    const client=realtimeClient(accessToken);
    const channel=client.channel(`notifications-${profile.id}`).on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:`recipient_id=eq.${profile.id}`},()=>void load()).subscribe();
    return()=>{void client.removeChannel(channel);};
  },[accessToken,profile.id,load]);
  useEffect(()=>{function close(event:PointerEvent){if(containerRef.current&&!containerRef.current.contains(event.target as Node))setOpen(false);}document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[]);

  const unread=items.filter(item=>!item.is_read&&!item.archived_at).length;
  const visible=useMemo(()=>items.filter(item=>{
    const archived=Boolean(item.archived_at),read=Boolean(item.is_read);
    if(filter==="unread"&&(read||archived))return false;
    if(filter==="read"&&(!read||archived))return false;
    if(filter==="archived"&&!archived)return false;
    if(filter==="all"&&archived)return false;
    const text=`${item.title??""} ${item.body??""} ${item.category??""}`.toLowerCase();
    return !query||text.includes(query.toLowerCase());
  }).sort((a,b)=>{
    if(sort==="oldest")return +new Date(String(a.created_at))-+new Date(String(b.created_at));
    if(sort==="priority")return (rank[String(b.priority)]??0)-(rank[String(a.priority)]??0);
    if(sort==="unread")return Number(Boolean(a.is_read))-Number(Boolean(b.is_read))||+new Date(String(b.created_at))-+new Date(String(a.created_at));
    return +new Date(String(b.created_at))-+new Date(String(a.created_at));
  }),[items,filter,sort,query]);

  async function patch(item:DataRow,row:DataRow){setBusy(String(item.id));try{await updateRow(accessToken,"notifications",String(item.id),row);await load();}finally{setBusy("");}}
  async function markAll(){setBusy("all");try{await callRpc(accessToken,"mark_all_my_notifications_read",{});await load();}finally{setBusy("");}}
  async function remove(item:DataRow){if(!confirm("Delete this notification?"))return;setBusy(String(item.id));try{await deleteRow(accessToken,"notifications",String(item.id));await load();}finally{setBusy("");}}

  return <div className="notification-center" ref={containerRef}>
    <button className="icon-btn notification-bell" aria-label={`Notifications${unread?` (${unread} unread)`:""}`} onClick={()=>setOpen(value=>!value)}><MenuIcon name="bell"/>{unread>0&&<span className="notification-count">{unread>99?"99+":unread}</span>}</button>
    {open&&<section className="notification-popover" aria-label="Notification center">
      <header><div><strong>Notifications</strong><span>{unread} unread</span></div><button aria-label="Close notifications" onClick={()=>setOpen(false)}>×</button></header>
      <div className="notification-tools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search notifications..."/><select value={filter} onChange={e=>setFilter(e.target.value as Filter)}><option value="all">All active</option><option value="unread">Unread</option><option value="read">Read</option><option value="archived">Archived</option></select><select value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="priority">Priority</option><option value="unread">Unread first</option></select></div>
      <div className="notification-bulk"><button disabled={!unread||busy==="all"} onClick={()=>void markAll()}>Mark all read</button><button onClick={()=>setFilter("archived")}>View archive</button></div>
      <div className="notification-list">{visible.length===0?<p>No matching notifications.</p>:visible.map(item=><article className={`${item.is_read?"":"unread"} ${item.pinned?"pinned":""}`} key={String(item.id)}><button className="notification-main" onClick={()=>!item.is_read&&void patch(item,{is_read:true,read_at:new Date().toISOString()})}><span className={`notification-type priority-${String(item.priority??"normal")}`}>{String(item.category??"general").slice(0,1).toUpperCase()}</span><span><strong>{String(item.title)}</strong><small>{String(item.body)}</small><time>{new Date(String(item.created_at)).toLocaleString()}</time></span></button><div className="notification-actions"><button disabled={busy===String(item.id)} onClick={()=>void patch(item,{is_read:!item.is_read,read_at:item.is_read?null:new Date().toISOString()})}>{item.is_read?"Unread":"Read"}</button><button disabled={busy===String(item.id)} onClick={()=>void patch(item,{pinned:!item.pinned})}>{item.pinned?"Unpin":"Pin"}</button><button disabled={busy===String(item.id)} onClick={()=>void patch(item,{archived_at:item.archived_at?null:new Date().toISOString()})}>{item.archived_at?"Restore":"Archive"}</button><button className="danger" disabled={busy===String(item.id)} onClick={()=>void remove(item)}>Delete</button></div></article>)}</div>
    </section>}
  </div>;
}
