import { useEffect } from "react";

export function FormOtherEnhancer(){
 useEffect(()=>{
  const handler=(event:Event)=>{
   const select=event.target instanceof HTMLSelectElement?event.target:null;
   if(!select)return;
   const chosen=select.options[select.selectedIndex];
   const isOther=/^other$/i.test(String(chosen?.textContent??"").trim())||/^(other|__custom__|__other__)$/i.test(select.value);
   const existing=select.parentElement?.querySelector<HTMLInputElement>(":scope > .dynamic-other-input");
   if(!isOther){if(existing&&!select.dataset.customOther)existing.remove();return;}
   if(existing){existing.focus();return;}
   const input=document.createElement("input");
   input.type="text";input.required=select.required;input.className="dynamic-other-input";input.placeholder=`Enter other ${select.getAttribute("aria-label")||select.closest("label")?.childNodes[0]?.textContent?.trim()||"details"}`;
   input.addEventListener("blur",()=>{const value=input.value.trim();if(!value)return;let option=Array.from(select.options).find(item=>item.value===value);if(!option){option=document.createElement("option");option.value=value;option.textContent=value;select.appendChild(option);}select.dataset.customOther="true";select.value=value;select.dispatchEvent(new Event("change",{bubbles:true}));});
   select.insertAdjacentElement("afterend",input);input.focus();
  };
  document.addEventListener("change",handler,true);
  return()=>document.removeEventListener("change",handler,true);
 },[]);
 return null;
}
