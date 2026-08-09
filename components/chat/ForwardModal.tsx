"use client";

import type { Conversation, Message } from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";

type Props = { message: Message | null; conversations: Conversation[]; onClose: () => void; onForward: (conversationId: string) => Promise<void> };
export function ForwardModal({ message, conversations, onClose, onForward }: Props) {
  if (!message) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal-card compact-modal-v8"><div className="modal-heading"><div><h2>Forward message</h2><p>{message.body || "Attachment message"}</p></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><div className="settings-list">{conversations.filter((c) => !c.archived_at).map((c) => <button className="forward-row-v8" type="button" key={c.conversation_id} onClick={async () => { await onForward(c.conversation_id); onClose(); }}><Avatar name={c.title} path={c.avatar_path} size="small"/><span><strong>{c.title}</strong><small>{c.kind === "group" ? "Group" : "Direct message"}</small></span></button>)}</div></section></div>;
}
