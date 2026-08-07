import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listRows, listRowsWhere } from "./lib/supabase-data";
import { realtimeClient } from "./lib/supabase-realtime";

export function ChatPopup({accessToken,profile}:{accessToken:string;profile:UserProfile}) {
  const [open,setOpen]=useState(false);
  const [channels,setChannels]=useState<DataRow[]>([]);
  const [channelId,setChannelId]=useState("");
  const [messages,setMessages]=useState<DataRow[]>([]);
  const [text,setText]=useState("");
  const [unread,setUnread]=useState(0);
  const [error,setError]=useState("");
  const openRef=useRef(open);
  const messageListRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{openRef.current=open;},[open]);

  const loadMessages=useCallback(async(id:string)=>{
    if(!id)return;
    try{
      setError("");
      const rows=await listRowsWhere(accessToken,"chat_messages_with_sender",{channel_id:id},"*",200,"created_at");
      setMessages(rows.filter(row=>!row.deleted_at).reverse());
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Messages could not be loaded.");
    }
  },[accessToken]);

  useEffect(()=>{void Promise.resolve().then(async()=>{
    try{
      const rows=await listRows(accessToken,"chat_channels","*",50);
      setChannels(rows);
      if(rows[0]){const first=String(rows[0].id);setChannelId(first);await loadMessages(first);}
    }catch(cause){setError(cause instanceof Error?cause.message:"Chat channels could not be loaded.");}
  });},[accessToken,loadMessages]);

  useEffect(()=>{
    if(!open)return;
    const frame=requestAnimationFrame(()=>{
      const list=messageListRef.current;
      if(list)list.scrollTop=list.scrollHeight;
    });
    return()=>cancelAnimationFrame(frame);
  },[messages,open,channelId]);

  useEffect(()=>{
    if(!open||!channelId)return;
    void Promise.resolve().then(()=>loadMessages(channelId));
    const timer=window.setInterval(()=>void loadMessages(channelId),10000);
    return()=>window.clearInterval(timer);
  },[open,channelId,loadMessages]);

  useEffect(()=>{
    const client=realtimeClient(accessToken);
    const subscription=client.channel(`sas-chat-${profile.organisation_id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"chat_messages",filter:`organisation_id=eq.${profile.organisation_id}`},payload=>{
        const row=(payload.new&&Object.keys(payload.new).length?payload.new:payload.old) as DataRow;
        if(String(row.channel_id)===channelId)void loadMessages(channelId);
        if(payload.eventType==="INSERT"&&String(row.sender_id)!==profile.id&&(!openRef.current||String(row.channel_id)!==channelId)){
          setUnread(value=>value+1);playNotificationTone();
        }
      }).subscribe(status=>{
        if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")setError("Live chat connection was interrupted. Messages will keep refreshing automatically.");
      });
    return()=>{void client.removeChannel(subscription);};
  },[accessToken,channelId,loadMessages,profile.id,profile.organisation_id]);

  async function send(event:FormEvent){
    event.preventDefault();if(!text.trim()||!channelId)return;
    const message=text.trim();setText("");setError("");
    try{
      await createRow(accessToken,"chat_messages",{organisation_id:profile.organisation_id,channel_id:channelId,sender_id:profile.id,message});
      await loadMessages(channelId);
    }catch(cause){setText(message);setError(cause instanceof Error?cause.message:"Message could not be sent.");}
  }

  function toggle(){setOpen(value=>{const next=!value;if(next&&channelId)void loadMessages(channelId);return next;});setUnread(0);}
  return <aside className={`chat-widget ${open?"open":""}`}>
    <button className="chat-launcher" onClick={toggle} aria-label="Open employee chat">Chat{unread>0&&<span>{unread}</span>}</button>
    {open&&<section className="chat-panel" aria-label="Employee chat">
      <header><div><strong>Employee chat</strong><small>Messages expire after 30 days</small></div><button onClick={toggle} aria-label="Close chat">×</button></header>
      <select value={channelId} onChange={e=>{setChannelId(e.target.value);void loadMessages(e.target.value);}}>{channels.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name??"Conversation")}</option>)}</select>
      {error&&<p className="form-error">{error}</p>}
      <div className="chat-messages" ref={messageListRef}>{messages.length===0?<p>No messages yet. Start the conversation.</p>:messages.map(row=>{const mine=String(row.sender_id)===profile.id;const sender=mine?"You":String(row.sender_display_name||row.sender_username||"Team member");return <article className={mine?"mine":""} key={String(row.id)}><strong>{sender}</strong>{!mine&&row.sender_username&&row.sender_display_name&&<small>@{String(row.sender_username)}</small>}<p>{String(row.message??"")}</p><time>{new Date(String(row.created_at)).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time></article>;})}</div>
      <form onSubmit={send}><input aria-label="Chat message" value={text} onChange={e=>setText(e.target.value)} placeholder="Write a message..."/><button type="submit" className="primary" disabled={!channelId||!text.trim()}>Send</button></form>
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
