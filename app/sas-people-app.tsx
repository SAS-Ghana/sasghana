"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AuthSession,
  changePassword,
  clearSession,
  fetchProfile,
  readSession,
  saveSession,
  signIn,
  signOut,
  requestPasswordReset,
  UserProfile,
} from "./lib/supabase-auth";
import { PeopleDashboard } from "./people-dashboard";

export function SasPeopleApp() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [resetOpen,setResetOpen]=useState(false);
  const [notice,setNotice]=useState("");

  useEffect(() => {
    void Promise.resolve().then(() => {
      const hash=new URLSearchParams(window.location.hash.replace(/^#/,""));
      const recoveryToken=hash.get("access_token");
      const recoveryRefresh=hash.get("refresh_token");
      if(hash.get("type")==="recovery"&&recoveryToken&&recoveryRefresh){
        const recovered:AuthSession={access_token:recoveryToken,refresh_token:recoveryRefresh,user:{id:hash.get("user_id")??""}};
        const authUrl=import.meta.env.VITE_SUPABASE_URL??"https://nbuqipukkpbcxkofnaib.supabase.co";
        const authKey=import.meta.env.VITE_SUPABASE_ANON_KEY??"sb_publishable_WIuZltSLSSWN63fat12CoA_FsOuf_6G";
        fetch(`${authUrl}/auth/v1/user`,{headers:{apikey:authKey,Authorization:`Bearer ${recoveryToken}`}})
          .then(response=>response.json()).then(async user=>{
            recovered.user={id:user.id,email:user.email};
            const recoveredProfile=await fetchProfile(recoveryToken,user.id);
            if(recoveredProfile){setSession(recovered);setProfile(recoveredProfile);setPasswordOpen(true);window.history.replaceState(null,"",window.location.pathname);}
            setReady(true);
          }).catch(()=>setReady(true));
        return;
      }
      const stored = readSession();
      if (stored) {
        void fetchProfile(stored.access_token, stored.user.id).then((storedProfile) => {
          if (storedProfile && ["active", "password_change_required"].includes(storedProfile.status)) {
            setSession(stored);
            setProfile(storedProfile);
          } else {
            clearSession();
          }
          setReady(true);
        });
        return;
      }
      setReady(true);
    });
  }, []);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signIn(username, password);
      saveSession(result.session, remember);
      setSession(result.session);
      setProfile(result.profile);
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (session) await signOut(session.access_token);
    clearSession();
    setSession(null);
    setProfile(null);
  }

  if (!ready) return <div className="app-loading">Loading SAS People...</div>;

  if (!session || !profile) {
    return (
      <main className="login-shell">
        <section className="login-brand">
          <img src="/logo.png" alt="SAS Finance Group" width="330" height="92" />
          <div>
            <span className="eyebrow">Private employee portal</span>
            <h1>People operations,<br />made effortless.</h1>
            <p>Secure employee management and onboarding for SAS Finance Group Ghana.</p>
          </div>
          <small>Authorised SAS personnel only</small>
        </section>
        <section className="login-panel">
          <form className="login-card" onSubmit={handleLogin}>
            <div className="login-mark">SAS</div>
            <h2>Welcome to SAS People</h2>
            <p className="muted">Sign in with the account issued by your administrator.</p>
            <label>Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </label>
            <label>Password
              <span className="password-field">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
              </span>
            </label>
            <div className="login-options">
              <label className="check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember me</label>
              <button type="button" className="link-button" onClick={()=>setResetOpen(true)}>Forgot password?</button>
            </div>
            {notice&&<p className="form-message" role="status">{notice}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary login-submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
            <p className="login-help">Need help? Contact your SAS system administrator.</p>
          </form>
          {resetOpen&&<ResetDialog initialLogin={username} onClose={()=>setResetOpen(false)} onSent={message=>{setResetOpen(false);setNotice(message);}}/>}
        </section>
      </main>
    );
  }

  return (
    <>
      <PeopleDashboard accessToken={session.access_token} profile={profile} onLogout={handleLogout} onChangePassword={() => setPasswordOpen(true)} />
      {passwordOpen && (
        <PasswordDialog
          accessToken={session.access_token}
          onClose={() => setPasswordOpen(false)}
        />
      )}
    </>
  );
}

function ResetDialog({initialLogin,onClose,onSent}:{initialLogin:string;onClose:()=>void;onSent:(message:string)=>void}) {
  const [login,setLogin]=useState(initialLogin);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{onSent(await requestPasswordReset(login));}catch(cause){setError(cause instanceof Error?cause.message:"Reset request failed.");}finally{setBusy(false);}}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="modal reset-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="Close">×</button><span className="eyebrow">Account recovery</span><h2>Reset your password</h2><p className="muted">Enter your username or work email. We will notify an administrator and send a secure reset link to your email.</p><form onSubmit={submit}><label>Username or email<input autoFocus required value={login} onChange={event=>setLogin(event.target.value)}/></label>{error&&<p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?"Sending…":"Send reset email"}</button></div></form></section></div>;
}

function PasswordDialog({ accessToken, onClose }: { accessToken: string; onClose: () => void }) {
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (nextPassword.length < 10) return setMessage("Use at least 10 characters.");
    if (nextPassword !== confirm) return setMessage("The passwords do not match.");
    setBusy(true);
    setMessage("");
    try {
      await changePassword(accessToken, nextPassword);
      setMessage("Password updated securely in Supabase.");
      setNextPassword("");
      setConfirm("");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Password change failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title">
    <button className="modal-close" onClick={onClose} aria-label="Close">x</button>
    <span className="eyebrow">Account security</span>
    <h2 id="password-title">Change password</h2>
    <p className="muted">Your new password is saved directly to your Supabase account.</p>
    <form onSubmit={submit}>
      <label>New password<input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} autoComplete="new-password" required /></label>
      <label>Confirm new password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required /></label>
      {message && <p className="form-message">{message}</p>}
      <button className="primary" disabled={busy}>{busy ? "Updating..." : "Update password"}</button>
    </form>
  </section></div>;
}
