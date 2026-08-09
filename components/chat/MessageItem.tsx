"use client";

import type { ConversationMember, Message } from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";
import { formatBytes, formatTime } from "@/lib/chat-utils";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮"];

type MessageItemProps = {
  message: Message;
  currentUserId: string;
  replyMessage?: Message;
  members: ConversationMember[];
  highlighted?: boolean;
  isAdmin?: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReact: (message: Message, emoji: string) => void;
  onReport: (message: Message) => void;
};

export function MessageItem({
  message,
  currentUserId,
  replyMessage,
  members,
  highlighted = false,
  isAdmin = false,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onReport,
}: MessageItemProps) {
  const mine = message.sender_id === currentUserId;
  const senderName = message.sender?.display_name || message.sender?.username || "User";
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

  return (
    <article className={`message-row-v5 ${mine ? "mine" : ""} ${message.deleted_at ? "deleted" : ""} ${highlighted ? "search-highlight-v6" : ""}`}>
      {!mine && (
        <Avatar name={senderName} path={message.sender?.avatar_path} size="small" />
      )}

      <div className="message-content-v5">
        <div className="message-meta-v5">
          <strong>{mine ? "You" : senderName}</strong>
          {message.sender?.admin_tag && <span className="admin-badge-v7">{message.sender.admin_tag}</span>}
          <time>{formatTime(message.created_at)}</time>
          {message.edited_at && !message.deleted_at && <span>edited</span>}
        </div>

        {replyMessage && !message.deleted_at && (
          <button type="button" className="reply-preview" onClick={() => document.getElementById(`message-${replyMessage.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <strong>{replyMessage.sender_id === currentUserId ? "You" : replyMessage.sender?.display_name || replyMessage.sender?.username || "User"}</strong>
            <span>{replyMessage.deleted_at ? "Message deleted" : replyMessage.body || "Attachment"}</span>
          </button>
        )}

        <div id={`message-${message.id}`} className="message-bubble-v5">
          {message.deleted_at ? (
            <em>Message deleted</em>
          ) : (
            <>
              {message.body && <p>{message.body}</p>}
              {message.attachments.map((attachment) => {
                const isImage = attachment.content_type?.startsWith("image/") && attachment.signed_url;
                return (
                  <div className="attachment-card" key={attachment.id}>
                    {isImage ? (
                      <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="image-attachment">
                        <img src={attachment.signed_url} alt={attachment.file_name} loading="lazy" />
                      </a>
                    ) : (
                      <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="file-attachment">
                        <span className="file-icon" aria-hidden="true">↗</span>
                        <span><strong>{attachment.file_name}</strong><small>{formatBytes(attachment.size_bytes)}</small></span>
                      </a>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {!message.deleted_at && (
          <div className="message-tools">
            <button type="button" onClick={() => onReply(message)}>Reply</button>
            {mine && <button type="button" onClick={() => onEdit(message)}>Edit</button>}
            {(mine || isAdmin) && <button type="button" onClick={() => onDelete(message)}>{mine ? "Delete" : "Admin delete"}</button>}
            {!mine && <button type="button" onClick={() => onReport(message)}>Report</button>}
            <span className="reaction-picker" aria-label="Quick reactions">
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => onReact(message, emoji)} aria-label={`React ${emoji}`}>{emoji}</button>
              ))}
            </span>
          </div>
        )}

        {Object.keys(reactionGroups).length > 0 && !message.deleted_at && (
          <div className="reaction-list">
            {Object.entries(reactionGroups).map(([emoji, info]) => (
              <button key={emoji} type="button" className={info.mine ? "mine" : ""} onClick={() => onReact(message, emoji)}>
                {emoji} {info.count}
              </button>
            ))}
          </div>
        )}

        {mine && otherReaders.length > 0 && (
          <div className="read-receipt">
            {members.length > 2 ? `Seen by ${otherReaders.length}` : "Seen"}
          </div>
        )}
      </div>
    </article>
  );
}
