"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Conversation, MessageSearchResult } from "@/lib/chat-types";
import { formatDateTime } from "@/lib/chat-utils";

const SEARCH_LIMIT = 60;

type SearchModalProps = {
  open: boolean;
  conversations: Conversation[];
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenMessage: (result: MessageSearchResult) => void;
};

export function SearchModal({
  open,
  conversations,
  onClose,
  onOpenConversation,
  onOpenMessage,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [messageResults, setMessageResults] = useState<MessageSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setMessageResults([]);
    setSearching(false);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const clean = query.trim();
  const conversationResults = useMemo(() => {
    if (clean.length < 2) return [];
    const needle = clean.toLowerCase();
    return conversations
      .filter(
        (conversation) =>
          conversation.title.toLowerCase().includes(needle) ||
          (conversation.last_message ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 12);
  }, [clean, conversations]);

  useEffect(() => {
    if (!open || clean.length < 2) {
      setMessageResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError("");

      const { data, error: searchError } = await supabase.rpc("search_my_messages", {
        search_text: clean,
        result_limit: SEARCH_LIMIT,
      });

      if (cancelled) return;

      if (searchError) {
        setError(searchError.message);
        setMessageResults([]);
      } else {
        setMessageResults(
          ((data ?? []) as Record<string, unknown>[]).map((row) => ({
            message_id: String(row.message_id),
            conversation_id: String(row.conversation_id),
            conversation_kind: row.conversation_kind === "group" ? "group" : "dm",
            conversation_title: String(row.conversation_title ?? "Conversation"),
            sender_id: String(row.sender_id),
            sender_name: String(row.sender_name ?? "User"),
            body: String(row.body ?? ""),
            created_at: String(row.created_at),
          })),
        );
      }

      setSearching(false);
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clean, open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop search-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="modal-card search-modal-v6" role="dialog" aria-modal="true" aria-labelledby="search-title">
        <div className="modal-heading search-heading-v6">
          <div>
            <h2 id="search-title">Search Pulse</h2>
            <p>Find a conversation or search the messages you can access.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close search">×</button>
        </div>

        <div className="global-search-input-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats and messages…"
            aria-label="Search chats and messages"
          />
        </div>

        {clean.length < 2 ? (
          <div className="search-empty-v6">Type at least 2 characters to search.</div>
        ) : (
          <div className="global-search-results">
            <section>
              <div className="search-section-title"><strong>Conversations</strong><small>{conversationResults.length}</small></div>
              {conversationResults.length === 0 ? (
                <div className="search-subempty">No matching conversations.</div>
              ) : (
                <div className="search-result-list">
                  {conversationResults.map((conversation) => (
                    <button
                      type="button"
                      key={conversation.conversation_id}
                      className="global-search-result"
                      onClick={() => onOpenConversation(conversation.conversation_id)}
                    >
                      <span className="search-result-icon" aria-hidden="true">{conversation.kind === "group" ? "G" : "D"}</span>
                      <span className="grow-copy">
                        <strong>{conversation.title}</strong>
                        <small>{conversation.last_message ?? (conversation.kind === "group" ? "Group chat" : "Direct message")}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="search-section-title"><strong>Messages</strong><small>{searching ? "…" : messageResults.length}</small></div>
              {error ? (
                <div className="search-error-v6">{error}</div>
              ) : searching ? (
                <div className="search-subempty">Searching messages…</div>
              ) : messageResults.length === 0 ? (
                <div className="search-subempty">No matching messages.</div>
              ) : (
                <div className="search-result-list message-search-list">
                  {messageResults.map((result) => (
                    <button
                      type="button"
                      key={result.message_id}
                      className="global-search-result message-search-result"
                      onClick={() => onOpenMessage(result)}
                    >
                      <span className="search-result-icon" aria-hidden="true">↳</span>
                      <span className="grow-copy">
                        <span className="search-result-topline">
                          <strong>{result.conversation_title}</strong>
                          <time>{formatDateTime(result.created_at)}</time>
                        </span>
                        <small><b>{result.sender_name}:</b> {result.body}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
