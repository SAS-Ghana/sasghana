type Props={label:string;value:string;options:string[];required?:boolean;onChange:(value:string)=>void};
export function CustomOptionSelect({label,value,options,required,onChange}:Props){
 const custom=Boolean(value)&&!options.includes(value);
 const selected=custom?"__custom__":value;
 return <span className="other-select-wrap"><select aria-label={label} required={required} value={selected} onChange={event=>onChange(event.target.value==="__custom__"?"":event.target.value)}><option value="">Select {label.toLowerCase()}</option>{options.filter(option=>option.toLowerCase()!=="other").map(option=><option key={option} value={option}>{option.replaceAll("_"," ")}</option>)}<option value="__custom__">Other</option></select>{(selected==="__custom__"||custom)&&<span className="other-field"><input autoFocus required={required} value={custom?value:""} onChange={event=>onChange(event.target.value)} placeholder={`Enter other ${label.toLowerCase()}`}/><small>Enter the exact value that should be saved.</small></span>}</span>;
}
