"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function JoinGroupPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("Checking invite…");

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace(`/login?next=${encodeURIComponent(`/join/${params.token}`)}`); return; }
      const { error } = await supabase.rpc("use_group_invite", { invite_token: String(params.token || "") });
      if (error) { setStatus(error.message); return; }
      setStatus("Joined. Opening Tiger Chat…"); window.setTimeout(() => router.replace("/chat"), 500);
    })();
  }, [params.token, router]);

  return <main className="tiger-v11-shell"><section className="tiger-card"><h1>🐯 Group invite</h1><p>{status}</p></section></main>;
}
