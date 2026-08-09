"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  Attachment,
  Conversation,
  ConversationMember,
  Message,
  Profile,
  Reaction,
  Report,
  Theme,
} from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";
import { ConversationInfoModal } from "@/components/chat/ConversationInfoModal";
import { MessageItem } from "@/components/chat/MessageItem";
import { NewGroupModal } from "@/components/chat/NewGroupModal";
import { ReportModal } from "@/components/chat/ReportModal";
import { SettingsModal } from "@/components/chat/SettingsModal";
import { formatTime, safeFileName } from "@/lib/chat-utils";

const PAGE_SIZE = 50;
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

type ReportTarget = {
  label: string;
  userId: string | null;
  messageId: string | null;
} | null;

function normalizeConversation(row: Record<string, unknown>): Conversation {
  return {
    conversation_id: String(row.conversation_id),
    kind: row.kind === "group" ? "group" : "dm",
    title: String(row.title ?? "Conversation"),
    avatar_path: typeof row.avatar_path === "string" ? row.avatar_path : null,
    other_user_id: typeof row.other_user_id === "string" ? row.other_user_id : null,
    last_message: typeof row.last_message === "string" ? row.last_message : null,
    last_message_at: typeof row.last_message_at === "string" ? row.last_message_at : null,
    unread_count: Number(row.unread_count ?? 0),
    member_count: Number(row.member_count ?? 0),
  };
}

