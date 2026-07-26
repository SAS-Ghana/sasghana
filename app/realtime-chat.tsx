import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listRows } from "./lib/supabase-data";

const url=import.meta.env.VITE_SUPABASE_URL??"https://nbuqipukkpbcxkofnaib.supabase.co";
const key=import.meta.env.VITE_SUPABASE_ANON_KEY??"sb_publishable_WIuZltSLSSWN63fat12CoA_FsOuf_6G";

export function ChatPopup({accessToken,profile}:{accessToken:string;profile:UserProfile}) {
  const [open,setOpen]=useState(false);
  const [channels,setChannels]=useState<DataRow[]>([]);
  const [channelId,setChannelId]=useState("");
  const [messages,setMessages]=useState<DataRow[]>([]);
  const [text,setText]=useState("");
  const [unread,setUnread]=useState(0);
  const openRef=useRef(open);
  useEffect(()=>{openRef.current=open;},[open]);

  const loadMessages=useCallback(async(id:string)=>{
    const rows=await listRows(accessToken,"chat_messages","*",100);
    setMessages(rows.filter(row=>row.channel_id===id&& !row.deleted_at).reverse());
  },[accessToken]);

  useEffect(()=>{void Promise.resolve().then(async()=>{
    const rows=await listRows(accessToken,"chat_channels","*",50);
    setChannels(rows); if(rows[0]){setChannelId(String(rows[0].id));await loadMessages(String(rows[0].id));}
  });},[accessToken,loadMessages]);

  useEffect(()=>{
    const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${accessToken}`}}});
    void client.realtime.setAuth(accessToken);
    const subscription=client.channel(`sas-chat-${profile.organisation_id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_messages",filter:`organisation_id=eq.${profile.organisation_id}`},payload=>{
        const row=payload.new as DataRow;
        if(String(row.channel_id)===channelId)setMessages(current=>[...current,row]);
        if(!openRef.current){setUnread(value=>value+1);playNotificationTone();}
      }).subscribe();
    return()=>{void client.removeChannel(subscription);};
  },[accessToken,channelId,profile.organisation_id]);

  async function send(event:FormEvent){
    event.preventDefault(); if(!text.trim()||!channelId)return;
    const message=text.trim();setText("");
    await createRow(accessToken,"chat_messages",{organisation_id:profile.organisation_id,channel_id:channelId,sender_id:profile.id,message});
  }

  function toggle(){setOpen(value=>!value);setUnread(0);}
  return <aside className={`chat-widget ${open?"open":""}`}>
    <button className="chat-launcher" onClick={toggle} aria-label="Open employee chat">Chat{unread>0&&<span>{unread}</span>}</button>
    {open&&<section className="chat-panel" aria-label="Employee chat">
      <header><div><strong>Employee chat</strong><small>Messages expire after 30 days</small></div><button onClick={toggle} aria-label="Close chat">×</button></header>
      <select value={channelId} onChange={e=>{setChannelId(e.target.value);void loadMessages(e.target.value);}}>{channels.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name??"Conversation")}</option>)}</select>
      <div className="chat-messages">{messages.length===0?<p>No messages yet. Start the conversation.</p>:messages.map(row=><article className={row.sender_id===profile.id?"mine":""} key={String(row.id)}><strong>{row.sender_id===profile.id?"You":"Team member"}</strong><p>{String(row.message??"")}</p><time>{new Date(String(row.created_at)).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time></article>)}</div>
      <form onSubmit={send}><input aria-label="Chat message" value={text} onChange={e=>setText(e.target.value)} placeholder="Write a message..."/><button className="primary">Send</button></form>
    </section>}
  </aside>;
}

function playNotificationTone(){
  try{
    const AudioContextClass=window.AudioContext;
    const context=new AudioContextClass();const oscillator=context.createOscillator();const gain=context.createGain();
    oscillator.frequency.value=720;gain.gain.value=.04;oscillator.connect(gain);gain.connect(context.destination);
    oscillator.start();oscillator.stop(context.currentTime+.12);
  }catch{/* Device sound is optional and may require prior interaction. */}
}
