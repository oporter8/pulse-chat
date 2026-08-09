"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Opening your recovery session…");

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
        setMessage("");
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setReady(true);
        setMessage("");
      } else {
        window.setTimeout(() => {
          if (mounted) setMessage("This recovery link is invalid or expired. Request a new password reset email.");
        }, 1200);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Use at least 8 characters for your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <h1>New password</h1>
            <p>Choose a new password for your Tiger Chat account.</p>
          </div>
        </div>

        <form className="auth-form reset-password-form" onSubmit={submit}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              disabled={!ready}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              disabled={!ready}
              required
            />
          </label>

          <button className="primary-button" disabled={!ready || saving}>
            {saving ? "Saving…" : "Save new password"}
          </button>
        </form>

        {message && <p className="form-message">{message}</p>}
      </section>
    </main>
  );
}
