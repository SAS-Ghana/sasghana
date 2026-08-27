import { useEffect } from "react";
import { observeBody } from "./lib/dom-enhancer";

const vendorPattern=/^(powered by|made with|built with)\s+(supabase|vite)$/i;

// The "My quick summary" insight-bars panel used to be spliced into the live DOM here via
// MutationObserver + insertAdjacentElement, outside React's control. Because it wasn't part of
// React's render tree, switching tabs could leave it stuck in place instead of unmounting with the
// Home tab -- it's now rendered properly inside DashboardOverview (employee-home.tsx).
export function DashboardPolishEnhancer(){
 useEffect(()=>{
  const run=()=>{
   // Only leaf-ish nodes can be a vendor badge, and `[hidden]` ones are already dealt with --
   // skipping them keeps this off the critical path and stops it rewriting the same nodes.
   document.querySelectorAll<HTMLElement>("body *:not([hidden])").forEach(element=>{
    if(element.children.length>2)return;
    const text=(element.textContent??"").trim().replace(/\s+/g," ");
    if(text.length<80&&vendorPattern.test(text)){element.hidden=true;element.setAttribute("aria-hidden","true");}
   });
  };
  // run() sets `hidden` on the nodes it finds, which the old observer then received back as a fresh
  // mutation and rescheduled on the next frame, forever. observeBody() detaches for the pass.
  return observeBody(run,{label:"DashboardPolishEnhancer"});
 },[]);
 return null;
}
