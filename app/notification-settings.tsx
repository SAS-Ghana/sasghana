import { FormEvent, useEffect, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listNamedRows, updateRowsWhere } from "./lib/supabase-data";

const options=[
  ["in_app","In-app notifications"],["email","Email notifications"],["sound","Play notification sound"],
  ["desktop","Desktop notifications"],["leave_updates","Leave updates"],["payroll_updates","Payroll updates"],
  ["task_updates","Task assignments"],["chat_updates","Chat messages"],["meeting_updates","Meeting responses"],
] as const;

export function NotificationSettings({accessToken,profile,onClose}:{accessToken:string;profile:UserProfile;onClose:()=>void}) {
  const [row,setRow]=useState<DataRow|null>(null);
  const [values,setValues]=useState<Record<string,boolean>>(Object.fromEntries(options.map(([key])=>[key,true])));
  const [message,setMessage]=useState("");
  useEffect(()=>{void Promise.resolve().then(async()=>{
    const rows=await listNamedRows(accessToken,"notification_preferences","*","profile_id");
    const current=rows.find(item=>item.profile_id===profile.id)??null;setRow(current);
    if(current)setValues(Object.fromEntries(options.map(([key])=>[key,current[key]!==false])));
  });},[accessToken,profile.id]);
  async function save(event:FormEvent){event.preventDefault();setMessage("");
    if(values.desktop&&"Notification" in window&&Notification.permission==="default")await Notification.requestPermission();
    const payload={...values,profile_id:profile.id,organisation_id:profile.organisation_id};
    if(row)await updateRowsWhere(accessToken,"notification_preferences","profile_id",profile.id,payload);
    else await createRow(accessToken,"notification_preferences",payload);
    setMessage("Notification preferences saved.");
  }
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="notifications-title"><button className="modal-close" onClick={onClose} aria-label="Close">x</button><span className="eyebrow">Device and email</span><h2 id="notifications-title">Notification settings</h2><p className="muted">Choose what reaches this account and whether the device should play a sound.</p><form onSubmit={save}>{options.map(([key,label])=><label className="check preference-check" key={key}><input type="checkbox" checked={values[key]} onChange={e=>setValues({...values,[key]:e.target.checked})}/>{label}</label>)}{message&&<p className="form-message">{message}</p>}<button className="primary">Save preferences</button></form></section></div>;
}
