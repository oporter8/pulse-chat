"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/chat");
    });
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const cleanUsername = username.trim().toLowerCase();

        if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
          setMessage("Username must be 3–20 characters: letters, numbers, or underscores.");
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: cleanUsername }
          }
        });

        if (error) throw error;

        setMessage(
          "Account created. If email confirmation is enabled in Supabase, check your inbox before signing in."
        );
        setMode("login");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
        router.replace("/chat");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <h1>Pulse Chat</h1>
            <p>Realtime messaging, built from scratch.</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setMessage("");
            }}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="owen_porter"
                autoComplete="username"
                maxLength={20}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>

          <button className="primary-button" disabled={loading}>
            {loading ? "Working..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        {message && <p className="form-message">{message}</p>}

        <p className="auth-note">
          Your Supabase project controls authentication and stores the messages.
        </p>
      </section>
    </main>
  );
}
