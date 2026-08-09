"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MessageEdit } from "@/lib/chat-types";
import { formatDateTime } from "@/lib/chat-utils";

type Props = { messageId: string | null; currentBody: string; onClose: () => void };

export function EditHistoryModal({ messageId, currentBody, onClose }: Props) {
  const [items, setItems] = useState<MessageEdit[]>([]);
  useEffect(() => {
    if (!messageId) return;
    void supabase.from("message_edits").select("id,message_id,editor_id,old_body,edited_at").eq("message_id", messageId).order("edited_at", { ascending: false }).then(({ data }) => setItems((data ?? []) as MessageEdit[]));
  }, [messageId]);
  if (!messageId) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal-card compact-modal-v8"><div className="modal-heading"><div><h2>Edit history</h2><p>Previous versions of this message.</p></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>
        <div className="history-list-v8"><article><strong>Current</strong><p>{currentBody || "(empty)"}</p></article>{items.map((item) => <article key={item.id}><small>{formatDateTime(item.edited_at)}</small><p>{item.old_body || "(empty)"}</p></article>)}</div>
      </section>
    </div>
  );
}
