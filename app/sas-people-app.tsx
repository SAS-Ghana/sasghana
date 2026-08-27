"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AuthSession,
  changePassword,
  clearSession,
  fetchProfile,
  readSession,
  registerCurrentSession,
  requestPasswordReset,
  revokeCurrentSession,
  saveSession,
  sendEmailLoginCode,
  signIn,
  signOut,
  UserProfile,
  verifyEmailLoginCode,
} from "./lib/supabase-auth";
import { publishableKey, serviceUrl } from "./lib/supabase-config";
import { PeopleDashboard } from "./people-dashboard";
import { loadAttendancePolicy, runAttendanceAction } from "./quick-attendance";
import {
  applyOrganisationTheme,
  defaultOrganisationConfig,
  loadPublicBranding,
  OrganisationConfig,
} from "./lib/organisation-config";

type PendingVerification = {
  session: AuthSession;
  profile: UserProfile;
  email: string;
  remember: boolean;
};

function authErrorMessage(code: string | null, description: string | null) {
  if (code === "otp_expired")
    return "This email link is invalid or has expired. For two step verification, return to sign in and enter the six digit code shown in the email instead of opening the link.";
  if (description) return description.replaceAll("+", " ");
  return "The authentication request could not be completed. Please sign in again.";
}

function isInsideAutomaticShift(policy: {
  shift_start?: string;
  shift_end?: string;
  timezone?: string;
}) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: policy.timezone || "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const current =
    Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const minutes = (value: string | undefined, fallback: string) => {
    const [hour, minute] = String(value || fallback)
      .split(":")
      .map(Number);
    return hour * 60 + minute;
  };
  return (
    current >= minutes(policy.shift_start, "08:00") &&
    current < minutes(policy.shift_end, "17:00")
  );
}

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
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingVerification | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [branding, setBranding] = useState<OrganisationConfig>(
    defaultOrganisationConfig,
  );

  useEffect(() => {
    void loadPublicBranding()
      .then((next) => {
        setBranding(next);
        applyOrganisationTheme(next);
      })
      .catch(() => undefined);
    const refreshBranding = () =>
      void loadPublicBranding().then((next) => {
        setBranding(next);
        applyOrganisationTheme(next);
      });
    window.addEventListener("sas-branding-changed", refreshBranding);
    return () =>
      window.removeEventListener("sas-branding-changed", refreshBranding);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const query = new URLSearchParams(window.location.search);
      const authError = query.get("error");
      const authErrorCode = query.get("error_code");
      const authDescription = query.get("error_description");
      if (authError || authErrorCode || authDescription) {
        setError(authErrorMessage(authErrorCode, authDescription));
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.hash || ""}`,
        );
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const recoveryToken = hash.get("access_token");
      const recoveryRefresh = hash.get("refresh_token");
      if (hash.get("type") === "recovery" && recoveryToken && recoveryRefresh) {
        const recovered: AuthSession = {
          access_token: recoveryToken,
          refresh_token: recoveryRefresh,
          user: { id: hash.get("user_id") ?? "" },
        };
        fetch(`${serviceUrl}/auth/v1/user`, {
          headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${recoveryToken}`,
          },
        })
          .then((response) => response.json())
          .then(async (user) => {
            recovered.user = { id: user.id, email: user.email };
            const nextProfile = await fetchProfile(recoveryToken, user.id);
            if (nextProfile) {
              setSession(recovered);
              setProfile(nextProfile);
              setPasswordOpen(true);
              window.history.replaceState(null, "", window.location.pathname);
            }
            setReady(true);
          })
          .catch(() => setReady(true));
        return;
      }

      const stored = readSession();
      if (stored) {
        void fetchProfile(stored.access_token, stored.user.id).then(
          (nextProfile) => {
            if (
              nextProfile &&
              ["active", "password_change_required"].includes(
                nextProfile.status,
              )
            ) {
              setSession(stored);
              setProfile(nextProfile);
              void registerCurrentSession(stored.access_token).catch(
                () => undefined,
              );
              if (nextProfile.status === "password_change_required")
                setPasswordOpen(true);
            } else {
              clearSession();
            }
            setReady(true);
          },
        );
        return;
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const requested = () => {
      void handleLogout();
    };
    window.addEventListener("sas-request-signout", requested);
    return () => window.removeEventListener("sas-request-signout", requested);
  }, [session, profile]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await signIn(username, password);
      if (result.profile.two_step_email_enabled) {
        // The code is sent through /auth/v1/otp with should_create_user disabled, so it must go to
        // the address Supabase Auth knows. profiles.email is a separate, editable contact field that
        // frequently differs from the sign-in identity, and preferring it here meant two-step
        // verification requested a code for an address with no auth user behind it.
        const email = result.session.user.email || result.profile.email || "";
        await sendEmailLoginCode(result.session, email);
        setPending({
          session: result.session,
          profile: result.profile,
          email,
          remember,
        });
        setPassword("");
        setNotice(
          `A six digit verification code was sent to ${maskEmail(email)}.`,
        );
        return;
      }
      finishLogin(result.session, result.profile, remember);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  function finishLogin(
    nextSession: AuthSession,
    nextProfile: UserProfile,
    rememberChoice: boolean,
  ) {
    saveSession(nextSession, rememberChoice);
    setSession(nextSession);
    setProfile(nextProfile);
    setPending(null);
    setVerificationCode("");
    setPassword("");
    void registerCurrentSession(nextSession.access_token).catch(
      () => undefined,
    );
    if (nextProfile.status === "password_change_required")
      setPasswordOpen(true);
    if (nextProfile.employee_id) {
      void loadAttendancePolicy(nextSession.access_token)
        .then((policy) => {
          if (
            (policy.auto_clock_in || policy.auto_resume_on_login) &&
            isInsideAutomaticShift(policy)
          )
            return runAttendanceAction(
              nextSession.access_token,
              "auto_clock_in",
              policy,
              "automatic login within configured shift",
            );
        })
        .catch(() => undefined);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const verified = await verifyEmailLoginCode(
        pending.email,
        verificationCode,
      );
      const refreshedProfile = await fetchProfile(
        verified.access_token,
        verified.user.id,
      );
      if (!refreshedProfile)
        throw new Error(
          "Your account profile could not be loaded after verification.",
        );
      finishLogin(verified, refreshedProfile, pending.remember);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await sendEmailLoginCode(pending.session, pending.email);
      setNotice(
        `A new verification code was sent to ${maskEmail(pending.email)}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "A new code could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (session && profile?.employee_id) {
      try {
        const policy = await loadAttendancePolicy(session.access_token);
        if (policy.auto_pause_on_logout)
          await runAttendanceAction(
            session.access_token,
            "logout_pause",
            policy,
            "logout or session timeout",
          );
      } catch {
        // Attendance logout should not prevent account logout.
      }
    }
    if (session) {
      await revokeCurrentSession(session.access_token).catch(() => false);
      await signOut(session.access_token);
    }
    clearSession();
    setSession(null);
    setProfile(null);
  }

  if (!ready)
    return <div className="app-loading">Loading {branding.shortName}...</div>;

  if (pending)
    return (
      <main className="login-shell">
        <section className="login-brand">
          <img
            src={branding.loginLogoUrl || branding.logoUrl || "/logo.png"}
            alt={branding.shortName}
            width="330"
            height="92"
          />
          <div>
            <span className="eyebrow">Login verification</span>
            <h1>Confirm it is you.</h1>
            <p>Enter the code sent to your registered work email.</p>
          </div>
          <small>Authorised SAS personnel only</small>
        </section>
        <section className="login-panel">
          <form className="login-card" onSubmit={verifyCode}>
            <div className="login-mark">SAS</div>
            <h2>Two step verification</h2>
            <p className="muted">
              We sent a six digit code to {maskEmail(pending.email)}. Codes
              expire shortly and can only be used once.
            </p>
            <label htmlFor="login-verification-code">
              Verification code
              <input
                id="login-verification-code"
                name="verification_code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                required
              />
            </label>
            {notice && <p className="form-message">{notice}</p>}
            {error && <p className="form-error">{error}</p>}
            <button
              type="submit"
              className="primary login-submit"
              disabled={busy || verificationCode.length !== 6}
            >
              {busy ? "Verifying..." : "Verify and continue"}
            </button>
            <div className="login-options">
              <button
                type="button"
                className="link-button"
                disabled={busy}
                onClick={() => void resendCode()}
              >
                Send a new code
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setPending(null);
                  setVerificationCode("");
                  setNotice("");
                  setError("");
                }}
              >
                Use another account
              </button>
            </div>
          </form>
        </section>
      </main>
    );

  if (!session || !profile)
    return (
      <main className="login-shell">
        <section className="login-brand">
          <img
            src={branding.loginLogoUrl || branding.logoUrl || "/logo.png"}
            alt={branding.shortName}
            width="330"
            height="92"
          />
          <div>
            <span className="eyebrow">{branding.loginEyebrow}</span>
            <h1>{branding.loginTitle}</h1>
            <p>{branding.loginWelcome}</p>
          </div>
          <small>Authorised {branding.shortName} personnel only</small>
        </section>
        <section className="login-panel">
          <form className="login-card" onSubmit={handleLogin}>
            <div className="login-mark">
              {branding.shortName.slice(0, 3).toUpperCase()}
            </div>
            <h2>Welcome to {branding.shortName}</h2>
            <p className="muted">
              Sign in with the account issued by your administrator.
            </p>
            <label htmlFor="login-username">
              Username
              <input
                id="login-username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label htmlFor="login-password">
              Password
              <span className="password-field">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <div className="login-options">
              <label className="check" htmlFor="login-remember">
                <input
                  id="login-remember"
                  name="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />{" "}
                Remember me
              </label>
              <button
                type="button"
                className="link-button"
                onClick={() => setResetOpen(true)}
              >
                Forgot password?
              </button>
            </div>
            {notice && <p className="form-message">{notice}</p>}
            {error && <p className="form-error">{error}</p>}
            <button
              type="submit"
              className="primary login-submit"
              disabled={busy}
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <p className="login-help">
              Need help? Contact your SAS system administrator.
            </p>
          </form>
          {resetOpen && (
            <ResetDialog
              initialLogin={username}
              onClose={() => setResetOpen(false)}
              onSent={(message) => {
                setResetOpen(false);
                setNotice(message);
              }}
            />
          )}
        </section>
      </main>
    );

  return (
    <>
      <PeopleDashboard
        accessToken={session.access_token}
        profile={profile}
        onLogout={handleLogout}
        onChangePassword={() => setPasswordOpen(true)}
      />
      {passwordOpen && (
        <PasswordDialog
          accessToken={session.access_token}
          forced={profile.status === "password_change_required"}
          onClose={() => setPasswordOpen(false)}
          onUpdated={() =>
            setProfile((current) =>
              current ? { ...current, status: "active" } : current,
            )
          }
        />
      )}
    </>
  );
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return domain ? `${name.slice(0, 2)}***@${domain}` : "your email";
}

function ResetDialog({
  initialLogin,
  onClose,
  onSent,
}: {
  initialLogin: string;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [login, setLogin] = useState(initialLogin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSent(await requestPasswordReset(login));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Reset request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="modal reset-modal">
        <button type="button" className="modal-close" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">Account recovery</span>
        <h2>Reset your password</h2>
        <p className="muted">
          Enter your username or work email. A secure reset link will be sent to
          your email.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="reset-login">
            Username or email
            <input
              id="reset-login"
              name="login"
              autoFocus
              required
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Sending…" : "Send reset email"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordDialog({
  accessToken,
  onClose,
  onUpdated,
  forced = false,
}: {
  accessToken: string;
  onClose: () => void;
  onUpdated: () => void;
  forced?: boolean;
}) {
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nextPassword.length < 10)
      return setMessage("Use at least 10 characters.");
    if (nextPassword !== confirm)
      return setMessage("The passwords do not match.");
    setBusy(true);
    setMessage("");
    try {
      await changePassword(accessToken, nextPassword);
      onUpdated();
      setMessage("Password updated securely.");
      setNextPassword("");
      setConfirm("");
      window.setTimeout(onClose, 700);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Password change failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (!forced && event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal">
        {!forced && (
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        )}
        <span className="eyebrow">Account security</span>
        <h2>Change password</h2>
        <p className="muted">
          {forced
            ? "Set your private password before continuing."
            : "Use a strong password that is not shared with another service."}
        </p>
        <form onSubmit={submit}>
          <label htmlFor="new-password">
            New password
            <input
              id="new-password"
              name="new_password"
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label htmlFor="confirm-password">
            Confirm new password
            <input
              id="confirm-password"
              name="confirm_password"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          {message && <p className="form-message">{message}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Updating..." : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
