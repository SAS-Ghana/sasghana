import { useEffect } from "react";

const vendorPattern=/^(powered by|made with|built with)\s+(supabase|vite)$/i;

export function DashboardPolishEnhancer(){
 useEffect(()=>{
  let queued=0;
  const run=()=>{
   queued=0;
   document.querySelectorAll<HTMLElement>("body *").forEach(element=>{
    if(element.children.length>2)return;
    const text=(element.textContent??"").trim().replace(/\s+/g," ");
    if(text.length<80&&vendorPattern.test(text)){element.hidden=true;element.setAttribute("aria-hidden","true");}
   });
   const cards=document.querySelector<HTMLElement>(".employee-portal-v2 .employee-quick-cards");
   if(cards&&!document.querySelector(".employee-portal-v2 .employee-home-summary")){
    const values=Array.from(cards.querySelectorAll<HTMLElement>(":scope > article")).slice(0,6).map(card=>({label:(card.querySelector("span")?.textContent??"Metric").trim(),raw:(card.querySelector("strong")?.textContent??"0").trim()}));
    const numeric=values.map(item=>Number(item.raw.replace(/[^0-9.-]/g,""))||0),max=Math.max(1,...numeric);
    const panel=document.createElement("article");panel.className="card dashboard-insights employee-home-summary";
    panel.innerHTML=`<div class="panel-head"><div><h2>My quick summary</h2><p class="muted">Live indicators from your employee workspace</p></div></div><div class="insight-bars">${values.map((item,index)=>`<div class="insight-row"><div class="insight-label"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.raw)}</strong></div><div class="insight-track"><span style="width:${Math.min(100,numeric[index]/max*100)}%"></span></div></div>`).join("")}</div>`;
    cards.insertAdjacentElement("afterend",panel);
   }
  };
  const schedule=()=>{if(!queued)queued=window.requestAnimationFrame(run);};
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});run();
  return()=>{observer.disconnect();if(queued)cancelAnimationFrame(queued);};
 },[]);
 return null;
}
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]??char));}
