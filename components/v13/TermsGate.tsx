"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TIGER_MINIMUM_AGE, TIGER_PRIVACY_VERSION, TIGER_TOS_VERSION } from "@/lib/legal";

const EXEMPT = ["/terms", "/privacy", "/guidelines", "/reset-password"];

type Acceptance = { tos_version: string; privacy_version: string; accepted_at: string };

export function TermsGate() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [needed, setNeeded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (EXEMPT.some((prefix) => pathname?.startsWith(prefix)) || pathname === "/") {
      setNeeded(false);
      document.documentElement.removeAttribute("data-tiger-legal-gate");
      window.dispatchEvent(new CustomEvent("tiger-legal-gate", { detail: { open: false } }));
      return;
    }
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) {
        setNeeded(false);
        return;
      }
      setUserId(data.user.id);
      const { data: row, error } = await supabase
        .from("legal_acceptances")
        .select("tos_version,privacy_version,accepted_at")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setMessage("Terms setup is not complete yet. Run the Tiger Chat v13 Supabase migration.");
        setNeeded(true);
      } else {
        const acceptance = row as Acceptance | null;
        setNeeded(!acceptance || acceptance.tos_version !== TIGER_TOS_VERSION || acceptance.privacy_version !== TIGER_PRIVACY_VERSION);
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (needed) {
      document.documentElement.dataset.tigerLegalGate = "open";
      window.dispatchEvent(new CustomEvent("tiger-legal-gate", { detail: { open: true } }));
    } else {
      document.documentElement.removeAttribute("data-tiger-legal-gate");
      window.dispatchEvent(new CustomEvent("tiger-legal-gate", { detail: { open: false } }));
    }
    return () => {
      document.documentElement.removeAttribute("data-tiger-legal-gate");
      window.dispatchEvent(new CustomEvent("tiger-legal-gate", { detail: { open: false } }));
    };
  }, [needed]);

  async function accept() {
    if (!checked || !userId) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("legal_acceptances").upsert({
      user_id: userId,
      tos_version: TIGER_TOS_VERSION,
      privacy_version: TIGER_PRIVACY_VERSION,
      accepted_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) setMessage(error.message);
    else { setNeeded(false); setChecked(false); }
    setSaving(false);
  }

  if (!needed) return null;

  return <div className="v13-terms-gate" role="dialog" aria-modal="true" aria-labelledby="v13-terms-title">
    <section className="v13-terms-card">
      <div className="v13-terms-icon" aria-hidden="true">T</div>
      <p className="v12-kicker">Before you continue</p>
      <h2 id="v13-terms-title">Tiger Chat Terms</h2>
      <p>Tiger Chat has versioned Terms of Service and a Privacy Policy. You need to accept the current versions before using authenticated features.</p>
      <div className="v13-terms-summary">
        <span>✓ You must be at least {TIGER_MINIMUM_AGE}.</span>
        <span>✓ Harassment, threats, impersonation, exploitation, malware, and illegal use are prohibited.</span>
        <span>✓ Tiger Chat is text/audio-only for user-generated media.</span>
        <span>✓ Moderators may remove content or restrict accounts when needed for safety or rule enforcement.</span>
      </div>
      <p className="v13-legal-links"><Link href="/terms" target="_blank">Read Terms</Link><Link href="/privacy" target="_blank">Privacy Policy</Link><Link href="/guidelines" target="_blank">Community Guidelines</Link></p>
      <label className="v13-terms-check"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I agree to the current Terms and Privacy Policy and confirm I am at least {TIGER_MINIMUM_AGE}.</span></label>
      {message && <p className="form-message">{message}</p>}
      <button className="primary-button v13-accept-button" disabled={!checked || saving || !userId} onClick={() => void accept()}>{saving ? "Saving…" : "Accept and continue"}</button>
    </section>
  </div>;
}
