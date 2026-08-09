"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  onSetMute: (mode: "off" | "1h" | "8h" | "forever") => Promise<void>;
  onReportUser: () => void;
  onUpdateGroup: (name: string, avatarFile: File | null) => Promise<void>;
  onAddMember: (userId: string) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onPin: () => Promise<void>;
  onArchive: () => Promise<void>;
  onClear: () => Promise<void>;
  onDeleteForMe: () => Promise<void>;
  onOpenSharedMedia: () => void;
  onSearchChat: () => void;
  onViewProfile?: (profile: Profile) => void;
};

export function ConversationInfoModal({ open, conversation, members, currentUserId, blocked, muted, onClose, onToggleBlock, onSetMute, onReportUser, onUpdateGroup, onAddMember, onRemoveMember, onPin, onArchive, onClear, onDeleteForMe, onOpenSharedMedia, onSearchChat, onViewProfile }: ConversationInfoModalProps) {
  const [name, setName] = useState(conversation.title);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [muteMode, setMuteMode] = useState<"off" | "1h" | "8h" | "forever">(muted ? "forever" : "off");

  const myMembership = useMemo(() => members.find((member) => member.user_id === currentUserId) ?? null, [currentUserId, members]);
  const canManage = myMembership?.role === "owner" || myMembership?.role === "admin";
  const otherProfile = conversation.kind === "dm" ? members.find((m) => m.user_id !== currentUserId)?.profile ?? null : null;

  useEffect(() => {
    if (!open) return;
    setName(conversation.title); setQuery(""); setResults([]); setMessage(""); setMuteMode(muted ? "forever" : "off");
  }, [conversation.title, muted, open]);

  useEffect(() => {
    if (!open || conversation.kind !== "group" || !canManage) return;
    const clean = query.trim();
    if (clean.length < 2) { setResults([]); return; }
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id,username,display_name,bio,avatar_path,admin_tag,status_text,last_active_at,created_at").or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`).limit(10);
      const memberIds = new Set(members.map((member) => member.user_id));
      setResults(((data ?? []) as Profile[]).filter((profile) => !memberIds.has(profile.id)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [canManage, conversation.kind, members, open, query]);

  if (!open) return null;

  async function saveGroup(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try { await onUpdateGroup(name.trim(), null); setMessage("Group updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update the group."); }
    finally { setSaving(false); }
  }

  async function changeMute() {
    setMessage("");
    try { await onSetMute(muteMode); setMessage(muteMode === "off" ? "Notifications are on." : `Muted ${muteMode === "forever" ? "until you unmute" : `for ${muteMode}`}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not change notification settings."); }
  }

  async function clearHistory() { if (!window.confirm("Clear this conversation history for you? This does not delete messages for other people.")) return; await onClear(); onClose(); }
  async function deleteForMe() { if (!window.confirm("Delete this conversation from your list? It can reappear if a new message arrives.")) return; await onDeleteForMe(); onClose(); }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <section className="modal-card conversation-info-v8" role="dialog" aria-modal="true" aria-labelledby="conversation-info-title">
      <div className="modal-heading"><div><h2 id="conversation-info-title">Conversation details</h2><p>{conversation.kind === "group" ? `${members.length} members` : "Direct message"}</p></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>

      <div className="conversation-quick-grid-v8">
        <button type="button" onClick={onSearchChat}><span>⌕</span><strong>Search</strong></button>
        <button type="button" onClick={onOpenSharedMedia}><span>≡</span><strong>Files</strong></button>
        <button type="button" onClick={() => void onPin()}><span>⌖</span><strong>{conversation.pinned_at ? "Unpin" : "Pin"}</strong></button>
        <button type="button" onClick={() => void onArchive()}><span>□</span><strong>{conversation.archived_at ? "Unarchive" : "Archive"}</strong></button>
      </div>

      <div className="conversation-notification-row"><span><strong>Notifications</strong><small>{muted ? "Muted" : "On"}</small></span><div className="inline-button-row-v8"><select value={muteMode} onChange={(e) => setMuteMode(e.target.value as typeof muteMode)}><option value="off">On</option><option value="1h">Mute 1 hour</option><option value="8h">Mute 8 hours</option><option value="forever">Mute until I turn it on</option></select><button type="button" className="secondary-button" onClick={() => void changeMute()}>Apply</button></div></div>

      {conversation.kind === "dm" ? <div className="conversation-info-dm">
        <button type="button" className="identity-card identity-card-button-v8" onClick={() => otherProfile && onViewProfile?.(otherProfile)}><Avatar name={conversation.title} path={null} size="large"/><div><h3>{conversation.title}</h3><p>{otherProfile?.status_text || (blocked ? "Blocked" : "View profile")}</p></div></button>
        <div className="modal-actions left-actions"><button type="button" className="secondary-button" onClick={onReportUser}>Report user</button><button type="button" className="danger-button secondary-danger" onClick={() => void onToggleBlock()}>{blocked ? "Unblock user" : "Block user"}</button></div>
      </div> : <div className="group-info-layout">
        {canManage && <form className="stack-form" onSubmit={saveGroup}><h3>Group settings</h3><label>Group name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60}/></label><p className="muted-copy">Group pictures are disabled. Use the Community Center to set an emoji icon, description, role labels, polls, and events.</p><button type="submit" className="primary-button fit-button" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save group"}</button></form>}
        <div className="member-panel"><h3>Members</h3><div className="member-list">{members.map((member) => <div className="member-row" key={member.user_id}><button type="button" className="avatar-button-v8" onClick={() => onViewProfile?.(member.profile)}><Avatar name={member.profile.display_name || member.profile.username} path={null} size="small"/></button><span className="grow-copy"><span className="admin-name-line-v7"><strong>{member.profile.display_name}</strong>{member.profile.admin_tag && <span className="admin-badge-v7">{member.profile.admin_tag}</span>}</span><small>@{member.profile.username} · {member.role}</small></span>{canManage && member.user_id !== currentUserId && member.role !== "owner" && <button type="button" className="text-button danger-text" onClick={() => void onRemoveMember(member.user_id)}>Remove</button>}</div>)}</div>
        {canManage && <div className="add-member-box"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add someone…"/>{results.length > 0 && <div className="people-results embedded-results">{results.map((profile) => <button key={profile.id} type="button" onClick={async () => { await onAddMember(profile.id); setQuery(""); setResults([]); }}><Avatar name={profile.display_name || profile.username} path={null} size="small"/><span><span className="admin-name-line-v7"><strong>{profile.display_name}</strong>{profile.admin_tag && <span className="admin-badge-v7">{profile.admin_tag}</span>}</span><small>@{profile.username}</small></span></button>)}</div>}</div>}
        <button type="button" className="danger-button secondary-danger fit-button" onClick={() => void onRemoveMember(currentUserId)}>Leave group</button></div>
      </div>}

      <div className="conversation-danger-v8"><button type="button" className="secondary-button" onClick={() => void clearHistory()}>Clear chat history</button><button type="button" className="danger-button secondary-danger" onClick={() => void deleteForMe()}>Delete conversation for me</button></div>
      {message && <p className="inline-status conversation-info-status" aria-live="polite">{message}</p>}
    </section>
  </div>;
}
