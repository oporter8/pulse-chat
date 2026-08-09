"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Conv = { conversation_id: string; title: string; kind: "dm" | "group"; favorite?: boolean };
type Folder = { id: string; name: string; emoji: string; position: number };
type FolderMember = { folder_id: string; conversation_id: string };
type Scheduled = { id: string; conversation_id: string; body: string; send_at: string; status: string };
type Collection = { id: string; name: string; emoji: string };
type Saved = { message_id: string; created_at: string; message?: { body?: string; conversation_id?: string; created_at?: string } | null };

function normalize(row: any): Conv {
  return {
    conversation_id: String(row.conversation_id),
    title: String(row.title ?? row.name ?? row.username ?? "Conversation"),
    kind: row.kind === "group" ? "group" : "dm",
  };
}

export function OrganizerPanel({ userId }: { userId: string }) {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderMembers, setFolderMembers] = useState<FolderMember[]>([]);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [scheduleConversation, setScheduleConversation] = useState("");
  const [scheduleBody, setScheduleBody] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [convResult, folderResult, memberResult, scheduleResult, collectionResult, savedResult] = await Promise.all([
      supabase.rpc("get_my_conversations"),
      supabase.from("conversation_folders").select("id,name,emoji,position").eq("user_id", userId).order("position"),
      supabase.from("conversation_folder_members").select("folder_id,conversation_id").eq("user_id", userId),
      supabase.from("scheduled_messages").select("id,conversation_id,body,send_at,status").eq("user_id", userId).order("send_at", { ascending: true }).limit(50),
      supabase.from("saved_message_collections").select("id,name,emoji").eq("user_id", userId).order("created_at"),
      supabase.from("saved_messages").select("message_id,created_at,message:messages(body,conversation_id,created_at)").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);
    const convs = ((convResult.data ?? []) as any[]).map(normalize);
    const { data: memberPrefs } = await supabase.from("conversation_members").select("conversation_id,favorite").eq("user_id", userId);
    const fav = new Map((memberPrefs ?? []).map((r: any) => [String(r.conversation_id), Boolean(r.favorite)]));
    setConversations(convs.map((c) => ({ ...c, favorite: fav.get(c.conversation_id) || false })));
    setFolders((folderResult.data ?? []) as Folder[]);
    setFolderMembers((memberResult.data ?? []) as FolderMember[]);
    setScheduled((scheduleResult.data ?? []) as Scheduled[]);
    setCollections((collectionResult.data ?? []) as Collection[]);
    setSaved((savedResult.data ?? []) as unknown as Saved[]);
    if (!scheduleConversation && convs[0]) setScheduleConversation(convs[0].conversation_id);
  }

  useEffect(() => { void load(); }, [userId]);

  const folderByConversation = useMemo(() => new Map(folderMembers.map((m) => [m.conversation_id, m.folder_id])), [folderMembers]);

  async function createFolder() {
    if (!newFolder.trim()) return;
    const { error } = await supabase.from("conversation_folders").insert({ user_id: userId, name: newFolder.trim(), emoji: "📁", position: folders.length });
    if (error) setMessage(error.message); else { setNewFolder(""); setMessage("Folder created."); await load(); }
  }

  async function assignFolder(conversationId: string, folderId: string) {
    await supabase.from("conversation_folder_members").delete().eq("user_id", userId).eq("conversation_id", conversationId);
    if (folderId) {
      const { error } = await supabase.from("conversation_folder_members").insert({ user_id: userId, conversation_id: conversationId, folder_id: folderId });
      if (error) { setMessage(error.message); return; }
    }
    await load();
  }

  async function favorite(conversationId: string, next: boolean) {
    const { error } = await supabase.rpc("set_conversation_favorite_v11", { target_conversation: conversationId, enabled: next });
    if (error) setMessage(error.message); else await load();
  }

  async function schedule() {
    if (!scheduleConversation || !scheduleBody.trim() || !scheduleAt) return;
    const when = new Date(scheduleAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) { setMessage("Choose a future date/time."); return; }
    const { error } = await supabase.from("scheduled_messages").insert({ user_id: userId, conversation_id: scheduleConversation, body: scheduleBody.trim(), send_at: when.toISOString() });
    if (error) setMessage(error.message); else { setScheduleBody(""); setScheduleAt(""); setMessage("Scheduled. It will send when Tiger Chat is open at/after that time."); await load(); }
  }

  async function cancelScheduled(id: string) {
    await supabase.from("scheduled_messages").update({ status: "cancelled" }).eq("id", id).eq("user_id", userId);
    await load();
  }

  async function createCollection() {
    if (!newCollection.trim()) return;
    const { error } = await supabase.from("saved_message_collections").insert({ user_id: userId, name: newCollection.trim(), emoji: "⭐" });
    if (error) setMessage(error.message); else { setNewCollection(""); await load(); }
  }

  async function addSavedToCollection(messageId: string, collectionId: string) {
    if (!collectionId) return;
    const { error } = await supabase.from("saved_message_collection_items").upsert({ user_id: userId, collection_id: collectionId, message_id: messageId }, { onConflict: "collection_id,message_id" });
    setMessage(error ? error.message : "Saved message added to collection.");
  }

  return <div className="tiger-v11-grid">
    <section className="tiger-card tiger-span-2">
      <h3>Conversation folders + favorites</h3>
      <div className="tiger-inline-form"><input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} maxLength={32} placeholder="New folder name" /><button className="primary-button" onClick={() => void createFolder()}>Create folder</button></div>
      <div className="tiger-list">{conversations.map((conversation) => <div className="tiger-list-row" key={conversation.conversation_id}>
        <span><strong>{conversation.kind === "group" ? "👥" : "💬"} {conversation.title}</strong><small>{conversation.kind}</small></span>
        <select value={folderByConversation.get(conversation.conversation_id) || ""} onChange={(e) => void assignFolder(conversation.conversation_id, e.target.value)}><option value="">No folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.emoji} {folder.name}</option>)}</select>
        <button className="secondary-button" onClick={() => void favorite(conversation.conversation_id, !conversation.favorite)}>{conversation.favorite ? "★ Favorite" : "☆ Favorite"}</button>
      </div>)}</div>
    </section>

    <section className="tiger-card">
      <h3>Schedule a text message</h3>
      <label>Conversation<select value={scheduleConversation} onChange={(e) => setScheduleConversation(e.target.value)}>{conversations.map((c) => <option key={c.conversation_id} value={c.conversation_id}>{c.title}</option>)}</select></label>
      <label>Message<textarea rows={4} maxLength={2000} value={scheduleBody} onChange={(e) => setScheduleBody(e.target.value)} /></label>
      <label>Send at<input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} /></label>
      <button className="primary-button" onClick={() => void schedule()}>Schedule</button>
      <small>No paid scheduler: Tiger Chat sends due messages while the app is open.</small>
    </section>

    <section className="tiger-card">
      <h3>Scheduled queue</h3>
      {scheduled.length === 0 ? <p>No scheduled messages.</p> : <div className="tiger-list">{scheduled.map((item) => <div className="tiger-list-row vertical" key={item.id}><strong>{conversations.find((c) => c.conversation_id === item.conversation_id)?.title || "Conversation"}</strong><span>{item.body}</span><small>{new Date(item.send_at).toLocaleString()} · {item.status}</small>{item.status === "pending" && <button className="secondary-button" onClick={() => void cancelScheduled(item.id)}>Cancel</button>}</div>)}</div>}
    </section>

    <section className="tiger-card tiger-span-2">
      <h3>Saved-message collections</h3>
      <div className="tiger-inline-form"><input value={newCollection} onChange={(e) => setNewCollection(e.target.value)} maxLength={40} placeholder="Collection name" /><button className="primary-button" onClick={() => void createCollection()}>Create collection</button></div>
      {saved.length === 0 ? <p className="muted-copy">Use ☆ Save on messages first.</p> : <div className="tiger-list">{saved.map((item) => <div className="tiger-list-row" key={item.message_id}><span><strong>{item.message?.body?.slice(0, 100) || "Saved message"}</strong><small>{item.message?.created_at ? new Date(item.message.created_at).toLocaleString() : ""}</small></span><select defaultValue="" onChange={(e) => void addSavedToCollection(item.message_id, e.target.value)}><option value="">Add to collection…</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.emoji} {collection.name}</option>)}</select></div>)}</div>}
    </section>
    {message && <p className="tiger-notice tiger-span-2">{message}</p>}
  </div>;
}
