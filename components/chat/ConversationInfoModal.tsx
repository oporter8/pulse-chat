"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Conversation, ConversationMember, Profile } from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";

type ConversationInfoModalProps = {
  open: boolean;
  conversation: Conversation;
  members: ConversationMember[];
  currentUserId: string;
  blocked: boolean;
  muted: boolean;
  onClose: () => void;
  onToggleBlock: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onReportUser: () => void;
  onUpdateGroup: (name: string, avatarFile: File | null) => Promise<void>;
  onAddMember: (userId: string) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
};

export function ConversationInfoModal({
  open,
  conversation,
  members,
  currentUserId,
  blocked,
  muted,
  onClose,
  onToggleBlock,
  onToggleMute,
  onReportUser,
  onUpdateGroup,
  onAddMember,
  onRemoveMember,
}: ConversationInfoModalProps) {
  const [name, setName] = useState(conversation.title);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const myMembership = useMemo(
    () => members.find((member) => member.user_id === currentUserId) ?? null,
    [currentUserId, members],
  );
  const canManage = myMembership?.role === "owner" || myMembership?.role === "admin";

  useEffect(() => {
    if (!open) return;
    setName(conversation.title);
    setAvatarFile(null);
    setQuery("");
    setResults([]);
    setMessage("");
  }, [conversation.title, open]);

  useEffect(() => {
    if (!open || conversation.kind !== "group" || !canManage) return;
    const clean = query.trim();
    if (clean.length < 2) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_path, created_at")
        .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
        .limit(10);
      const memberIds = new Set(members.map((member) => member.user_id));
      setResults(((data ?? []) as Profile[]).filter((profile) => !memberIds.has(profile.id)));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [canManage, conversation.kind, members, open, query]);

  if (!open) return null;

  async function saveGroup(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onUpdateGroup(name.trim(), avatarFile);
      setAvatarFile(null);
      setMessage("Group updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the group.");
    } finally {
      setSaving(false);
    }
  }

  function chooseGroupAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setMessage("Group pictures must be an image no larger than 2 MB.");
      return;
    }
    setAvatarFile(file);
  }

  async function toggleMute() {
    setMessage("");
    try {
      await onToggleMute();
      setMessage(muted ? "Conversation notifications turned on." : "Conversation muted until you turn notifications back on.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change notification settings.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="conversation-info-title">
        <div className="modal-heading">
          <div>
            <h2 id="conversation-info-title">Conversation details</h2>
            <p>{conversation.kind === "group" ? `${members.length} members` : "Direct message"}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="conversation-notification-row">
          <span>
            <strong>Notifications</strong>
            <small>{muted ? "Muted for this conversation" : "On for this conversation"}</small>
          </span>
          <button type="button" className="secondary-button" onClick={() => void toggleMute()}>
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>

        {conversation.kind === "dm" ? (
          <div className="conversation-info-dm">
            <div className="identity-card">
              <Avatar name={conversation.title} path={conversation.avatar_path} size="large" />
              <div>
                <h3>{conversation.title}</h3>
                <p>{blocked ? "Blocked" : "You can message this person."}</p>
              </div>
            </div>
            <div className="modal-actions left-actions">
              <button type="button" className="secondary-button" onClick={onReportUser}>Report user</button>
              <button type="button" className="danger-button secondary-danger" onClick={() => void onToggleBlock()}>
                {blocked ? "Unblock user" : "Block user"}
              </button>
            </div>
          </div>
        ) : (
          <div className="group-info-layout">
            {canManage && (
              <form className="stack-form" onSubmit={saveGroup}>
                <h3>Group settings</h3>
                <label>
                  Group name
                  <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
                </label>
                <label className="file-button inline-file-button">
                  Choose group picture
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseGroupAvatar} />
                </label>
                {avatarFile && <small>{avatarFile.name}</small>}
                <button type="submit" className="primary-button fit-button" disabled={saving || !name.trim()}>
                  {saving ? "Saving…" : "Save group"}
                </button>
              </form>
            )}

            <div className="member-panel">
              <h3>Members</h3>
              <div className="member-list">
                {members.map((member) => (
                  <div className="member-row" key={member.user_id}>
                    <Avatar name={member.profile.display_name || member.profile.username} path={member.profile.avatar_path} size="small" />
                    <span className="grow-copy">
                      <strong>{member.profile.display_name}</strong>
                      <small>@{member.profile.username} · {member.role}</small>
                    </span>
                    {canManage && member.user_id !== currentUserId && member.role !== "owner" && (
                      <button type="button" className="text-button danger-text" onClick={() => void onRemoveMember(member.user_id)}>Remove</button>
                    )}
                  </div>
                ))}
              </div>

              {canManage && (
                <div className="add-member-box">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add someone…" />
                  {results.length > 0 && (
                    <div className="people-results embedded-results">
                      {results.map((profile) => (
                        <button key={profile.id} type="button" onClick={async () => {
                          await onAddMember(profile.id);
                          setQuery("");
                          setResults([]);
                        }}>
                          <Avatar name={profile.display_name || profile.username} path={profile.avatar_path} size="small" />
                          <span><strong>{profile.display_name}</strong><small>@{profile.username}</small></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button type="button" className="danger-button secondary-danger fit-button" onClick={() => void onRemoveMember(currentUserId)}>
                Leave group
              </button>
            </div>
          </div>
        )}

        {message && <p className="inline-status conversation-info-status" aria-live="polite">{message}</p>}
      </section>
    </div>
  );
}
