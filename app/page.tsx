"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup" | "forgot";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function chatDestination() {
    if (typeof window === "undefined") return "/chat";
    const requestedUser = new URLSearchParams(window.location.search).get("user")?.trim();
    return requestedUser ? `/chat?user=${encodeURIComponent(requestedUser)}` : "/chat";
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(chatDestination());
    });
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (mode === "forgot") {
        const cleanEmail = email.trim();
        if (!cleanEmail) {
          setMessage("Enter the email address on your Pulse account.");
          return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;

        setMessage("Password reset email sent. Open the link in that email to choose a new password.");
        return;
      }

      if (mode === "signup") {
        const cleanUsername = username.trim().toLowerCase();
        const cleanDisplayName = displayName.trim() || cleanUsername;

        if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
          setMessage("Username must be 3–20 characters: letters, numbers, or underscores.");
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: cleanUsername, display_name: cleanDisplayName },
          },
        });

        if (error) throw error;

        setMessage(
          "Account created. If email confirmation is enabled in Supabase, check your inbox before signing in.",
        );
        setMode("login");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        router.replace(chatDestination());
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

        {mode !== "forgot" ? (
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
        ) : (
          <div className="auth-recovery-heading">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
            >
              ← Back to login
            </button>
            <h2>Reset your password</h2>
            <p>We’ll email you a secure recovery link.</p>
          </div>
        )}

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Owen Porter"
                  autoComplete="name"
                  maxLength={40}
                />
              </label>
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
            </>
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

          {mode !== "forgot" && (
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
          )}

          {mode === "login" && (
            <button
              type="button"
              className="auth-forgot-button"
              onClick={() => {
                setMode("forgot");
                setPassword("");
                setMessage("");
              }}
            >
              Forgot password?
            </button>
          )}

          <button className="primary-button" disabled={loading}>
            {loading
              ? "Working..."
              : mode === "login"
                ? "Log in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset email"}
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
