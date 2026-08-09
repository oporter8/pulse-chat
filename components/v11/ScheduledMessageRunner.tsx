"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function ScheduledMessageRunner() {
  useEffect(() => {
    let stopped = false;
    async function run() {
      if (stopped || !navigator.onLine) return;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await supabase.rpc("send_due_scheduled_messages");
    }
    void run();
    const timer = window.setInterval(() => void run(), 60_000);
    window.addEventListener("online", run);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("online", run); };
  }, []);
  return null;
}
