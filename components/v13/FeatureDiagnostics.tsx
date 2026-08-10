"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Check = { name: string; detail: string; status: "checking" | "ready" | "warning" | "error" };

export function FeatureDiagnostics() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const next: Check[] = [];
    const add = (name: string, detail: string, status: Check["status"]) => next.push({ name, detail, status });
    const { data: v13, error: v13Error } = await supabase.rpc("tiger_v13_status");
    add("v13 database", v13Error ? v13Error.message : `Version ${(v13 as any)?.version ?? "?"} detected`, v13Error ? "error" : "ready");

    const probes: Array<[string, string]> = [
      ["Theme storage", "user_themes"], ["Terms acceptance", "legal_acceptances"], ["Polls", "chat_polls"], ["Events", "group_events"],
      ["Scheduled messages", "scheduled_messages"], ["Text stories", "text_stories"], ["Support Center", "support_campaigns"], ["Folders", "conversation_folders"],
      ["Home dashboard", "dashboard_preferences"], ["Focus Mode", "focus_sessions"], ["School schedule", "school_schedule_settings"], ["Beta Labs", "user_beta_preferences"],
    ];
    for (const [name, table] of probes) {
      const { error } = await supabase.from(table).select("*").limit(1);
      add(name, error ? error.message : `${table} reachable`, error ? "error" : "ready");
    }

    add("Voice recording", typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) ? "Browser supports microphone recording" : "This browser cannot record voice notes", typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) ? "ready" : "warning");
    add("Clipboard", navigator.clipboard ? "Clipboard API available" : "Theme/profile copy actions may need HTTPS", navigator.clipboard ? "ready" : "warning");
    add("Push notifications", "Notification" in window && "serviceWorker" in navigator ? `Permission: ${Notification.permission}` : "Web Push is not supported here", "Notification" in window && "serviceWorker" in navigator ? "ready" : "warning");
    add("Network", navigator.onLine ? "Online" : "Offline — retry queue will be used", navigator.onLine ? "ready" : "warning");
    setChecks(next); setRunning(false);
  }

  useEffect(() => { void run(); }, []);
  return <div className="tiger-card"><div className="v13-diagnostic-heading"><div><p className="v12-kicker">Admin tools</p><h3>Feature diagnostics</h3><p className="muted-copy">Checks whether the tables and browser capabilities used by the current feature set are actually available.</p></div><button className="secondary-button" onClick={() => void run()} disabled={running}>{running ? "Checking…" : "Run again"}</button></div><div className="v13-diagnostic-list">{checks.map((check) => <div key={check.name} className={`v13-diagnostic ${check.status}`}><span aria-hidden="true">{check.status === "ready" ? "✓" : check.status === "warning" ? "!" : check.status === "error" ? "×" : "…"}</span><div><strong>{check.name}</strong><small>{check.detail}</small></div></div>)}</div></div>;
}
