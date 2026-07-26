"use client";
import { useState } from "react";
import Image from "next/image";
import type { UserProfile } from "./lib/supabase-auth";

const nav = ["Dashboard","Employees","Onboarding","Documents","Attendance","Leave","Performance","Assets","HR Requests","Announcements","Reports"];
const metrics = [["Total employees","248","+12 this quarter"],["Active onboarding","18","6 due this week"],["On leave today","7","2 returning tomorrow"],["Document compliance","92%","+4.2% this month"]];
const departments: [string, number][] = [["Investments",82],["Operations",68],["Finance",51],["Technology",73],["People",44],["Risk",57]];

export function PeopleDashboard({profile,onLogout,onChangePassword}:{profile:UserProfile;onLogout:()=>void;onChangePassword:()=>void}) {
  const [drawer,setDrawer]=useState(false);
  const [active,setActive]=useState("Dashboard");
  const [accountOpen,setAccountOpen]=useState(false);
  return <div className="app">
    <div className={`drawer-backdrop ${drawer?"open":""}`} onClick={()=>setDrawer(false)}/>
    <aside className={`sidebar ${drawer?"open":""}`} aria-label="Primary navigation">
      <div className="brand"><Image src="/logo.png" width={56} height={40} alt="SAS Finance Group"/><div><strong>SAS People</strong><small>People operations</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav">{nav.map((label)=><button key={label} className={active===label?"active":""} onClick={()=>{setActive(label);setDrawer(false)}}><span className="nav-icon">{label.slice(0,1)}</span>{label}</button>)}</nav>
      <div className="nav-label">ADMINISTRATION</div><nav className="nav"><button onClick={onChangePassword}><span className="nav-icon">S</span>Settings</button><button><span className="nav-icon">A</span>Security & audit</button></nav>
      <div className="sidebar-footer">SAS Finance Group Ghana<br/>Private & confidential</div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="mobile-menu" aria-label="Open menu" onClick={()=>setDrawer(true)}>Menu</button>
        <input className="search" aria-label="Search" placeholder="Search employees, documents, requests..."/>
        <div className="profile">
          <button className="icon-btn" aria-label="Notifications">N<span className="dot"/></button>
          <button className="account-button" onClick={()=>setAccountOpen(value=>!value)} aria-expanded={accountOpen}><div className="avatar">AD</div><div className="profile-copy"><strong>{profile.display_name}</strong><small className="muted">System Administrator</small></div></button>
          {accountOpen&&<div className="account-menu"><button onClick={onChangePassword}>Change password</button><button onClick={onLogout}>Sign out</button></div>}
        </div>
      </header>
      <div className="content">
        <section className="hero"><div><div className="eyebrow">SAS Finance Group Ghana</div><h1>Good afternoon, {profile.display_name}.</h1><p className="muted">Here is what needs your attention across SAS People today.</p></div><button className="primary">Invite employee</button></section>
        <section className="metrics" aria-label="Organisation summary">{metrics.map(([label,value,trend])=><article className="card metric" key={label}><div className="metric-top"><span>{label}</span><b>{label.slice(0,1)}</b></div><div className="metric-value">{value}</div><div className="trend">{trend}</div></article>)}</section>
        <section className="quick" aria-label="Quick actions"><button><span>+</span>Add employee</button><button><span>UP</span>Import records</button><button><span>DOC</span>Generate document</button><button><span>OK</span>Review onboarding</button></section>
        <section className="grid">
          <article className="card panel"><div className="panel-head"><div><h2>Workforce by department</h2><p className="muted">Active employees across the organisation</p></div><button className="text-btn">View report</button></div><div className="bars">{departments.map(([name,height])=><div className="bar-wrap" key={name}><div className="bar" style={{height:`${height}%`}}/><span>{name}</span></div>)}</div></article>
          <article className="card panel"><div className="panel-head"><div><h2>Onboarding health</h2><p className="muted">18 active journeys</p></div><button className="text-btn">Details</button></div><div className="donut-row"><div className="donut" aria-label="78 percent on track"/><div className="legend"><span><i style={{background:"#00afe3"}}/>14 on track</span><span><i style={{background:"#f59e0b"}}/>3 need attention</span><span><i style={{background:"var(--line)"}}/>1 overdue</span></div></div></article>
          <article className="card panel"><div className="panel-head"><div><h2>Priority tasks</h2><p className="muted">Items requiring HR action</p></div><button className="text-btn">View all</button></div><div className="tasks">{[["Verify employee documents","Kwame Mensah - 4 documents","Today"],["Review onboarding submission","Nana Yeboah - Finance","Today"],["Probation review due","Afia Owusu - 90-day review","2 days"],["Leave request pending","Kofi Boateng - Annual leave","3 days"]].map(([title,meta,due])=><div className="task" key={title}><div className="task-icon">{title.slice(0,1)}</div><div><strong>{title}</strong><small>{meta}</small></div><span className="badge">{due}</span></div>)}</div></article>
          <article className="card panel"><div className="panel-head"><div><h2>Recent activity</h2><p className="muted">Live organisation updates</p></div></div><div className="activity">{[["KM","Kwame completed personal details","8 min"],["EY","Esi approved a leave request","24 min"],["AO","Administrator generated an appointment letter","1 hr"],["KS","Kofi acknowledged the privacy policy","2 hrs"]].map(([initials,text,time])=><div className="activity-row" key={text}><div className="avatar">{initials}</div><p>{text}</p><time>{time}</time></div>)}</div></article>
        </section>
      </div>
    </main>
  </div>;
}
