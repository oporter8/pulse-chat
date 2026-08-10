"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MessageSearchResult } from "@/lib/chat-types";
import { formatDateTime } from "@/lib/chat-utils";

type Filter = "messages" | "files" | "links";
type FileResult = { message_id: string; file_name: string; content_type: string | null; created_at: string; messages: { conversation_id: string; body: string; created_at: string } | null };
type LinkResult = { id: string; conversation_id: string; body: string; created_at: string };
type Props = { open: boolean; conversationId: string; conversationTitle: string; clearedAt?: string | null; onClose: () => void; onOpen: (result: MessageSearchResult) => Promise<void> };

const URL_PATTERN = /https?:\/\/[^\s<>()]+/i;

export function ChatSearchModal({ open, conversationId, conversationTitle, clearedAt = null, onClose, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("messages");
  const [messages, setMessages] = useState<MessageSearchResult[]>([]);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [links, setLinks] = useState<LinkResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        if (filter === "messages") {
          if (query.trim().length < 2) { if (!cancelled) setMessages([]); return; }
          const { data } = await supabase.rpc("search_my_messages", { search_text: query.trim(), result_limit: 100 });
          const rows = ((data ?? []) as MessageSearchResult[]).filter((row) => row.conversation_id === conversationId);
          if (!cancelled) setMessages(clearedAt ? rows.filter((row) => new Date(row.created_at).getTime() > new Date(clearedAt).getTime()) : rows);
          return;
        }

        if (filter === "files") {
          const { data } = await supabase
            .from("message_attachments")
            .select("message_id,file_name,content_type,created_at,messages!inner(conversation_id,body,created_at)")
            .eq("messages.conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(150);
          let rows = (data ?? []) as unknown as FileResult[];
          rows = rows.filter((row) => !row.content_type?.startsWith("image/") && !row.content_type?.startsWith("video/"));
          if (clearedAt) rows = rows.filter((row) => new Date(row.created_at).getTime() > new Date(clearedAt).getTime());
          if (query.trim()) rows = rows.filter((row) => row.file_name.toLowerCase().includes(query.trim().toLowerCase()));
          if (!cancelled) setFiles(rows);
          return;
        }

        const { data } = await supabase
          .from("messages")
          .select("id,conversation_id,body,created_at")
          .eq("conversation_id", conversationId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(200);
        let rows = ((data ?? []) as LinkResult[]).filter((row) => URL_PATTERN.test(row.body || ""));
        if (clearedAt) rows = rows.filter((row) => new Date(row.created_at).getTime() > new Date(clearedAt).getTime());
        if (query.trim()) rows = rows.filter((row) => row.body.toLowerCase().includes(query.trim().toLowerCase()));
        if (!cancelled) setLinks(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [clearedAt, conversationId, filter, open, query]);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setFilter("messages"); setMessages([]); setFiles([]); setLinks([]);
  }, [open]);

  if (!open) return null;

  function openFile(row: FileResult) {
    if (!row.messages) return;
    void onOpen({
      message_id: row.message_id,
      conversation_id: row.messages.conversation_id,
      conversation_kind: "dm",
      conversation_title: conversationTitle,
      sender_id: "",
      sender_name: "",
      body: row.messages.body,
      created_at: row.messages.created_at,
    });
  }

  function openLink(row: LinkResult) {
    void onOpen({
      message_id: row.id,
      conversation_id: row.conversation_id,
      conversation_kind: "dm",
      conversation_title: conversationTitle,
      sender_id: "",
      sender_name: "",
      body: row.body,
      created_at: row.created_at,
    });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal-card compact-modal-v8">
      <div className="modal-heading"><div><h2>Search {conversationTitle}</h2><p>Find messages, voice notes, documents, or links in this conversation.</p></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>
      <div className="search-filter-row-v8">
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={filter === "messages" ? "Search messages…" : filter === "files" ? "Filter by file name…" : "Filter links…"} />
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="messages">Messages</option><option value="files">Files & voice</option><option value="links">Links</option></select>
      </div>
      {loading && <p className="search-status">Searching…</p>}
      <div className="history-list-v8">
        {!loading && filter === "messages" && query.trim().length < 2 && <div className="empty-card">Type at least 2 characters to search messages.</div>}
        {!loading && filter === "messages" && query.trim().length >= 2 && messages.length === 0 && <div className="empty-card">No matching messages.</div>}
        {filter === "messages" && messages.map((row) => <button className="saved-message-row-v8" key={row.message_id} type="button" onClick={() => void onOpen(row)}><strong>{row.sender_name}</strong><p>{row.body}</p><small>{formatDateTime(row.created_at)}</small></button>)}
        {!loading && filter === "files" && files.length === 0 && <div className="empty-card">No matching files or voice notes.</div>}
        {filter === "files" && files.map((row) => <button className="saved-message-row-v8" key={`${row.message_id}-${row.file_name}`} type="button" onClick={() => openFile(row)}><strong>{row.content_type?.startsWith("audio/") ? "🎙 " : "↓ "}{row.file_name}</strong><small>{formatDateTime(row.created_at)}</small></button>)}
        {!loading && filter === "links" && links.length === 0 && <div className="empty-card">No matching links.</div>}
        {filter === "links" && links.map((row) => <button className="saved-message-row-v8" key={row.id} type="button" onClick={() => openLink(row)}><strong>Link message</strong><p>{row.body}</p><small>{formatDateTime(row.created_at)}</small></button>)}
      </div>
    </section>
  </div>;
}
