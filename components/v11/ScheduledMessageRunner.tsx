"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function ScheduledMessageRunner() {
  useEffect(() => {
    let stopped = false;
    let running = false;
    async function run() {
      if (stopped || running || !navigator.onLine || document.visibilityState === "hidden") return;
      running = true;
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        await supabase.rpc("send_due_scheduled_messages");
      } finally { running = false; }
    }
    const wake = () => void run();
    void run();
    const timer = window.setInterval(wake, 15_000);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("online", wake); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, []);
  return null;
}
