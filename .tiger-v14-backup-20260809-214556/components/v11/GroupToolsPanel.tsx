"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Group = { conversation_id: string; title: string };
type Member = { user_id: string; role: string; username: string; display_name: string; nickname?: string | null; role_label?: string | null; role_color?: string | null };
type Poll = { id: string; question: string; multi_select: boolean; closes_at: string | null; created_at: string; creator_id: string };
type Option = { id: string; poll_id: string; label: string; position: number };
type Vote = { poll_id: string; option_id: string; user_id: string };
type EventRow = { id: string; title: string; details: string; starts_at: string; creator_id: string };
type Invite = { id: string; token: string; expires_at: string | null; max_uses: number | null; use_count: number; active: boolean };
type Pin = { message_id: string; pinned_at: string };
type RecentMessage = { id: string; body: string; created_at: string; sender_id: string };

export function GroupToolsPanel({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [description, setDescription] = useState("");
  const [emojiIcon, setEmojiIcon] = useState("💬");
  const [nickname, setNickname] = useState("");
  const [polls, setPolls] = useState<Poll[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Yes\nNo");
  const [pollMulti, setPollMulti] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDetails, setEventDetails] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [theme, setTheme] = useState("default");
  const [bubble, setBubble] = useState("inherit");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void supabase.rpc("get_my_conversations").then(({ data }) => {
      const rows = ((data ?? []) as any[]).filter((row) => row.kind === "group").map((row) => ({ conversation_id: String(row.conversation_id), title: String(row.title ?? row.name ?? "Group") }));
      setGroups(rows);
      if (!groupId && rows[0]) setGroupId(rows[0].conversation_id);
    });
  }, [userId]);

  async function loadGroup(id: string) {
    if (!id) return;
    const [detailsResult, memberResult, pollResult, eventResult, inviteResult, pinResult, messageResult, prefResult] = await Promise.all([
      supabase.from("conversations").select("description,emoji_icon").eq("id", id).maybeSingle(),
      supabase.rpc("get_conversation_members", { target_conversation: id }),
      supabase.from("chat_polls").select("id,question,multi_select,closes_at,created_at,creator_id").eq("conversation_id", id).order("created_at", { ascending: false }).limit(20),
      supabase.from("group_events").select("id,title,details,starts_at,creator_id").eq("conversation_id", id).order("starts_at", { ascending: true }).limit(20),
      supabase.from("group_invites").select("id,token,expires_at,max_uses,use_count,active").eq("conversation_id", id).order("created_at", { ascending: false }).limit(10),
      supabase.from("pinned_messages_v11").select("message_id,pinned_at").eq("conversation_id", id).order("pinned_at", { ascending: false }),
      supabase.from("messages").select("id,body,created_at,sender_id").eq("conversation_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(30),
      supabase.from("conversation_preferences").select("theme,bubble_style").eq("conversation_id", id).eq("user_id", userId).maybeSingle(),
    ]);
    setDescription(String(detailsResult.data?.description ?? ""));
    setEmojiIcon(String(detailsResult.data?.emoji_icon ?? "💬"));
    const memberRows = ((memberResult.data ?? []) as any[]).map((row) => ({ user_id: String(row.user_id), role: String(row.role || "member"), username: String(row.username || "user"), display_name: String(row.display_name || row.username || "User"), nickname: row.nickname ?? null, role_label: row.role_label ?? null, role_color: row.role_color ?? null }));
    setMembers(memberRows);
    const mine = memberRows.find((m) => m.user_id === userId);
    setIsAdmin(Boolean(mine && (mine.role === "owner" || mine.role === "admin")));
    setNickname(String(mine?.nickname || ""));
    const pollRows = (pollResult.data ?? []) as Poll[];
    setPolls(pollRows);
    const pollIds = pollRows.map((p) => p.id);
    if (pollIds.length) {
      const [optionResult, voteResult] = await Promise.all([
        supabase.from("chat_poll_options").select("id,poll_id,label,position").in("poll_id", pollIds).order("position"),
        supabase.from("chat_poll_votes").select("poll_id,option_id,user_id").in("poll_id", pollIds),
      ]);
      setOptions((optionResult.data ?? []) as Option[]); setVotes((voteResult.data ?? []) as Vote[]);
    } else { setOptions([]); setVotes([]); }
    setEvents((eventResult.data ?? []) as EventRow[]);
    setInvites((inviteResult.data ?? []) as Invite[]);
    setPins((pinResult.data ?? []) as Pin[]);
    setRecentMessages((messageResult.data ?? []) as RecentMessage[]);
    setTheme(String(prefResult.data?.theme || "default"));
    setBubble(String(prefResult.data?.bubble_style || "inherit"));
  }

  useEffect(() => { void loadGroup(groupId); }, [groupId]);

  async function saveGroup() {
    const { error } = await supabase.rpc("update_group_details", { target_conversation: groupId, new_description: description, new_emoji: emojiIcon });
    setMessage(error ? error.message : "Group details saved.");
  }
  async function saveNickname() {
    const { error } = await supabase.rpc("set_my_group_nickname", { target_conversation: groupId, new_nickname: nickname });
    setMessage(error ? error.message : "Nickname saved.");
  }
  async function saveTheme() {
    const { error } = await supabase.from("conversation_preferences").upsert({ user_id: userId, conversation_id: groupId, theme, bubble_style: bubble, updated_at: new Date().toISOString() }, { onConflict: "user_id,conversation_id" });
    setMessage(error ? error.message : "Conversation appearance saved.");
  }

  async function createPoll() {
    const labels = pollOptions.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10);
    if (!groupId || !pollQuestion.trim() || labels.length < 2) { setMessage("Polls need a question and at least two options."); return; }
    const { data, error } = await supabase.from("chat_polls").insert({ conversation_id: groupId, creator_id: userId, question: pollQuestion.trim(), multi_select: pollMulti }).select("id").single();
    if (error || !data) { setMessage(error?.message || "Could not create poll."); return; }
    const { error: optionError } = await supabase.from("chat_poll_options").insert(labels.map((label, position) => ({ poll_id: data.id, label, position })));
    setMessage(optionError ? optionError.message : "Poll created.");
    if (!optionError) { setPollQuestion(""); await loadGroup(groupId); }
  }

  async function vote(poll: Poll, optionId: string) {
    if (!poll.multi_select) await supabase.from("chat_poll_votes").delete().eq("poll_id", poll.id).eq("user_id", userId);
    const mine = votes.some((v) => v.poll_id === poll.id && v.option_id === optionId && v.user_id === userId);
    if (mine) await supabase.from("chat_poll_votes").delete().eq("poll_id", poll.id).eq("option_id", optionId).eq("user_id", userId);
    else await supabase.from("chat_poll_votes").insert({ poll_id: poll.id, option_id: optionId, user_id: userId });
    await loadGroup(groupId);
  }

  async function createEvent() {
    const when = new Date(eventAt);
    if (!eventTitle.trim() || Number.isNaN(when.getTime())) { setMessage("Add an event title and date/time."); return; }
    const { error } = await supabase.from("group_events").insert({ conversation_id: groupId, creator_id: userId, title: eventTitle.trim(), details: eventDetails.trim(), starts_at: when.toISOString() });
    setMessage(error ? error.message : "Event created.");
    if (!error) { setEventTitle(""); setEventDetails(""); setEventAt(""); await loadGroup(groupId); }
  }

  async function createInvite() {
    const { error } = await supabase.from("group_invites").insert({ conversation_id: groupId, created_by: userId, max_uses: 25 });
    setMessage(error ? error.message : "Invite created."); if (!error) await loadGroup(groupId);
  }
  async function copyInvite(token: string) { await navigator.clipboard.writeText(`${window.location.origin}/join/${token}`); setMessage("Invite link copied."); }

  async function togglePin(messageId: string) {
    const exists = pins.some((p) => p.message_id === messageId);
    if (exists) await supabase.from("pinned_messages_v11").delete().eq("conversation_id", groupId).eq("message_id", messageId);
    else await supabase.from("pinned_messages_v11").insert({ conversation_id: groupId, message_id: messageId, pinned_by: userId });
    await loadGroup(groupId);
  }

  async function saveRoleStyle(memberId: string, label: string, color: string) {
    const { error } = await supabase.rpc("set_group_role_style", { target_conversation: groupId, target_user: memberId, new_label: label, new_color: color });
    setMessage(error ? error.message : "Role style saved."); if (!error) await loadGroup(groupId);
  }

  const pinSet = useMemo(() => new Set(pins.map((p) => p.message_id)), [pins]);

  return <div className="tiger-v11-grid">
    <section className="tiger-card tiger-span-2">
      <h3>Group tools</h3>
      {groups.length === 0 ? <p>Create or join a group chat first.</p> : <label>Group<select value={groupId} onChange={(e) => setGroupId(e.target.value)}>{groups.map((g) => <option key={g.conversation_id} value={g.conversation_id}>{g.title}</option>)}</select></label>}
    </section>
    {groupId && <>
      <section className="tiger-card"><h3>Group identity</h3><label>Emoji icon<input value={emojiIcon} onChange={(e) => setEmojiIcon(e.target.value)} maxLength={16} /></label><label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} rows={4} /></label><button className="primary-button" onClick={() => void saveGroup()} disabled={!isAdmin}>Save group details</button>{!isAdmin && <small>Owner/admin only.</small>}</section>
      <section className="tiger-card"><h3>Your group identity</h3><label>Nickname<input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} /></label><button className="secondary-button" onClick={() => void saveNickname()}>Save nickname</button><label>Conversation theme<select value={theme} onChange={(e) => setTheme(e.target.value)}><option>default</option><option>tiger</option><option>night</option><option>school</option><option>mono</option><option>sunset</option></select></label><label>Bubble override<select value={bubble} onChange={(e) => setBubble(e.target.value)}><option>inherit</option><option>rounded</option><option>compact</option><option>square</option><option>soft</option></select></label><button className="secondary-button" onClick={() => void saveTheme()}>Save chat appearance</button></section>

      <section className="tiger-card tiger-span-2"><h3>Polls</h3><div className="tiger-inline-form"><input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} maxLength={180} placeholder="Poll question" /><label className="tiger-check"><input type="checkbox" checked={pollMulti} onChange={(e) => setPollMulti(e.target.checked)} /> Multiple choices</label></div><textarea rows={4} value={pollOptions} onChange={(e) => setPollOptions(e.target.value)} placeholder={'Option 1\nOption 2'} /><button className="primary-button" onClick={() => void createPoll()}>Create poll</button><div className="tiger-polls">{polls.map((poll) => <div className="tiger-poll" key={poll.id}><strong>{poll.question}</strong>{options.filter((o) => o.poll_id === poll.id).map((option) => { const count = votes.filter((v) => v.option_id === option.id).length; const mine = votes.some((v) => v.option_id === option.id && v.user_id === userId); return <button key={option.id} className={mine ? "selected" : ""} onClick={() => void vote(poll, option.id)}><span>{option.label}</span><strong>{count}</strong></button>; })}</div>)}</div></section>

      <section className="tiger-card"><h3>Group events</h3><label>Title<input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} /></label><label>Details<textarea rows={3} value={eventDetails} onChange={(e) => setEventDetails(e.target.value)} /></label><label>When<input type="datetime-local" value={eventAt} onChange={(e) => setEventAt(e.target.value)} /></label><button className="primary-button" onClick={() => void createEvent()}>Create event</button>{events.map((event) => <div className="tiger-mini-card" key={event.id}><strong>📅 {event.title}</strong><span>{new Date(event.starts_at).toLocaleString()}</span><small>{event.details}</small></div>)}</section>

      <section className="tiger-card"><h3>Invite links</h3><button className="primary-button" onClick={() => void createInvite()} disabled={!isAdmin}>Create invite</button>{invites.filter((i) => i.active).map((invite) => <div className="tiger-list-row" key={invite.id}><span><strong>{invite.token.slice(0, 8)}…</strong><small>{invite.use_count}/{invite.max_uses ?? "∞"} uses</small></span><button className="secondary-button" onClick={() => void copyInvite(invite.token)}>Copy</button></div>)}</section>

      <section className="tiger-card tiger-span-2"><h3>Pin board</h3><p className="muted-copy">Pin important text messages. Visual media is disabled.</p><div className="tiger-list">{recentMessages.map((row) => <div className="tiger-list-row" key={row.id}><span><strong>{row.body?.slice(0, 140) || "Message"}</strong><small>{new Date(row.created_at).toLocaleString()}</small></span><button className="secondary-button" disabled={!isAdmin} onClick={() => void togglePin(row.id)}>{pinSet.has(row.id) ? "Unpin" : "Pin"}</button></div>)}</div></section>

      <section className="tiger-card tiger-span-2"><h3>Roles, nicknames & colors</h3><div className="tiger-list">{members.map((member) => <RoleEditor key={member.user_id} member={member} canEdit={isAdmin} onSave={saveRoleStyle} />)}</div></section>
    </>}
    {message && <p className="tiger-notice tiger-span-2">{message}</p>}
  </div>;
}

function RoleEditor({ member, canEdit, onSave }: { member: Member; canEdit: boolean; onSave: (id: string, label: string, color: string) => Promise<void> }) {
  const [label, setLabel] = useState(member.role_label || "");
  const [color, setColor] = useState(member.role_color || "tiger");
  useEffect(() => { setLabel(member.role_label || ""); setColor(member.role_color || "tiger"); }, [member.role_label, member.role_color]);
  return <div className="tiger-list-row"><span><strong>{member.nickname || member.display_name}</strong><small>@{member.username} · {member.role}</small></span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={24} placeholder="Custom role label" disabled={!canEdit} /><select value={color} onChange={(e) => setColor(e.target.value)} disabled={!canEdit}><option>tiger</option><option>gold</option><option>blue</option><option>purple</option><option>green</option><option>mono</option></select><button className="secondary-button" onClick={() => void onSave(member.user_id, label, color)} disabled={!canEdit}>Save</button></div>;
}