export default function ChatPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [blockedProfiles, setBlockedProfiles] = useState<Profile[]>([]);
  const [theme, setTheme] = useState<Theme>("system");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const activeChannelReadyRef = useRef(false);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.conversation_id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  const activeBlocked = Boolean(
    activeConversation?.kind === "dm" &&
      activeConversation.other_user_id &&
      blockedUserIds.has(activeConversation.other_user_id),
  );

  const typingNames = useMemo(() => {
    return members
      .filter((member) => typingUserIds.has(member.user_id) && member.user_id !== user?.id)
      .map((member) => member.profile.display_name || member.profile.username);
  }, [members, typingUserIds, user?.id]);

  const loadConversations = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("get_my_conversations");
    if (loadError) throw loadError;

    const next = ((data ?? []) as Record<string, unknown>[]).map(normalizeConversation);
    setConversations(next);

    setActiveConversationId((current) => {
      if (current && next.some((conversation) => conversation.conversation_id === current)) return current;
      return next[0]?.conversation_id ?? null;
    });
  }, []);

  const loadBlockedUsers = useCallback(async (currentUserId: string) => {
    const { data: blockRows, error: blockError } = await supabase
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", currentUserId);
    if (blockError) throw blockError;

    const ids = (blockRows ?? []).map((row) => String(row.blocked_id));
    setBlockedUserIds(new Set(ids));

    if (ids.length === 0) {
      setBlockedProfiles([]);
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_path, created_at")
      .in("id", ids);
    if (profileError) throw profileError;
    setBlockedProfiles((profiles ?? []) as Profile[]);
  }, []);

  const loadAdminState = useCallback(async () => {
    const { data, error: adminError } = await supabase.rpc("is_app_admin");
    if (adminError) {
      setIsAdmin(false);
      return;
    }
    const admin = Boolean(data);
    setIsAdmin(admin);

    if (admin) {
      const { data: reportRows, error: reportError } = await supabase
        .from("reports")
        .select("id, reporter_id, reported_user_id, message_id, reason, details, status, created_at, reviewed_at, reviewed_by")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!reportError) setReports((reportRows ?? []) as Report[]);
    }
  }, []);

  const loadMembers = useCallback(async (conversationId: string) => {
    const { data, error: memberError } = await supabase
      .from("conversation_members")
      .select(`
        conversation_id,
        user_id,
        role,
        joined_at,
        last_read_at,
        profile:profiles!conversation_members_user_id_fkey(
          id, username, display_name, bio, avatar_path, created_at
        )
      `)
      .eq("conversation_id", conversationId)
      .order("joined_at", { ascending: true });

    if (memberError) throw memberError;

    const normalized: ConversationMember[] = (data ?? []).map((row: any) => ({
      conversation_id: String(row.conversation_id),
      user_id: String(row.user_id),
      role: row.role === "owner" || row.role === "admin" ? row.role : "member",
      joined_at: String(row.joined_at),
      last_read_at: String(row.last_read_at),
      profile: row.profile as Profile,
    }));
    setMembers(normalized);
  }, []);

  const hydrateMessages = useCallback(async (rawMessages: any[]): Promise<Message[]> => {
    if (rawMessages.length === 0) return [];

    const messageIds = rawMessages.map((message) => String(message.id));
    const senderIds = Array.from(new Set(rawMessages.map((message) => String(message.sender_id))));

    const [profileResult, attachmentResult, reactionResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_path, created_at")
        .in("id", senderIds),
      supabase
        .from("message_attachments")
        .select("id, message_id, uploader_id, storage_path, file_name, content_type, size_bytes, created_at")
        .in("message_id", messageIds),
      supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji, created_at")
        .in("message_id", messageIds),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (attachmentResult.error) throw attachmentResult.error;
    if (reactionResult.error) throw reactionResult.error;

    const profiles = new Map(((profileResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]));
    const attachments = (attachmentResult.data ?? []) as Attachment[];
    const reactions = (reactionResult.data ?? []) as Reaction[];

    const paths = attachments.map((attachment) => attachment.storage_path);
    const signedByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signedRows } = await supabase.storage.from("attachments").createSignedUrls(paths, 60 * 60);
      for (const signed of signedRows ?? []) {
        if (signed.path && signed.signedUrl) signedByPath.set(signed.path, signed.signedUrl);
      }
    }

    return rawMessages.map((row) => ({
      id: String(row.id),
      conversation_id: String(row.conversation_id),
      sender_id: String(row.sender_id),
      body: String(row.body ?? ""),
      created_at: String(row.created_at),
      edited_at: typeof row.edited_at === "string" ? row.edited_at : null,
      deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
      reply_to: typeof row.reply_to === "string" ? row.reply_to : null,
      sender: profiles.get(String(row.sender_id)),
      attachments: attachments
        .filter((attachment) => attachment.message_id === String(row.id))
        .map((attachment) => ({ ...attachment, signed_url: signedByPath.get(attachment.storage_path) })),
      reactions: reactions.filter((reaction) => reaction.message_id === String(row.id)),
    }));
  }, []);

  const loadMessages = useCallback(async (conversationId: string, options?: { olderThan?: string }) => {
    const olderThan = options?.olderThan;
    let query = supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (olderThan) query = query.lt("created_at", olderThan);

    const { data, error: messagesError } = await query;
    if (messagesError) throw messagesError;

    const hydrated = await hydrateMessages(data ?? []);
    hydrated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setHasOlderMessages((data ?? []).length === PAGE_SIZE);

    if (olderThan) {
      setMessages((current) => {
        const byId = new Map<string, Message>();
        [...hydrated, ...current].forEach((message) => byId.set(message.id, message));
        return Array.from(byId.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      });
    } else {
      setMessages(hydrated);
    }
  }, [hydrateMessages]);

  const markRead = useCallback(async (conversationId: string, currentUserId: string) => {
    const now = new Date().toISOString();
    const { error: readError } = await supabase
      .from("conversation_members")
      .update({ last_read_at: now })
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUserId);

    if (!readError) {
      setMembers((current) => current.map((member) =>
        member.user_id === currentUserId ? { ...member, last_read_at: now } : member,
      ));
      setConversations((current) => current.map((conversation) =>
        conversation.conversation_id === conversationId ? { ...conversation, unread_count: 0 } : conversation,
      ));
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("pulse-theme");
    if (stored === "system" || stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("pulse-theme", theme);
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;
        if (sessionError || !data.session) {
          router.replace("/");
          return;
        }

        const currentUser = data.session.user;
        setUser(currentUser);
        await supabase.realtime.setAuth(data.session.access_token);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, display_name, bio, avatar_path, created_at")
          .eq("id", currentUser.id)
          .single();
        if (profileError) throw profileError;
        if (!mounted) return;

        setMe(profile as Profile);
        await Promise.all([
          loadConversations(),
          loadBlockedUsers(currentUser.id),
          loadAdminState(),
        ]);
      } catch (bootError) {
        setError(bootError instanceof Error ? bootError.message : "Could not load Pulse Chat.");
      }
    }

    void boot();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.replace("/");
        return;
      }
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadAdminState, loadBlockedUsers, loadConversations, router]);

  useEffect(() => {
    if (!user || !me) return;
    const currentUser = user;
    const currentMe = me;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function connectPresence() {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session?.access_token) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase.channel("pulse:presence", {
        config: { private: true, presence: { key: currentUser.id } },
      });

      const sync = () => {
        if (!channel) return;
        setOnlineUserIds(new Set(Object.keys(channel.presenceState())));
      };

      channel
        .on("presence", { event: "sync" }, sync)
        .on("presence", { event: "join" }, sync)
        .on("presence", { event: "leave" }, sync)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            await channel.track({
              user_id: currentUser.id,
              username: currentMe.username,
              display_name: currentMe.display_name,
              online_at: new Date().toISOString(),
            });
          }
        });

      presenceChannelRef.current = channel;
    }

    void connectPresence();

    return () => {
      cancelled = true;
      if (channel) {
        void channel.untrack();
        void supabase.removeChannel(channel);
      }
      if (presenceChannelRef.current === channel) presenceChannelRef.current = null;
    };
  }, [me, user]);

  useEffect(() => {
    if (!activeConversationId || !user) {
      setMessages([]);
      setMembers([]);
      setTypingUserIds(new Set());
      return;
    }

    const conversationId = activeConversationId;
    const currentUser = user;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    activeChannelReadyRef.current = false;
    setReplyTo(null);
    setSelectedFile(null);

    async function refreshConversation() {
      try {
        await Promise.all([
          loadMessages(conversationId),
          loadMembers(conversationId),
        ]);
        await markRead(conversationId, currentUser.id);
      } catch (refreshError) {
        if (!cancelled) setError(refreshError instanceof Error ? refreshError.message : "Could not load the conversation.");
      }
    }

    async function connect() {
      await refreshConversation();
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session?.access_token) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`conversation:${conversationId}`, { config: { private: true } })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const senderId = typeof payload.user_id === "string" ? payload.user_id : "";
          if (!senderId || senderId === currentUser.id) return;
          setTypingUserIds((current) => {
            const next = new Set(current);
            if (payload.is_typing) next.add(senderId);
            else next.delete(senderId);
            return next;
          });
        })
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        }, () => {
          void loadMessages(conversationId).then(() => markRead(conversationId, currentUser.id));
          void loadConversations();
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        }, () => {
          void loadMessages(conversationId);
          void loadConversations();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
          void loadMessages(conversationId);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "message_attachments" }, () => {
          void loadMessages(conversationId);
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        }, () => {
          void loadMembers(conversationId);
        })
        .subscribe((status, channelError) => {
          if (status === "SUBSCRIBED") activeChannelReadyRef.current = true;
          if (status === "CLOSED") activeChannelReadyRef.current = false;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            activeChannelReadyRef.current = false;
            console.error("Conversation channel error:", channelError);
          }
        });

      activeChannelRef.current = channel;
    }

    void connect();

    return () => {
      cancelled = true;
      activeChannelReadyRef.current = false;
      setTypingUserIds(new Set());
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (channel) void supabase.removeChannel(channel);
      if (activeChannelRef.current === channel) activeChannelRef.current = null;
    };
  }, [activeConversationId, loadConversations, loadMembers, loadMessages, markRead, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingNames.length]);

  useEffect(() => {
    const clean = search.trim();
    if (clean.length < 2 || !user) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const currentUser = user;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const { data, error: searchError } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_path, created_at")
        .ilike("username", `%${clean}%`)
        .neq("id", currentUser.id)
        .limit(10);

      if (searchError) setError(searchError.message);
      setSearchResults(((data ?? []) as Profile[]).filter((profile) => !blockedUserIds.has(profile.id)));
      setSearching(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [blockedUserIds, search, user]);

  function sendTypingState(isTyping: boolean) {
    if (!activeChannelRef.current || !activeChannelReadyRef.current || !user) return;
    void activeChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user.id, is_typing: isTyping },
    });
  }

  function updateDraft(value: string) {
    setDraft(value);
    const hasText = value.trim().length > 0;

    if (hasText && !typingSentRef.current) {
      typingSentRef.current = true;
      sendTypingState(true);
    }
    if (!hasText && typingSentRef.current) {
      typingSentRef.current = false;
      sendTypingState(false);
    }

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (hasText) {
      typingTimerRef.current = window.setTimeout(() => {
        typingSentRef.current = false;
        sendTypingState(false);
      }, 1200);
    }
  }

  async function startDm(profile: Profile) {
    try {
      setError("");
      const { data, error: dmError } = await supabase.rpc("start_dm", { other_user: profile.id });
      if (dmError) throw dmError;
      setSearch("");
      setSearchResults([]);
      await loadConversations();
      setActiveConversationId(String(data));
      setMobileChatOpen(true);
    } catch (dmError) {
      setError(dmError instanceof Error ? dmError.message : "Could not start the conversation.");
    }
  }

  async function createGroup(name: string, memberIds: string[]) {
    const { data, error: groupError } = await supabase.rpc("create_group", {
      group_name: name,
      member_ids: memberIds,
    });
    if (groupError) throw groupError;
    await loadConversations();
    setActiveConversationId(String(data));
    setMobileChatOpen(true);
  }

  function chooseAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("Attachments must be 6 MB or smaller.");
      return;
    }
    setSelectedFile(file);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeConversationId || activeBlocked || sending) return;
    const body = draft.trim();
    if (!body && !selectedFile) return;

    const currentUser = user;
    const conversationId = activeConversationId;
    setSending(true);
    setError("");
    let uploadedPath: string | null = null;

    try {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingSentRef.current = false;
      sendTypingState(false);

      if (selectedFile) {
        const path = `${conversationId}/${currentUser.id}/${crypto.randomUUID()}-${safeFileName(selectedFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(path, selectedFile, { contentType: selectedFile.type || undefined, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPath = path;
      }

      const { data: inserted, error: sendError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: currentUser.id,
          body,
          reply_to: replyTo?.id ?? null,
        })
        .select("id")
        .single();
      if (sendError) throw sendError;

      if (selectedFile && uploadedPath) {
        const { error: attachmentError } = await supabase.from("message_attachments").insert({
          message_id: inserted.id,
          uploader_id: currentUser.id,
          storage_path: uploadedPath,
          file_name: selectedFile.name,
          content_type: selectedFile.type || null,
          size_bytes: selectedFile.size,
        });
        if (attachmentError) throw attachmentError;
      }

      setDraft("");
      setSelectedFile(null);
      setReplyTo(null);
      await Promise.all([loadMessages(conversationId), loadConversations(), markRead(conversationId, currentUser.id)]);
    } catch (sendError) {
      if (uploadedPath) void supabase.storage.from("attachments").remove([uploadedPath]);
      setError(sendError instanceof Error ? sendError.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  async function editMessage(message: Message) {
    if (message.sender_id !== user?.id || message.deleted_at) return;
    const nextBody = window.prompt("Edit message", message.body);
    if (nextBody === null) return;
    const clean = nextBody.trim();
    if (!clean && message.attachments.length === 0) return;

    const { error: updateError } = await supabase
      .from("messages")
      .update({ body: clean, edited_at: new Date().toISOString() })
      .eq("id", message.id)
      .eq("sender_id", user.id);
    if (updateError) setError(updateError.message);
    else if (activeConversationId) await loadMessages(activeConversationId);
  }

  async function deleteMessage(message: Message) {
    if (message.sender_id !== user?.id || message.deleted_at) return;
    if (!window.confirm("Delete this message?")) return;

    const paths = message.attachments.map((attachment) => attachment.storage_path);
    if (paths.length > 0) {
      await supabase.storage.from("attachments").remove(paths);
      await supabase.from("message_attachments").delete().eq("message_id", message.id);
    }

    const { error: deleteError } = await supabase
      .from("messages")
      .update({ body: "", deleted_at: new Date().toISOString(), edited_at: null })
      .eq("id", message.id)
      .eq("sender_id", user.id);
    if (deleteError) setError(deleteError.message);
    else if (activeConversationId) await loadMessages(activeConversationId);
  }

  async function toggleReaction(message: Message, emoji: string) {
    if (!user) return;
    const existing = message.reactions.some((reaction) => reaction.user_id === user.id && reaction.emoji === emoji);
    const result = existing
      ? await supabase.from("message_reactions").delete().eq("message_id", message.id).eq("user_id", user.id).eq("emoji", emoji)
      : await supabase.from("message_reactions").insert({ message_id: message.id, user_id: user.id, emoji });
    if (result.error) setError(result.error.message);
    else if (activeConversationId) await loadMessages(activeConversationId);
  }

  async function loadOlderMessages() {
    if (!activeConversationId || messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      await loadMessages(activeConversationId, { olderThan: messages[0].created_at });
    } catch (olderError) {
      setError(olderError instanceof Error ? olderError.message : "Could not load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function saveProfile(values: { username: string; displayName: string; bio: string; avatarFile: File | null }) {
    if (!user || !me) return;
    let avatarPath = me.avatar_path;

    if (values.avatarFile) {
      const extension = values.avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/profile-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, values.avatarFile, { contentType: values.avatarFile.type, upsert: false });
      if (uploadError) throw uploadError;
      avatarPath = path;
    }

    const { data, error: profileError } = await supabase
      .from("profiles")
      .update({
        username: values.username,
        display_name: values.displayName,
        bio: values.bio,
        avatar_path: avatarPath,
      })
      .eq("id", user.id)
      .select("id, username, display_name, bio, avatar_path, created_at")
      .single();
    if (profileError) throw profileError;

    await supabase.auth.updateUser({ data: { username: values.username, display_name: values.displayName } });
    setMe(data as Profile);
    await loadConversations();
  }

  async function toggleBlock() {
    if (!user || !activeConversation?.other_user_id) return;
    const otherId = activeConversation.other_user_id;

    if (blockedUserIds.has(otherId)) {
      const { error: unblockError } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", otherId);
      if (unblockError) throw unblockError;
    } else {
      const { error: blockError } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: otherId });
      if (blockError) throw blockError;
    }
    await loadBlockedUsers(user.id);
  }

  async function unblockUser(userId: string) {
    if (!user) return;
    const { error: unblockError } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", userId);
    if (unblockError) setError(unblockError.message);
    else await loadBlockedUsers(user.id);
  }

  async function submitReport(reason: "spam" | "harassment" | "impersonation" | "inappropriate" | "other", details: string) {
    if (!user || !reportTarget) return;
    const { error: reportError } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: reportTarget.userId,
      message_id: reportTarget.messageId,
      reason,
      details,
    });
    if (reportError) throw reportError;
  }

  async function updateReport(reportId: string, status: "resolved" | "dismissed") {
    if (!user) return;
    const { error: reportError } = await supabase
      .from("reports")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq("id", reportId);
    if (reportError) setError(reportError.message);
    else await loadAdminState();
  }

  async function updateGroup(name: string, avatarFile: File | null) {
    if (!user || !activeConversation || activeConversation.kind !== "group") return;
    let avatarPath = activeConversation.avatar_path;

    if (avatarFile) {
      const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/group-${activeConversation.conversation_id}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile, {
        contentType: avatarFile.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      avatarPath = path;
    }

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ name, avatar_path: avatarPath, updated_at: new Date().toISOString() })
      .eq("id", activeConversation.conversation_id);
    if (updateError) throw updateError;
    await loadConversations();
  }

  async function addGroupMember(userId: string) {
    if (!activeConversationId) return;
    const { error: addError } = await supabase.rpc("add_group_member", {
      target_conversation: activeConversationId,
      target_user: userId,
    });
    if (addError) setError(addError.message);
    else await Promise.all([loadMembers(activeConversationId), loadConversations()]);
  }

  async function removeGroupMember(userId: string) {
    if (!activeConversationId || !user) return;
    const leaving = userId === user.id;
    if (leaving && !window.confirm("Leave this group?")) return;

    const { error: removeError } = await supabase.rpc("remove_group_member", {
      target_conversation: activeConversationId,
      target_user: userId,
    });
    if (removeError) {
      setError(removeError.message);
      return;
    }

    if (leaving) {
      setInfoOpen(false);
      setMobileChatOpen(false);
      setActiveConversationId(null);
      await loadConversations();
    } else {
      await Promise.all([loadMembers(activeConversationId), loadConversations()]);
    }
  }

  async function signOut() {
    if (presenceChannelRef.current) await presenceChannelRef.current.untrack();
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (!user || !me) {
    return <main className="loading-shell"><div className="spinner" /><p>Loading Pulse Chat…</p></main>;
  }

  return (
    <main className={`chat-shell-v5 ${mobileChatOpen && activeConversation ? "mobile-chat-open" : ""}`}>
      <aside className="sidebar-v5">
        <header className="sidebar-header-v5">
          <div className="brand-lockup compact">
            <div className="brand-mark">P</div>
            <div><strong>Pulse Chat</strong><span>@{me.username}</span></div>
          </div>
          <div className="header-actions">
            <button type="button" className="icon-button" onClick={() => setNewGroupOpen(true)} title="New group" aria-label="New group">＋</button>
            <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings">⚙</button>
          </div>
        </header>

        <div className="search-box-v5">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search usernames…" aria-label="Search users" />
          {(searching || searchResults.length > 0) && (
            <div className="people-results sidebar-search-results">
              {searching && <p className="search-status">Searching…</p>}
              {!searching && searchResults.map((profile) => (
                <button key={profile.id} type="button" onClick={() => void startDm(profile)}>
                  <Avatar name={profile.display_name || profile.username} path={profile.avatar_path} size="small" online={onlineUserIds.has(profile.id)} />
                  <span><strong>{profile.display_name}</strong><small>@{profile.username}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="conversation-heading-v5"><span>Messages</span><small>{conversations.length}</small></div>
        <nav className="conversation-list-v5" aria-label="Conversations">
          {conversations.length === 0 && <div className="empty-card sidebar-empty">Search for someone or create a group to start chatting.</div>}
          {conversations.map((conversation) => (
            <button
              key={conversation.conversation_id}
              type="button"
              className={`conversation-v5 ${conversation.conversation_id === activeConversationId ? "active" : ""}`}
              onClick={() => {
                setActiveConversationId(conversation.conversation_id);
                setMobileChatOpen(true);
              }}
            >
              <Avatar
                name={conversation.title}
                path={conversation.avatar_path}
                online={Boolean(conversation.kind === "dm" && conversation.other_user_id && onlineUserIds.has(conversation.other_user_id))}
              />
              <span className="conversation-copy-v5">
                <span className="conversation-title-line"><strong>{conversation.title}</strong>{conversation.kind === "group" && <small>{conversation.member_count}</small>}</span>
                <span className="conversation-preview">{conversation.last_message ?? (conversation.kind === "group" ? "New group" : "No messages yet")}</span>
              </span>
              <span className="conversation-trailing">
                {conversation.last_message_at && <time>{formatTime(conversation.last_message_at)}</time>}
                {conversation.unread_count > 0 && <span className="unread-badge">{conversation.unread_count > 99 ? "99+" : conversation.unread_count}</span>}
              </span>
            </button>
          ))}
        </nav>

        <footer className="sidebar-profile-v5">
          <Avatar name={me.display_name || me.username} path={me.avatar_path} online />
          <span><strong>{me.display_name}</strong><small>@{me.username}</small></span>
          <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">⚙</button>
        </footer>
      </aside>

      <section className="chat-panel-v5">
        {activeConversation ? (
          <>
            <header className="chat-header-v5">
              <button type="button" className="mobile-back-button" onClick={() => setMobileChatOpen(false)} aria-label="Back to conversations">‹</button>
              <Avatar
                name={activeConversation.title}
                path={activeConversation.avatar_path}
                online={Boolean(activeConversation.kind === "dm" && activeConversation.other_user_id && onlineUserIds.has(activeConversation.other_user_id))}
              />
              <button type="button" className="chat-title-button" onClick={() => setInfoOpen(true)}>
                <strong>{activeConversation.title}</strong>
                <span>
                  {activeConversation.kind === "group"
                    ? `${members.length} members`
                    : activeBlocked
                      ? "Blocked"
                      : activeConversation.other_user_id && onlineUserIds.has(activeConversation.other_user_id)
                        ? "Online"
                        : "Offline"}
                </span>
              </button>
              <button type="button" className="icon-button header-info-button" onClick={() => setInfoOpen(true)} aria-label="Conversation details">ⓘ</button>
            </header>

            <div className="messages-v5" aria-live="polite">
              {hasOlderMessages && (
                <button type="button" className="load-older-button" onClick={() => void loadOlderMessages()} disabled={loadingOlder}>
                  {loadingOlder ? "Loading…" : "Load older messages"}
                </button>
              )}

              {messages.length === 0 && (
                <div className="empty-chat-v5">
                  <Avatar name={activeConversation.title} path={activeConversation.avatar_path} size="large" />
                  <h2>{activeConversation.title}</h2>
                  <p>{activeConversation.kind === "group" ? "Start the group conversation." : "This is the beginning of your conversation."}</p>
                </div>
              )}

              {messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  currentUserId={user.id}
                  replyMessage={message.reply_to ? messages.find((candidate) => candidate.id === message.reply_to) : undefined}
                  members={members}
                  onReply={setReplyTo}
                  onEdit={(target) => void editMessage(target)}
                  onDelete={(target) => void deleteMessage(target)}
                  onReact={(target, emoji) => void toggleReaction(target, emoji)}
                  onReport={(target) => setReportTarget({
                    label: target.sender?.display_name || target.sender?.username || "this user",
                    userId: target.sender_id,
                    messageId: target.id,
                  })}
                />
              ))}

              {typingNames.length > 0 && (
                <div className="typing-indicator-v5">
                  <span className="typing-dots"><span /><span /><span /></span>
                  <span>{typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {activeBlocked ? (
              <div className="blocked-composer-notice">
                <span>This direct message is blocked.</span>
                <button type="button" className="secondary-button" onClick={() => void toggleBlock()}>Unblock</button>
              </div>
            ) : (
              <form className="composer-v5" onSubmit={sendMessage}>
                {replyTo && (
                  <div className="composer-context-bar">
                    <span><strong>Replying to {replyTo.sender_id === user.id ? "yourself" : replyTo.sender?.display_name || replyTo.sender?.username}</strong><small>{replyTo.body || "Attachment"}</small></span>
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
                  </div>
                )}
                {selectedFile && (
                  <div className="composer-context-bar">
                    <span><strong>Attachment</strong><small>{selectedFile.name}</small></span>
                    <button type="button" onClick={() => setSelectedFile(null)} aria-label="Remove attachment">×</button>
                  </div>
                )}
                <div className="composer-row-v5">
                  <input ref={fileInputRef} className="hidden-file-input" type="file" onChange={chooseAttachment} />
                  <button type="button" className="attach-button" onClick={() => fileInputRef.current?.click()} aria-label="Attach a file">＋</button>
                  <textarea
                    value={draft}
                    onChange={(event) => updateDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={`Message ${activeConversation.title}`}
                    maxLength={2000}
                    rows={1}
                  />
                  <button type="submit" className="send-button-v5" disabled={sending || (!draft.trim() && !selectedFile)}>{sending ? "…" : "Send"}</button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="welcome-panel-v5">
            <div className="brand-mark large-mark">P</div>
            <h2>Your messages</h2>
            <p>Search for someone or create a group to start chatting.</p>
            <button type="button" className="primary-button" onClick={() => setNewGroupOpen(true)}>Create a group</button>
          </div>
        )}

        {error && <button type="button" className="error-toast-v5" onClick={() => setError("")}>{error} ×</button>}
      </section>

      <SettingsModal
        open={settingsOpen}
        profile={me}
        email={user.email ?? ""}
        theme={theme}
        blockedProfiles={blockedProfiles}
        isAdmin={isAdmin}
        reports={reports}
        onClose={() => setSettingsOpen(false)}
        onThemeChange={setTheme}
        onSaveProfile={saveProfile}
        onUnblock={unblockUser}
        onUpdateReport={updateReport}
        onSignOut={signOut}
      />

      <NewGroupModal
        open={newGroupOpen}
        currentUserId={user.id}
        blockedUserIds={blockedUserIds}
        onClose={() => setNewGroupOpen(false)}
        onCreate={createGroup}
      />

      {activeConversation && (
        <ConversationInfoModal
          open={infoOpen}
          conversation={activeConversation}
          members={members}
          currentUserId={user.id}
          blocked={activeBlocked}
          onClose={() => setInfoOpen(false)}
          onToggleBlock={toggleBlock}
          onReportUser={() => setReportTarget({
            label: activeConversation.title,
            userId: activeConversation.other_user_id,
            messageId: null,
          })}
          onUpdateGroup={updateGroup}
          onAddMember={addGroupMember}
          onRemoveMember={removeGroupMember}
        />
      )}

      <ReportModal
        open={Boolean(reportTarget)}
        targetLabel={reportTarget?.label ?? "this content"}
        onClose={() => setReportTarget(null)}
        onSubmit={submitReport}
      />
    </main>
  );
}
