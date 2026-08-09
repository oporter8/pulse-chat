"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/chat-utils";

type SavedRow = { message_id: string; created_at: string; messages: { id: string; conversation_id: string; body: string; created_at: string; deleted_at: string | null } | null };
type Props = { open: boolean; onClose: () => void; onOpenMessage: (conversationId: string, messageId: string, createdAt: string) => Promise<void> };

export function SavedMessagesModal({ open, onClose, onOpenMessage }: Props) {
  const [rows, setRows] = useState<SavedRow[]>([]);
  useEffect(() => {
    if (!open) return;
    void supabase.from("saved_messages").select("message_id,created_at,messages(id,conversation_id,body,created_at,deleted_at)").order("created_at", { ascending: false }).then(({ data }) => setRows((data ?? []) as unknown as SavedRow[]));
  }, [open]);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal-card compact-modal-v8"><div className="modal-heading"><div><h2>Saved messages</h2><p>Messages you starred for later.</p></div><button className="icon-button" type="button" onClick={onClose}>×</button></div><div className="history-list-v8">{rows.length === 0 ? <div className="empty-card">No saved messages yet.</div> : rows.map((row) => <button type="button" className="saved-message-row-v8" key={row.message_id} disabled={!row.messages} onClick={() => row.messages && void onOpenMessage(row.messages.conversation_id,row.messages.id,row.messages.created_at)}><strong>{row.messages?.deleted_at ? "Message deleted" : row.messages?.body || "Attachment"}</strong><small>{row.messages ? formatDateTime(row.messages.created_at) : "Unavailable"}</small></button>)}</div></section></div>;
}
