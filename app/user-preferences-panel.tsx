import { FormEvent, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { createRow, DataRow, listRowsWhere, updateRowsWhere } from "./lib/supabase-data";

type Preferences={language:string;theme:"system"|"light"|"dark";accessibility:"standard"|"large-text"|"high-contrast"|"reduced-motion";profile_visibility:"private"|"team"|"organisation";show_email:boolean;show_phone:boolean;show_birthday:boolean;show_last_active:boolean;allow_location_for_attendance:boolean;allow_ai_personalisation:boolean};
const defaults:Preferences={language:"English",theme:"system",accessibility:"standard",profile_visibility:"team",show_email:true,show_phone:false,show_birthday:false,show_last_active:true,allow_location_for_attendance:true,allow_ai_personalisation:true};
const translations:Record<string,Record<string,string>>={
 French:{Settings:"Paramètres",Preferences:"Préférences",Language:"Langue",Theme:"Thème",Accessibility:"Accessibilité","Save preferences":"Enregistrer les préférences","Notification preferences":"Préférences de notification","Privacy settings":"Paramètres de confidentialité","Connected devices":"Appareils connectés","Change password":"Changer le mot de passe","Sign out":"Se déconnecter",Dashboard:"Tableau de bord",Attendance:"Présence",Leave:"Congé",Payroll:"Paie",Documents:"Documents",Performance:"Performance",Benefits:"Avantages"},
 Twi:{Settings:"Nhyehyɛe",Preferences:"Apɛdeɛ",Language:"Kasa",Theme:"Ahwɛbea",Accessibility:"Mmoa a ɛma ɛyɛ mmerɛ","Save preferences":"Kora apɛdeɛ",Dashboard:"Adwumayɛ pon",Attendance:"Baabi a wo wɔ",Leave:"Ahomegye",Payroll:"Akatua",Documents:"Nkrataa"},
 Ga:{Settings:"Nɔŋtsɔɔmɔi",Preferences:"Bɔɔmɔi",Language:"Gbe",Theme:"Nifeemɔ",Accessibility:"Mliwalɔɔmɔ","Save preferences":"Kpɔ bɔɔmɔi",Dashboard:"Nifeemɔ pon",Attendance:"Baamɔ",Leave:"Hɔlide",Payroll:"Haa shika",Documents:"Nkrataa"},
 Ewe:{Settings:"Ɖoɖowɔwɔwo",Preferences:"Tiatiawo",Language:"Gbegbɔgblɔ",Theme:"Nɔnɔme",Accessibility:"Mɔɖeɖe","Save preferences":"Dzra tiatiawo ɖo",Dashboard:"Dɔwɔƒe kplɔ̃",Attendance:"Va dɔme",Leave:"Mɔɖeɖe",Payroll:"Fexexe",Documents:"Agbalẽwo"}
};

export function applyPreferences(p:Preferences){
 localStorage.setItem("sas-user-preferences",JSON.stringify(p));
 document.documentElement.dataset.theme=p.theme;
 document.documentElement.dataset.accessibility=p.accessibility;
 document.documentElement.lang=({English:"en",French:"fr",Twi:"tw",Ga:"gaa",Ewe:"ee"} as Record<string,string>)[p.language]||"en";
 const root=document.documentElement;
 root.classList.toggle("large-text",p.accessibility==="large-text");
 root.classList.toggle("high-contrast",p.accessibility==="high-contrast");
 root.classList.toggle("reduced-motion",p.accessibility==="reduced-motion");
 translateVisibleText(p.language);
 window.dispatchEvent(new CustomEvent("sas-preferences-changed",{detail:p}));
}

function translateVisibleText(language:string){
 const map=translations[language];if(!map)return;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node:Node|null;
 while((node=walker.nextNode())){const parent=node.parentElement;if(!parent||["SCRIPT","STYLE","TEXTAREA","OPTION"].includes(parent.tagName))continue;const text=node.textContent?.trim();if(text&&map[text])node.textContent=node.textContent!.replace(text,map[text]);}
}

export function UserPreferencesPanel({accessToken,profile,onPassword,onNotifications,onLogout}:{accessToken:string;profile:UserProfile;onPassword?:()=>void;onNotifications?:()=>void;onLogout?:()=>void}){
 const [values,setValues]=useState<Preferences>(defaults),[exists,setExists]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[privacyOpen,setPrivacyOpen]=useState(false);
 useEffect(()=>{void (async()=>{try{const rows=await listRowsWhere(accessToken,"user_preferences",{profile_id:profile.id},"*",1);if(rows[0]){const next={...defaults,...rows[0]} as Preferences;setValues(next);setExists(true);applyPreferences(next);}else{const local=localStorage.getItem("sas-user-preferences");if(local){const next={...defaults,...JSON.parse(local)};setValues(next);applyPreferences(next);}}}catch(cause){setError(cause instanceof Error?cause.message:"Preferences could not be loaded.");}})();},[accessToken,profile.id]);
 async function save(event:FormEvent){event.preventDefault();setBusy(true);setError("");setNotice("");try{const payload:DataRow={...values,profile_id:profile.id,organisation_id:profile.organisation_id,updated_at:new Date().toISOString()};if(exists)await updateRowsWhere(accessToken,"user_preferences","profile_id",profile.id,payload);else{await createRow(accessToken,"user_preferences",payload);setExists(true);}applyPreferences(values);setNotice("Preferences saved and applied across your dashboards.");}catch(cause){setError(cause instanceof Error?cause.message:"Preferences could not be saved.");}finally{setBusy(false);}}
 const device=useMemo(()=>({browser:navigator.userAgent.includes("Chrome")?"Chrome":navigator.userAgent.includes("Firefox")?"Firefox":navigator.userAgent.includes("Safari")?"Safari":"Browser",platform:navigator.platform||"Current device",language:navigator.language,lastActive:new Date().toLocaleString("en-US")}),[]);
 return <div className="settings-grid user-settings-live">
  <article className="card data-panel"><h2>Account security</h2><p>{profile.email||profile.username}</p><button className="secondary" onClick={onPassword}>Change password</button><button className="secondary" onClick={onNotifications}>Email two step verification</button></article>
  <article className="card data-panel"><h2>Preferences</h2><form onSubmit={save}><label>Language<select value={values.language} onChange={e=>setValues({...values,language:e.target.value})}>{["English","French","Twi","Ga","Ewe"].map(x=><option key={x}>{x}</option>)}</select></label><label>Theme<select value={values.theme} onChange={e=>setValues({...values,theme:e.target.value as Preferences["theme"]})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Accessibility<select value={values.accessibility} onChange={e=>setValues({...values,accessibility:e.target.value as Preferences["accessibility"]})}><option value="standard">Standard</option><option value="large-text">Large text</option><option value="high-contrast">High contrast</option><option value="reduced-motion">Reduced motion</option></select></label>{error&&<p className="form-error">{error}</p>}{notice&&<p className="form-message">{notice}</p>}<button className="primary" disabled={busy}>{busy?"Saving…":"Save preferences"}</button></form></article>
  <article className="card data-panel"><h2>Notifications and privacy</h2><button className="secondary" onClick={onNotifications}>Notification preferences</button><button className="secondary" onClick={()=>setPrivacyOpen(v=>!v)}>Privacy settings</button>{privacyOpen&&<form onSubmit={save} className="privacy-form"><label>Profile visibility<select value={values.profile_visibility} onChange={e=>setValues({...values,profile_visibility:e.target.value as Preferences["profile_visibility"]})}><option value="private">Private</option><option value="team">My team</option><option value="organisation">Organisation</option></select></label>{[["show_email","Show email"],["show_phone","Show phone"],["show_birthday","Show birthday"],["show_last_active","Show last active"],["allow_location_for_attendance","Allow attendance location"],["allow_ai_personalisation","Allow AI personalisation"]] .map(([key,label])=><label className="check" key={key}><input type="checkbox" checked={Boolean(values[key as keyof Preferences])} onChange={e=>setValues({...values,[key]:e.target.checked})}/>{label}</label>)}<button className="primary" disabled={busy}>Save privacy</button></form>}</article>
  <article className="card data-panel"><h2>Connected device</h2><div className="master-list"><div><strong>Browser</strong><span>{device.browser}</span></div><div><strong>Device</strong><span>{device.platform}</span></div><div><strong>Language</strong><span>{device.language}</span></div><div><strong>Last active</strong><span>{device.lastActive}</span></div></div><button className="danger" onClick={onLogout}>Sign out this device</button></article>
 </div>;
}
