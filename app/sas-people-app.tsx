"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import {
  AuthSession,
  changePassword,
  clearSession,
  readSession,
  saveSession,
  signIn,
  signOut,
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

  useEffect(() => {
    void Promise.resolve().then(() => {
      const stored = readSession();
      if (stored) {
        setSession(stored);
        setProfile({
          id: stored.user.id,
          username: "Administrator",
          display_name: "Administrator",
          status: "active",
        });
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
          <Image src="/logo.png" alt="SAS Finance Group" width={330} height={92} priority />
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
              <button type="button" className="link-button">Forgot password?</button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary login-submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
            <p className="login-help">Need help? Contact your SAS system administrator.</p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <>
      <PeopleDashboard profile={profile} onLogout={handleLogout} onChangePassword={() => setPasswordOpen(true)} />
      {passwordOpen && (
        <PasswordDialog
          accessToken={session.access_token}
          onClose={() => setPasswordOpen(false)}
        />
      )}
    </>
  );
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

  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title">
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
