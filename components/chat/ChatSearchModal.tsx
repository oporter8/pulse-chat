"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MessageSearchResult } from "@/lib/chat-types";
import { formatDateTime } from "@/lib/chat-utils";

type Filter = "all" | "photos" | "files";
type MediaResult = { message_id: string; file_name: string; content_type: string | null; created_at: string; messages: { conversation_id: string; body: string; created_at: string } | null };
type Props = { open: boolean; conversationId: string; conversationTitle: string; clearedAt?: string | null; onClose: () => void; onOpen: (result: MessageSearchResult) => Promise<void> };

export function ChatSearchModal({ open, conversationId, conversationTitle, clearedAt = null, onClose, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [messages, setMessages] = useState<MessageSearchResult[]>([]);
  const [media, setMedia] = useState<MediaResult[]>([]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(async () => {
      if (filter === "all") {
        if (query.trim().length < 2) { setMessages([]); return; }
        const { data } = await supabase.rpc("search_my_messages", { search_text: query.trim(), result_limit: 100 });
        setMessages(((data ?? []) as MessageSearchResult[]).filter((r) => r.conversation_id === conversationId));
      } else {
        const { data } = await supabase.from("message_attachments").select("message_id,file_name,content_type,created_at,messages!inner(conversation_id,body,created_at)").eq("messages.conversation_id", conversationId).order("created_at", { ascending: false }).limit(100);
        const filteredData = clearedAt ? (data ?? []).filter((row: any) => new Date(row.created_at).getTime() > new Date(clearedAt).getTime()) : (data ?? []);
        const rows = filteredData as unknown as MediaResult[];
        setMedia(rows.filter((row) => filter === "photos" ? row.content_type?.startsWith("image/") : !row.content_type?.startsWith("image/")).filter((row) => !query.trim() || row.file_name.toLowerCase().includes(query.trim().toLowerCase())));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [clearedAt, conversationId, filter, open, query]);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal-card compact-modal-v8"><div className="modal-heading"><div><h2>Search {conversationTitle}</h2><p>Find text, photos, or files in this conversation.</p></div><button className="icon-button" type="button" onClick={onClose}>×</button></div><div className="search-filter-row-v8"><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={filter === "all" ? "Search messages…" : "Filter by file name…"}/><select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}><option value="all">Messages</option><option value="photos">Photos</option><option value="files">Files</option></select></div><div className="history-list-v8">{filter === "all" ? messages.map((r) => <button className="saved-message-row-v8" key={r.message_id} type="button" onClick={() => void onOpen(r)}><strong>{r.sender_name}</strong><p>{r.body}</p><small>{formatDateTime(r.created_at)}</small></button>) : media.map((r) => <button className="saved-message-row-v8" key={`${r.message_id}-${r.file_name}`} type="button" onClick={() => r.messages && void onOpen({ message_id:r.message_id, conversation_id:r.messages.conversation_id, conversation_kind:"dm", conversation_title:conversationTitle, sender_id:"", sender_name:"", body:r.messages.body, created_at:r.messages.created_at })}><strong>{r.file_name}</strong><small>{formatDateTime(r.created_at)}</small></button>)}</div></section></div>;
}
