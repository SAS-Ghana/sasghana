import { useEffect } from "react";

const vendorPattern=/^(powered by|made with|built with)\s+(supabase|vite)$/i;

// The "My quick summary" insight-bars panel used to be spliced into the live DOM here via
// MutationObserver + insertAdjacentElement, outside React's control. Because it wasn't part of
// React's render tree, switching tabs could leave it stuck in place instead of unmounting with the
// Home tab -- it's now rendered properly inside DashboardOverview (employee-home.tsx).
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
  };
  const schedule=()=>{if(!queued)queued=window.requestAnimationFrame(run);};
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});run();
  return()=>{observer.disconnect();if(queued)cancelAnimationFrame(queued);};
 },[]);
 return null;
}
