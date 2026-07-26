import { FormEvent, useCallback, useEffect, useState } from "react";
import { createRow, createSignedStorageUrl, DataRow, listRows, updateRow, uploadStorageFile } from "./lib/supabase-data";

const mergeFields=[
  "{{today}}","{{employee.full_name}}","{{employee.employee_number}}","{{employee.position_title}}",
  "{{employee.department}}","{{employee.start_date}}","{{employee.work_email}}",
  "{{payroll.pay_period}}","{{payroll.basic_salary}}","{{payroll.allowances}}","{{payroll.paye_tax}}",
  "{{payroll.employee_ssnit}}","{{payroll.tier_one}}","{{payroll.tier_two}}","{{payroll.tier_three}}","{{payroll.net_pay}}",
];

export function DocumentStudio({accessToken,organisationId}:{accessToken:string;organisationId:string}) {
  const [templates,setTemplates]=useState<DataRow[]>([]);
  const [selected,setSelected]=useState<DataRow|null>(null);
  const [editing,setEditing]=useState(false);
  const [values,setValues]=useState({name:"",template_type:"appointment_letter",subject:"",content:"",status:"active"});
  const [signature,setSignature]=useState<File|null>(null);
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>setTemplates(await listRows(accessToken,"document_templates","*",100)),[accessToken]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  function edit(template:DataRow){setSelected(template);setValues({name:String(template.name),template_type:String(template.template_type),subject:String(template.subject??""),content:String(template.content??""),status:String(template.status??"active")});setEditing(true);}
  function create(){setSelected(null);setValues({name:"",template_type:"appointment_letter",subject:"",content:"",status:"active"});setEditing(true);}
  async function save(event:FormEvent){event.preventDefault();setMessage("");let signaturePath=String(selected?.signature_path??"");
    if(signature){signaturePath=`${organisationId}/signatures/${Date.now()}-${signature.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;await uploadStorageFile(accessToken,"hr-media",signaturePath,signature);}
    const payload={...values,organisation_id:organisationId,signature_path:signaturePath||null};
    if(selected?.id)await updateRow(accessToken,"document_templates",String(selected.id),payload);else await createRow(accessToken,"document_templates",payload);
    setEditing(false);setSignature(null);setMessage("Template saved to Supabase.");await load();
  }
  async function preview(template:DataRow){
    let signatureUrl="";if(template.signature_path)try{signatureUrl=await createSignedStorageUrl(accessToken,"hr-media",String(template.signature_path));}catch{/* optional */}
    const content=String(template.content).replaceAll("{{today}}",new Date().toLocaleDateString("en-GB"));
    const popup=window.open("","_blank","width=900,height=900");popup?.document.write(`<!doctype html><html><head><title>${escapeHtml(String(template.name))}</title><style>body{font:15px Arial;color:#0b1426;padding:48px;line-height:1.65}header{border-bottom:3px solid #00afe3;padding-bottom:18px;margin-bottom:36px}header img{width:220px}main{white-space:pre-wrap}.signature{width:180px;max-height:90px;object-fit:contain;margin-top:36px}button{margin-top:30px;padding:10px 14px}@media print{button{display:none}}</style></head><body><header><img src="/logo.png"/></header><main>${escapeHtml(content)}</main>${signatureUrl?`<img class="signature" src="${signatureUrl}"/>`:""}<button onclick="window.print()">Print / Save PDF</button></body></html>`);popup?.document.close();
  }
  return <section><header className="page-header"><div><span className="eyebrow">Documents</span><h1>Document Studio</h1><p className="muted">Design reusable appointment letters, payslips, contracts, forms, and signature-ready employee documents.</p></div><button className="primary" onClick={create}>Create template</button></header>
    {message&&<p className="form-message">{message}</p>}
    <article className="card data-panel"><div className="panel-head"><div><h2>Saved templates</h2><p className="muted">Merge fields fill employee and payroll data automatically</p></div></div><div className="template-grid">{templates.map(template=><article key={String(template.id)}><span>{String(template.template_type).replaceAll("_"," ")}</span><h3>{String(template.name)}</h3><p>{String(template.subject??"No subject")}</p><div className="row-actions"><button onClick={()=>void preview(template)}>Preview</button><button onClick={()=>edit(template)}>Design</button></div></article>)}</div></article>
    {editing&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setEditing(false);}}><section className="modal document-designer" role="dialog" aria-modal="true" aria-labelledby="designer-title"><button className="modal-close" onClick={()=>setEditing(false)} aria-label="Close">x</button><span className="eyebrow">Template designer</span><h2 id="designer-title">{selected?"Edit template":"Create template"}</h2><form onSubmit={save} className="record-form"><label>Template name *<input required value={values.name} onChange={e=>setValues({...values,name:e.target.value})}/></label><label>Document type *<select value={values.template_type} onChange={e=>setValues({...values,template_type:e.target.value})}><option value="appointment_letter">Appointment letter</option><option value="payslip">Payslip</option><option value="employment_contract">Employment contract</option><option value="confirmation_letter">Confirmation letter</option><option value="probation_review">Probation review</option><option value="custom">Custom document</option></select></label><label className="wide">Subject / heading<input value={values.subject} onChange={e=>setValues({...values,subject:e.target.value})}/></label><label className="wide">Document text *<textarea className="template-editor" required value={values.content} onChange={e=>setValues({...values,content:e.target.value})}/></label><div className="wide merge-fields"><strong>Insertable merge fields</strong><div>{mergeFields.map(field=><button type="button" key={field} onClick={()=>setValues({...values,content:`${values.content}${values.content?" ":""}${field}`})}>{field}</button>)}</div></div><label>Upload e-signature<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setSignature(e.target.files?.[0]??null)}/></label><label>Status<select value={values.status} onChange={e=>setValues({...values,status:e.target.value})}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label><div className="form-actions wide"><button type="button" onClick={()=>setEditing(false)}>Cancel</button><button className="primary">Save template</button></div></form></section></div>}
  </section>;
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]??char));}
