type Insight={label:string;value:number;max?:number;detail?:string};

export function DashboardInsights({title="Quick summary",subtitle="Live operational indicators",items}:{title?:string;subtitle?:string;items:Insight[]}){
 const peak=Math.max(1,...items.map(item=>item.max??item.value));
 return <article className="card dashboard-insights"><div className="panel-head"><div><h2>{title}</h2><p className="muted">{subtitle}</p></div></div><div className="insight-bars">{items.map(item=>{const ceiling=Math.max(item.max??peak,1);const pct=Math.min(100,Math.max(0,item.value/ceiling*100));return <div className="insight-row" key={item.label}><div className="insight-label"><span>{item.label}</span><strong>{item.value}</strong></div><div className="insight-track" role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={ceiling} aria-valuenow={item.value}><span style={{width:`${pct}%`}}/></div>{item.detail&&<small>{item.detail}</small>}</div>})}</div></article>;
}

export function MiniTrend({title,values}:{title:string;values:number[]}){
 const max=Math.max(1,...values);return <article className="card mini-trend"><div className="panel-head"><div><h2>{title}</h2><p className="muted">Recent six period trend</p></div></div><div className="trend-columns" aria-label={title}>{values.map((value,index)=><div key={index}><span style={{height:`${Math.max(8,value/max*100)}%`}}/><small>{value}</small></div>)}</div></article>;
}
