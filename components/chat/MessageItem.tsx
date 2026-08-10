"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationMember, Message } from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";
import { formatBytes, formatDateTime, formatTime } from "@/lib/chat-utils";
import { haptic } from "@/lib/sounds";
import { RoleBadges } from "@/components/v13/RoleBadges";
import { RichText } from "@/components/v11/RichText";
import { getV11ProfileStyle, type V11ProfileStyle } from "@/lib/v11-profile";
import { parseTigerMessage } from "@/lib/tiger-bot";

const DEFAULT_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮"];

type MessageItemProps = {
  message: Message;
  currentUserId: string;
  replyMessage?: Message;
  members: ConversationMember[];
  highlighted?: boolean;
  isAdmin?: boolean;
  recentReactions?: string[];
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReact: (message: Message, emoji: string) => void;
  onReport: (message: Message) => void;
  onForward: (message: Message) => void;
  onSave: (message: Message) => void;
  onProfile: (message: Message) => void;
  onImage: (src: string, name: string) => void;
  onViewEdits: (message: Message) => void;
  onRetry?: (message: Message) => void;
};

export function MessageItem({
  message,
  currentUserId,
  replyMessage,
  members,
  highlighted = false,
  isAdmin = false,
  recentReactions = [],
  onReply,
  onEdit,
  onDelete,
  onReact,
  onReport,
  onForward,
  onSave,
  onProfile,
  onViewEdits,
  onRetry,
}: MessageItemProps) {
  const mine = message.sender_id === currentUserId;
  const senderName = message.sender?.display_name || message.sender?.username || "User";
  const [showExactTime, setShowExactTime] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [senderStyle, setSenderStyle] = useState<V11ProfileStyle | null>(null);
  const [myStyle, setMyStyle] = useState<V11ProfileStyle | null>(null);
  const touchStart = useRef<number | null>(null);
  const parsed = useMemo(() => parseTigerMessage(message.body || "", message.id), [message.body, message.id]);

  useEffect(() => {
    let cancelled = false;
    void getV11ProfileStyle(message.sender_id).then((value) => { if (!cancelled) setSenderStyle(value); });
    return () => { cancelled = true; };
  }, [message.sender_id]);

  useEffect(() => {
    let cancelled = false;
    void getV11ProfileStyle(currentUserId).then((value) => { if (!cancelled) setMyStyle(value); });
    return () => { cancelled = true; };
  }, [currentUserId]);

  const reactionChoices = useMemo(() => {
    const custom = myStyle?.custom_reactions?.length ? myStyle.custom_reactions : DEFAULT_REACTIONS;
    const limit = myStyle?.supporter ? 8 : 5;
    return Array.from(new Set([...recentReactions, ...custom, ...DEFAULT_REACTIONS])).slice(0, limit);
  }, [myStyle, recentReactions]);

  const otherReaders = members.filter((member) => {
    if (member.user_id === currentUserId || !member.last_read_at) return false;
    return new Date(member.last_read_at).getTime() >= new Date(message.created_at).getTime();
  });

  const reactionGroups = message.reactions.reduce<Record<string, { count: number; mine: boolean }>>((groups, reaction) => {
    const current = groups[reaction.emoji] ?? { count: 0, mine: false };
    current.count += 1;
    if (reaction.user_id === currentUserId) current.mine = true;
    groups[reaction.emoji] = current;
    return groups;
  }, {});

  const deliveryLabel = useMemo(() => {
    if (!mine || message.local_status) return message.local_status === "sending" ? "Sending…" : message.local_status === "failed" ? "Failed" : "";
    const otherIds = members.filter((m) => m.user_id !== currentUserId).map((m) => m.user_id);
    if (otherIds.length === 0) return "Sent";
    const receipts = message.receipts.filter((r) => otherIds.includes(r.user_id));
    const read = receipts.filter((r) => r.read_at).length;
    if (read > 0) return otherIds.length === 1 ? "Read" : `Read by ${read}`;
    if (receipts.length > 0) return otherIds.length === 1 ? "Delivered" : `Delivered to ${receipts.length}`;
    return "Sent";
  }, [currentUserId, members, message.local_status, message.receipts, mine]);

  async function copy() {
    if (!message.body) return;
    await navigator.clipboard.writeText(message.body);
    haptic(8);
  }

  const effectClass = parsed.effect === "none" ? "" : `tiger-effect-${parsed.effect}`;

  return (
    <article
      className={`message-row-v5 ${mine ? "mine" : ""} ${message.deleted_at ? "deleted" : ""} ${highlighted ? "search-highlight-v6" : ""} ${message.local_status ? `local-${message.local_status}` : ""} ${effectClass}`}
      data-sender-accent={senderStyle?.supporter ? senderStyle.accent_color : undefined}
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const end = event.changedTouches[0]?.clientX;
        touchStart.current = null;
        if (start != null && end != null && end - start > 70 && !message.deleted_at) { haptic(8); onReply(message); }
      }}
    >
      {!mine && <button type="button" className={`avatar-button-v8 tiger-frame-${senderStyle?.profile_frame || "none"}`} onClick={() => onProfile(message)} aria-label={`View ${senderName} profile`}><Avatar name={senderName} path={null} size="small" /></button>}

      <div className="message-content-v5">
        <div className="message-meta-v5">
          <button type="button" className={`message-sender-button-v8 ${senderStyle?.supporter ? "tiger-supporter-name" : ""}`} onClick={() => !mine && onProfile(message)}><strong>{mine ? "You" : senderName}</strong></button>
          {senderStyle?.supporter && <span className="tiger-supporter-badge">⭐ {senderStyle.supporter_label}</span>}
          {message.sender?.admin_tag && <span className="admin-badge-v7">{message.sender.admin_tag}</span>}
          <RoleBadges staffRole={message.sender?.staff_role} communityRoles={message.sender?.community_roles ?? []} compact hideOwner={Boolean(message.sender?.admin_tag)} />
          <button type="button" className="timestamp-button-v8" onClick={() => setShowExactTime((v) => !v)} title="Show full timestamp"><time>{showExactTime ? formatDateTime(message.created_at) : formatTime(message.created_at)}</time></button>
          {message.edited_at && !message.deleted_at && <button type="button" className="edited-button-v8" onClick={() => onViewEdits(message)}>edited</button>}
        </div>

        {message.forwarded_from && !message.deleted_at && <div className="forwarded-label-v8">↪ Forwarded</div>}

        {replyMessage && !message.deleted_at && (
          <button type="button" className="reply-preview" onClick={() => document.getElementById(`message-${replyMessage.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <strong>{replyMessage.sender_id === currentUserId ? "You" : replyMessage.sender?.display_name || replyMessage.sender?.username || "User"}</strong>
            <span>{replyMessage.deleted_at ? "Message deleted" : replyMessage.body || "Attachment"}</span>
          </button>
        )}

        <div id={`message-${message.id}`} className="message-bubble-v5 tiger-rich-bubble">
          {message.deleted_at ? <em>Message deleted</em> : <>
            {parsed.body && !parsed.botResult && <p><RichText text={parsed.body} /></p>}
            {parsed.botResult && <div className="tiger-bot-result"><strong>Tiger Bot</strong><span>{parsed.botResult.replace(/^🐯 Tiger Bot:\s?/, "")}</span></div>}
            {message.attachments.map((attachment) => {
              const type = attachment.content_type || "";
              const isBlockedVisual = type.startsWith("image/") || type.startsWith("video/");
              const isAudio = type.startsWith("audio/") && attachment.signed_url;
              return <div className="attachment-card" key={attachment.id}>
                {isBlockedVisual ? (
                  <div className="tiger-media-blocked">Visual media is disabled on Tiger Chat.</div>
                ) : isAudio ? (
                  <div className="tiger-audio-attachment">
                    <span>🎙 <strong>{attachment.file_name}</strong></span>
                    <audio controls preload="metadata" src={attachment.signed_url} />
                    <small>{formatBytes(attachment.size_bytes)}</small>
                  </div>
                ) : (
                  <a href={attachment.signed_url} download={attachment.file_name} className="file-attachment"><span className="file-icon" aria-hidden="true">↓</span><span><strong>{attachment.file_name}</strong><small>{formatBytes(attachment.size_bytes)} · Download</small></span></a>
                )}
              </div>;
            })}
          </>}
        </div>

        {!message.deleted_at && !message.local_status && <div className="message-tools">
          <button type="button" onClick={() => onReply(message)}>Reply</button>
          <button type="button" onClick={() => void copy()} disabled={!message.body}>Copy</button>
          <button type="button" onClick={() => onForward(message)}>Forward</button>
          <button type="button" className={message.saved ? "saved-active-v8" : ""} onClick={() => onSave(message)}>{message.saved ? "★ Saved" : "☆ Save"}</button>
          {mine && <button type="button" onClick={() => onEdit(message)}>Edit</button>}
          {(mine || isAdmin) && <button type="button" onClick={() => onDelete(message)}>{mine ? "Unsend" : "Admin delete"}</button>}
          {!mine && <button type="button" onClick={() => onReport(message)}>Report</button>}
          <button type="button" onClick={() => setShowEmoji((v) => !v)}>☺</button>
          {showEmoji && <span className="reaction-picker" aria-label="Reactions">{reactionChoices.map((emoji) => <button key={emoji} type="button" onClick={() => { haptic(8); onReact(message, emoji); setShowEmoji(false); }} aria-label={`React ${emoji}`}>{emoji}</button>)}</span>}
        </div>}

        {message.local_status === "failed" && <div className="failed-message-actions-v8"><span>Not sent</span>{onRetry && <button type="button" onClick={() => onRetry(message)}>Retry</button>}</div>}

        {Object.keys(reactionGroups).length > 0 && !message.deleted_at && <div className="reaction-list">{(Object.entries(reactionGroups) as Array<[string, { count: number; mine: boolean }]>).map(([emoji, info]) => <button key={emoji} type="button" className={info.mine ? "mine" : ""} onClick={() => onReact(message, emoji)}>{emoji} {info.count}</button>)}</div>}

        {mine && !message.deleted_at && <div className="read-receipt">{deliveryLabel || (otherReaders.length > 0 ? (members.length > 2 ? `Seen by ${otherReaders.length}` : "Seen") : "")}</div>}
      </div>
    </article>
  );
}
