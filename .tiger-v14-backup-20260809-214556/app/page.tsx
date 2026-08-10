"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { TIGER_MINIMUM_AGE, TIGER_PRIVACY_VERSION, TIGER_TOS_VERSION } from "@/lib/legal";

type Mode = "login" | "signup" | "forgot";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function chatDestination() {
    if (typeof window === "undefined") return "/home";
    const requestedUser = new URLSearchParams(window.location.search).get("user")?.trim();
    return requestedUser ? `/chat?user=${encodeURIComponent(requestedUser)}` : "/home";
  }

  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace(chatDestination()); }); }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(""); setLoading(true);
    try {
      if (mode === "forgot") {
        const cleanEmail = email.trim(); if (!cleanEmail) { setMessage("Enter the email address on your Tiger account."); return; }
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error; setMessage("Password reset email sent. Open the link in that email to choose a new password."); return;
      }

      if (mode === "signup") {
        const cleanUsername = username.trim().toLowerCase(); const cleanDisplayName = displayName.trim() || cleanUsername;
        if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) { setMessage("Username must be 3–20 characters: letters, numbers, or underscores."); return; }
        if (!acceptedTerms) { setMessage(`You must agree to the Terms and Privacy Policy and confirm you are at least ${TIGER_MINIMUM_AGE}.`); return; }
        const acceptedAt = new Date().toISOString();
        const { error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { username: cleanUsername, display_name: cleanDisplayName, tos_version: TIGER_TOS_VERSION, privacy_version: TIGER_PRIVACY_VERSION, legal_accepted_at: acceptedAt } },
        });
        if (error) throw error;
        setMessage("Account created. If email confirmation is enabled, check your inbox before signing in."); setMode("login"); setPassword(""); setAcceptedTerms(false);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error; if (!data.session) throw new Error("Tiger Chat could not establish a login session. Please try again.");
        window.sessionStorage.setItem("pulse-fresh-login", "1"); router.replace(chatDestination());
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong."); }
    finally { setLoading(false); }
  }

  return <main className="auth-shell"><section className="auth-card v13-auth-card">
    <div className="brand-lockup"><div className="brand-mark"><span className="v13-auth-letter">T</span></div><div><h1>Tiger Chat</h1><p>Messaging, community, and your own theme.</p></div></div>
    {mode !== "forgot" ? <div className="auth-tabs" role="tablist"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Log in</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>Sign up</button></div> : <div className="auth-recovery-heading"><button type="button" className="text-button" onClick={() => { setMode("login"); setMessage(""); }}>← Back to login</button><h2>Reset your password</h2><p>We’ll email you a secure recovery link.</p></div>}
    <form className="auth-form" onSubmit={submit}>
      {mode === "signup" && <><label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="First Last" autoComplete="name" maxLength={40} /></label><label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoComplete="username" maxLength={20} required /></label></>}
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
      {mode !== "forgot" && <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></label>}
      {mode === "signup" && <label className="v13-signup-terms"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} required /><span>I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>, will follow the <Link href="/guidelines" target="_blank">Community Guidelines</Link>, and confirm I am at least {TIGER_MINIMUM_AGE}.</span></label>}
      {mode === "login" && <button type="button" className="auth-forgot-button" onClick={() => { setMode("forgot"); setPassword(""); setMessage(""); }}>Forgot password?</button>}
      <button className="primary-button" disabled={loading || (mode === "signup" && !acceptedTerms)}>{loading ? "Working..." : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset email"}</button>
    </form>
    {message && <p className="form-message">{message}</p>}
    <p className="auth-note">By using Tiger Chat, you’re using an independently operated community service. <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></p>
  </section></main>;
}
