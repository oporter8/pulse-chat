"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  AccountEvent,
  Attachment,
  Conversation,
  ConversationMember,
  DeviceSession,
  DmRequest,
  Message,
  MessageSearchResult,
  MyProfile,
  Profile,
  Reaction,
  Receipt,
  Report,
  Theme,
} from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";
import { ConversationInfoModal } from "@/components/chat/ConversationInfoModal";
import { MessageItem } from "@/components/chat/MessageItem";
import { NewGroupModal } from "@/components/chat/NewGroupModal";
import { ReportModal } from "@/components/chat/ReportModal";
import { SettingsModal } from "@/components/chat/SettingsModal";
import { SearchModal } from "@/components/chat/SearchModal";
import { ProfileModal } from "@/components/chat/ProfileModal";
import { ImageViewerModal } from "@/components/chat/ImageViewerModal";
import { EditHistoryModal } from "@/components/chat/EditHistoryModal";
import { ForwardModal } from "@/components/chat/ForwardModal";
import { MessageRequestsModal } from "@/components/chat/MessageRequestsModal";
import { SavedMessagesModal } from "@/components/chat/SavedMessagesModal";
import { ChatSearchModal } from "@/components/chat/ChatSearchModal";
import { SharedMediaModal } from "@/components/chat/SharedMediaModal";
import { formatLastSeen, formatTime, safeFileName } from "@/lib/chat-utils";
import { disableDevicePush, enableDevicePush, getDevicePushState, type DevicePushState } from "@/lib/push-client";
import { forgetDeviceKey, getDeviceKey, getDeviceName } from "@/lib/device";
import { haptic, playNotificationSound } from "@/lib/sounds";

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
  const [me, setMe] = useState<MyProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyPreviews, setReplyPreviews] = useState<Record<string, Message>>({});
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [blockedProfiles, setBlockedProfiles] = useState<Profile[]>([]);
  const [theme, setTheme] = useState<Theme>("system");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"profile" | "privacy" | "notifications" | "security" | "moderation">("profile");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [pushState, setPushState] = useState<DevicePushState>({ supported: false, permission: "unsupported", enabled: false });
  const [showArchived, setShowArchived] = useState(false);
  const [messageRequests, setMessageRequests] = useState<DmRequest[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [sharedMediaOpen, setSharedMediaOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);
  const [imageViewer, setImageViewer] = useState<{ images: Array<{ src: string; name: string }>; initialIndex: number } | null>(null);
  const [editHistoryMessage, setEditHistoryMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [recentReactions, setRecentReactions] = useState<string[]>([]);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [iosInstallHint, setIosInstallHint] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const inboxChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const activeChannelReadyRef = useRef(false);
  const pendingJumpRef = useRef<MessageSearchResult | null>(null);
  const failedQueueRef = useRef(new Map<string, { conversationId: string; body: string; file: File | null; replyToId: string | null; objectUrl: string | null }>());

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.conversation_id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  const visibleConversations = useMemo(() =>
    conversations.filter((conversation) => showArchived ? Boolean(conversation.archived_at) : !conversation.archived_at),
    [conversations, showArchived],
  );
  const totalUnread = useMemo(() => conversations.reduce((sum, conversation) => sum + conversation.unread_count, 0), [conversations]);

  const activeBlocked = Boolean(
    activeConversation?.kind === "dm" &&
      activeConversation.other_user_id &&
      blockedUserIds.has(activeConversation.other_user_id),
  );

  const activeMuted = useMemo(() => {
    const mine = members.find((member) => member.user_id === user?.id);
    if (!mine?.muted_until) return false;
    return new Date(mine.muted_until).getTime() > Date.now();
  }, [members, user?.id]);

  const activeOtherProfile = useMemo(() => {
    if (!activeConversation || activeConversation.kind !== "dm") return null;
    return members.find((member) => member.user_id !== user?.id)?.profile ?? null;
  }, [activeConversation, members, user?.id]);

  const typingNames = useMemo(() => {
    return members
      .filter((member) => typingUserIds.has(member.user_id) && member.user_id !== user?.id)
      .map((member) => member.profile.display_name || member.profile.username);
  }, [members, typingUserIds, user?.id]);

  const loadConversations = useCallback(async () => {
    const [{ data, error: loadError }, { data: authData }] = await Promise.all([
      supabase.rpc("get_my_conversations"),
      supabase.auth.getUser(),
    ]);
    if (loadError) throw loadError;

    const base = ((data ?? []) as Record<string, unknown>[]).map(normalizeConversation);
    const userId = authData.user?.id;
    let prefs: Record<string, { pinned_at: string | null; archived_at: string | null; cleared_at: string | null; hidden_at: string | null }> = {};
    if (userId) {
      const { data: rows } = await supabase
        .from("conversation_members")
        .select("conversation_id,pinned_at,archived_at,cleared_at,hidden_at")
        .eq("user_id", userId);
      prefs = Object.fromEntries((rows ?? []).map((row: any) => [String(row.conversation_id), {
        pinned_at: typeof row.pinned_at === "string" ? row.pinned_at : null,
        archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
        cleared_at: typeof row.cleared_at === "string" ? row.cleared_at : null,
        hidden_at: typeof row.hidden_at === "string" ? row.hidden_at : null,
      }]));
    }

    const next = base
      .map((conversation) => ({ ...conversation, ...(prefs[conversation.conversation_id] ?? {}) }))
      .filter((conversation) => {
        if (!conversation.hidden_at) return true;
        if (!conversation.last_message_at) return false;
        return new Date(conversation.last_message_at).getTime() > new Date(conversation.hidden_at).getTime();
      })
      .sort((a, b) => {
        if (Boolean(a.pinned_at) !== Boolean(b.pinned_at)) return a.pinned_at ? -1 : 1;
        return new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime();
      });
    setConversations(next);

    setActiveConversationId((current) => {
      if (current && next.some((conversation) => conversation.conversation_id === current)) return current;
      return next.find((conversation) => !conversation.archived_at)?.conversation_id ?? null;
    });

    return next;
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
      .select("id, username, display_name, bio, avatar_path, admin_tag, status_text, last_active_at, created_at")
      .in("id", ids);
    if (profileError) throw profileError;
    setBlockedProfiles((profiles ?? []) as Profile[]);
  }, []);

  const loadMessageRequests = useCallback(async (currentUserId: string) => {
    const { data: requestRows, error: requestError } = await supabase
      .from("dm_requests")
      .select("id,sender_id,recipient_id,status,created_at")
      .eq("recipient_id", currentUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (requestError) {
      // v8 migration may not be installed yet during a rolling deploy.
      setMessageRequests([]);
      return;
    }
    const rows = (requestRows ?? []) as DmRequest[];
    const senderIds = Array.from(new Set(rows.map((row) => row.sender_id)));
    if (senderIds.length === 0) { setMessageRequests([]); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,username,display_name,bio,avatar_path,admin_tag,status_text,created_at")
      .in("id", senderIds);
    const byId = new Map(((profiles ?? []) as Profile[]).map((profile) => [profile.id, { ...profile, last_active_at: null }]));
    setMessageRequests(rows.map((row) => ({ ...row, sender: byId.get(row.sender_id) })));
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
    const { data, error: memberError } = await supabase.rpc("get_conversation_members", {
      target_conversation: conversationId,
    });

    if (memberError) throw memberError;

    const normalized: ConversationMember[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      conversation_id: String(row.conversation_id),
      user_id: String(row.user_id),
      role: row.role === "owner" || row.role === "admin" ? row.role : "member",
      joined_at: String(row.joined_at),
      last_read_at: typeof row.last_read_at === "string" ? row.last_read_at : null,
      muted_until: typeof row.muted_until === "string" ? row.muted_until : null,
      profile: {
        id: String(row.profile_id),
        username: String(row.username),
        display_name: String(row.display_name),
        bio: String(row.bio ?? ""),
        avatar_path: typeof row.avatar_path === "string" ? row.avatar_path : null,
        admin_tag: typeof row.admin_tag === "string" ? row.admin_tag : null,
        status_text: typeof row.status_text === "string" ? row.status_text : "",
        last_active_at: typeof row.last_active_at === "string" ? row.last_active_at : null,
        created_at: String(row.profile_created_at),
      },
    }));
    setMembers(normalized);
  }, []);

  const hydrateMessages = useCallback(async (rawMessages: any[]): Promise<Message[]> => {
    if (rawMessages.length === 0) return [];

    const messageIds = rawMessages.map((message) => String(message.id));
    const senderIds = Array.from(new Set(rawMessages.map((message) => String(message.sender_id))));

    const [profileResult, attachmentResult, reactionResult, receiptResult, savedResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_path, admin_tag, status_text, last_active_at, created_at")
        .in("id", senderIds),
      supabase
        .from("message_attachments")
        .select("id, message_id, uploader_id, storage_path, file_name, content_type, size_bytes, created_at")
        .in("message_id", messageIds),
      supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji, created_at")
        .in("message_id", messageIds),
      supabase
        .from("message_receipts")
        .select("message_id,user_id,delivered_at,read_at")
        .in("message_id", messageIds),
      supabase
        .from("saved_messages")
        .select("message_id")
        .in("message_id", messageIds),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (attachmentResult.error) throw attachmentResult.error;
    if (reactionResult.error) throw reactionResult.error;

    const profiles = new Map(((profileResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]));
    const attachments = (attachmentResult.data ?? []) as Attachment[];
    const reactions = (reactionResult.data ?? []) as Reaction[];
    const receipts = (receiptResult.data ?? []) as Receipt[];
    const savedIds = new Set((savedResult.data ?? []).map((row) => String(row.message_id)));

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
      forwarded_from: typeof row.forwarded_from === "string" ? row.forwarded_from : null,
      client_id: typeof row.client_id === "string" ? row.client_id : null,
      sender: profiles.get(String(row.sender_id)),
      attachments: attachments
        .filter((attachment) => attachment.message_id === String(row.id))
        .map((attachment) => ({ ...attachment, signed_url: signedByPath.get(attachment.storage_path) })),
      reactions: reactions.filter((reaction) => reaction.message_id === String(row.id)),
      receipts: receipts.filter((receipt) => receipt.message_id === String(row.id)),
      saved: savedIds.has(String(row.id)),
    }));
  }, []);

  const loadReplyPreviews = useCallback(async (sourceMessages: Message[]) => {
    const loadedIds = new Set(sourceMessages.map((message) => message.id));
    const replyIds = Array.from(new Set(sourceMessages
      .map((message) => message.reply_to)
      .filter((id): id is string => Boolean(id) && !loadedIds.has(id as string))));
    if (replyIds.length === 0) {
      if (sourceMessages.length > 0) {
        setReplyPreviews((current) => {
          const next = { ...current };
          for (const message of sourceMessages) if (message.reply_to && loadedIds.has(message.reply_to)) delete next[message.reply_to];
          return next;
        });
      }
      return;
    }
    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to, forwarded_from, client_id")
      .in("id", replyIds);
    if (error || !data) return;
    const hydrated = await hydrateMessages(data);
    setReplyPreviews((current) => ({ ...current, ...Object.fromEntries(hydrated.map((message) => [message.id, message])) }));
  }, [hydrateMessages]);

  const loadMessages = useCallback(async (conversationId: string, options?: { olderThan?: string }) => {
    const olderThan = options?.olderThan;
    const { data: membership } = await supabase
      .from("conversation_members")
      .select("cleared_at")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    const clearedAt = typeof membership?.cleared_at === "string" ? membership.cleared_at : null;

    let query = supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to, forwarded_from, client_id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (clearedAt) query = query.gt("created_at", clearedAt);
    if (olderThan) query = query.lt("created_at", olderThan);

    const { data, error: messagesError } = await query;
    if (messagesError) throw messagesError;

    const hydrated = await hydrateMessages(data ?? []);
    hydrated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    await loadReplyPreviews(hydrated);
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
  }, [hydrateMessages, loadReplyPreviews]);

  const loadMessageContext = useCallback(async (conversationId: string, targetCreatedAt: string) => {
    const { data: membership } = await supabase.from("conversation_members").select("cleared_at").eq("conversation_id", conversationId).maybeSingle();
    const clearedAt = typeof membership?.cleared_at === "string" ? membership.cleared_at : null;
    if (clearedAt && new Date(targetCreatedAt).getTime() <= new Date(clearedAt).getTime()) {
      throw new Error("That message was cleared from your chat history.");
    }
    const baseSelect = "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to, forwarded_from, client_id";
    const [beforeResult, afterResult] = await Promise.all([
      supabase
        .from("messages")
        .select(baseSelect)
        .eq("conversation_id", conversationId)
        .lte("created_at", targetCreatedAt)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("messages")
        .select(baseSelect)
        .eq("conversation_id", conversationId)
        .gt("created_at", targetCreatedAt)
        .order("created_at", { ascending: true })
        .limit(30),
    ]);

    if (beforeResult.error) throw beforeResult.error;
    if (afterResult.error) throw afterResult.error;

    const byId = new Map<string, Record<string, unknown>>();
    [...(beforeResult.data ?? []), ...(afterResult.data ?? [])].forEach((row) => {
      byId.set(String(row.id), row as Record<string, unknown>);
    });

    const hydrated = await hydrateMessages([...byId.values()]);
    hydrated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    await loadReplyPreviews(hydrated);
    setMessages(hydrated);
    setHasOlderMessages((beforeResult.data ?? []).length === 30);
  }, [hydrateMessages, loadReplyPreviews]);

  const markRead = useCallback(async (
    conversationId: string,
    currentUserId: string,
    publishReadReceipt: boolean,
  ) => {
    const now = new Date().toISOString();
    const update: { last_seen_at: string; last_read_at?: string } = { last_seen_at: now };
    if (publishReadReceipt) update.last_read_at = now;

    const [{ error: readError }] = await Promise.all([
      supabase
        .from("conversation_members")
        .update(update)
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId),
      supabase.rpc("mark_conversation_receipts", {
        target_conversation: conversationId,
        mark_read: publishReadReceipt,
      }),
    ]);

    if (!readError) {
      setMembers((current) => current.map((member) =>
        member.user_id === currentUserId
          ? { ...member, last_read_at: publishReadReceipt ? now : member.last_read_at }
          : member,
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
    try {
      const stored = JSON.parse(window.localStorage.getItem("pulse-recent-reactions") ?? "[]");
      if (Array.isArray(stored)) setRecentReactions(stored.filter((item): item is string => typeof item === "string").slice(0, 5));
    } catch { setRecentReactions([]); }
  }, []);

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("pulse-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!settingsOpen) return;
    void getDevicePushState().then(setPushState).catch(() => undefined);
  }, [settingsOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const updateNetwork = () => setNetworkOnline(navigator.onLine);
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    updateNetwork();
    const nav = navigator as Navigator & { standalone?: boolean };
    setIosInstallHint(/iPad|iPhone|iPod/i.test(navigator.userAgent) && nav.standalone !== true);
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    window.addEventListener("beforeinstallprompt", captureInstall);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      window.removeEventListener("beforeinstallprompt", captureInstall);
    };
  }, []);

  useEffect(() => {
    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (totalUnread > 0) void badgeNavigator.setAppBadge?.(totalUnread).catch(() => undefined);
    else void badgeNavigator.clearAppBadge?.().catch(() => undefined);
  }, [totalUnread]);

  useEffect(() => {
    if (!activeConversationId) { setDraft(""); return; }
    setDraft(window.localStorage.getItem(`pulse-draft:${activeConversationId}`) ?? "");
  }, [activeConversationId]);

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
        await supabase.realtime.setAuth(data.session.access_token);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, display_name, bio, avatar_path, admin_tag, status_text, last_active_at, created_at, dm_privacy, show_read_receipts, show_online_status, notifications_enabled, notification_preview, notification_sound")
          .eq("id", currentUser.id)
          .single();
        if (profileError) throw profileError;
        if (!mounted) return;

        const freshPasswordLogin = window.sessionStorage.getItem("pulse-fresh-login") === "1";
        window.sessionStorage.removeItem("pulse-fresh-login");

        let deviceKey = getDeviceKey();
        const deviceName = getDeviceName();
        let { data: deviceRows, error: deviceError } = await supabase.rpc("register_device", {
          p_device_key: deviceKey,
          p_device_name: deviceName,
          p_user_agent: navigator.userAgent,
        });
        if (deviceError) throw deviceError;
        let deviceState = Array.isArray(deviceRows) ? deviceRows[0] : deviceRows;

        // A revoked browser key should still eject an already-running session.
        // But after the user explicitly enters their password again, treat that as
        // a fresh device authorization and issue a new local device key instead of
        // creating a login -> logout loop.
        if (deviceState && deviceState.allowed === false && freshPasswordLogin) {
          forgetDeviceKey();
          deviceKey = getDeviceKey();
          const retry = await supabase.rpc("register_device", {
            p_device_key: deviceKey,
            p_device_name: deviceName,
            p_user_agent: navigator.userAgent,
          });
          if (retry.error) throw retry.error;
          deviceRows = retry.data;
          deviceState = Array.isArray(deviceRows) ? deviceRows[0] : deviceRows;
        }

        if (deviceState && deviceState.allowed === false) {
          forgetDeviceKey();
          await supabase.auth.signOut({ scope: "local" });
          router.replace("/");
          return;
        }

        // Do not expose the authenticated user to heartbeat/presence effects until
        // device validation has completed. Starting those effects earlier allowed
        // an old revoked device key to sign a successful login straight back out.
        if (!mounted) return;
        setUser(currentUser);
        setMe(profile as MyProfile);

        if (deviceState?.is_new) {
          void fetch("/api/security/login-alert", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${data.session.access_token}` },
            body: JSON.stringify({ deviceName }),
          }).catch(() => undefined);
        }

        const [nextConversations] = await Promise.all([
          loadConversations(),
          loadBlockedUsers(currentUser.id),
          loadAdminState(),
          loadMessageRequests(currentUser.id),
        ]);

        const linkedConversation = new URLSearchParams(window.location.search).get("conversation");
        if (linkedConversation && nextConversations.some((conversation) => conversation.conversation_id === linkedConversation)) {
          setActiveConversationId(linkedConversation);
          setMobileChatOpen(true);
        }

        const params = new URLSearchParams(window.location.search);
        const requestedUsername = params.get("user")?.trim().toLowerCase();
        if (requestedUsername) {
          const { data: target } = await supabase.from("profiles").select("id").eq("username", requestedUsername).maybeSingle();
          if (target?.id) {
            const { data: cards } = await supabase.rpc("get_profile_card", { target_user: target.id });
            const card = Array.isArray(cards) ? cards[0] : cards;
            if (card) setProfileTarget(card as Profile);
          }
        }
        if (params.get("settings") === "security") {
          setSettingsInitialTab("security");
          setSettingsOpen(true);
        }

        void getDevicePushState().then(setPushState).catch(() => undefined);
      } catch (bootError) {
        setError(bootError instanceof Error ? bootError.message : "Could not load Tiger Chat.");
      }
    }

    void boot();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Boot already handles a genuinely missing initial session. Restrict redirects
      // here to a real SIGNED_OUT event so a transient null auth callback cannot
      // bounce a valid login back to the auth screen.
      if (event === "SIGNED_OUT") {
        router.replace("/");
        return;
      }
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadAdminState, loadBlockedUsers, loadConversations, loadMessageRequests, router]);

  useEffect(() => {
    if (!user) return;
    const deviceKey = getDeviceKey();
    let stopped = false;
    const check = async () => {
      if (stopped || !navigator.onLine) return;
      const { data, error } = await supabase.rpc("heartbeat_device", { p_device_key: deviceKey });
      if (!error && data === false) {
        try { await disableDevicePush(user.id); } catch { /* best effort */ }
        forgetDeviceKey();
        await supabase.auth.signOut({ scope: "local" });
        router.replace("/");
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [router, user]);

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
          if (status === "SUBSCRIBED" && channel && currentMe.show_online_status) {
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
    if (!user || !me) return;
    const currentUser = user;
    const currentMe = me;
    let stopped = false;
    let channel: RealtimeChannel | null = null;

    async function connectInbox() {
      const { data } = await supabase.auth.getSession();
      if (stopped || !data.session?.access_token) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (stopped) return;

      setRealtimeConnected(false);
      channel = supabase
        .channel(`pulse:inbox:${currentUser.id}`, { config: { private: true } })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: raw }) => {
          const row = raw as { id?: string; conversation_id?: string; sender_id?: string };
          const conversationId = typeof row.conversation_id === "string" ? row.conversation_id : "";
          const senderId = typeof row.sender_id === "string" ? row.sender_id : "";
          if (!conversationId) return;
          void loadConversations();
          if (senderId && senderId !== currentUser.id) {
            void supabase.rpc("mark_conversation_receipts", { target_conversation: conversationId, mark_read: false });
            if (currentMe.notifications_enabled && conversationId !== activeConversationId && document.visibilityState === "visible") {
              void supabase.from("conversation_members").select("muted_until").eq("conversation_id", conversationId).eq("user_id", currentUser.id).maybeSingle().then(({ data: membership }) => {
                const mutedUntil = typeof membership?.muted_until === "string" ? new Date(membership.muted_until).getTime() : 0;
                if (!mutedUntil || mutedUntil <= Date.now()) {
                  playNotificationSound(currentMe.notification_sound);
                  haptic([8, 30, 8]);
                }
              });
            }
          }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "dm_requests" }, () => {
          void loadMessageRequests(currentUser.id);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setRealtimeConnected(true);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeConnected(false);
        });
      inboxChannelRef.current = channel;
    }

    void connectInbox();
    const fallbackRefresh = window.setInterval(() => {
      if (!navigator.onLine) return;
      void loadConversations();
      void loadMessageRequests(currentUser.id);
    }, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(fallbackRefresh);
      if (channel) void supabase.removeChannel(channel);
      if (inboxChannelRef.current === channel) inboxChannelRef.current = null;
    };
  }, [activeConversationId, loadConversations, loadMessageRequests, me, user]);

  useEffect(() => {
    if (!activeConversationId || !user || !me) {
      setMessages([]);
      setReplyPreviews({});
      setMembers([]);
      setTypingUserIds(new Set());
      return;
    }

    const conversationId = activeConversationId;
    const currentUser = user;
    const publishReadReceipt = me.show_read_receipts;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    activeChannelReadyRef.current = false;
    setReplyTo(null);
    setSelectedFile(null);

    async function refreshConversation() {
      try {
        const jumpTarget = pendingJumpRef.current?.conversation_id === conversationId
          ? pendingJumpRef.current
          : null;

        await Promise.all([
          jumpTarget
            ? loadMessageContext(conversationId, jumpTarget.created_at)
            : loadMessages(conversationId),
          loadMembers(conversationId),
        ]);
        await markRead(conversationId, currentUser.id, publishReadReceipt);

        if (jumpTarget && !cancelled) {
          pendingJumpRef.current = null;
          setHighlightMessageId(jumpTarget.message_id);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              document.getElementById(`message-${jumpTarget.message_id}`)?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            });
          });
          window.setTimeout(() => setHighlightMessageId((current) => current === jumpTarget.message_id ? null : current), 3200);
        }
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
          void loadMessages(conversationId).then(() => markRead(conversationId, currentUser.id, publishReadReceipt));
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
        .on("postgres_changes", { event: "*", schema: "public", table: "message_receipts" }, () => {
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
  }, [activeConversationId, loadConversations, loadMembers, loadMessageContext, loadMessages, markRead, me, user]);

  useEffect(() => {
    if (!highlightMessageId) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [highlightMessageId, messages.length, typingNames.length]);

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
        .select("id, username, display_name, bio, avatar_path, admin_tag, status_text, last_active_at, created_at")
        .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
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
    if (activeConversationId) {
      if (value) window.localStorage.setItem(`pulse-draft:${activeConversationId}`, value);
      else window.localStorage.removeItem(`pulse-draft:${activeConversationId}`);
    }
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
      if (!data) {
        if (user) await loadMessageRequests(user.id);
        setNotice("Message request sent.");
        return;
      }
      const conversationId = String(data);
      if (user) {
        await supabase
          .from("conversation_members")
          .update({ hidden_at: null, archived_at: null })
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id);
      }
      await loadConversations();
      setActiveConversationId(conversationId);
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

  function selectAttachment(file: File | null) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("Attachments must be 6 MB or smaller.");
      return;
    }
    setSelectedFile(file);
  }

  function chooseAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    selectAttachment(file);
  }

  function pasteAttachment(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.clipboardData.files).find((candidate) => candidate.type.startsWith("image/"));
    if (file) selectAttachment(file);
  }

  function dropAttachment(event: ReactDragEvent<HTMLFormElement>) {
    event.preventDefault();
    selectAttachment(event.dataTransfer.files?.[0] ?? null);
  }

  async function sendPushForMessage(messageId: string) {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;

      const response = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messageId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        console.warn("Pulse notification delivery skipped:", payload?.error ?? response.statusText);
      }
    } catch (pushError) {
      console.warn("Pulse notification delivery failed:", pushError);
    }
  }

  async function attemptPendingSend(clientId: string) {
    if (!user || !me) return;
    const pending = failedQueueRef.current.get(clientId);
    if (!pending) return;
    const localId = `local-${clientId}`;
    setMessages((current) => current.map((message) => message.id === localId ? { ...message, local_status: "sending" } : message));

    if (!navigator.onLine) {
      setMessages((current) => current.map((message) => message.id === localId ? { ...message, local_status: "failed" } : message));
      setError("You’re offline. The message is saved here—tap Retry when you reconnect.");
      return;
    }

    let uploadedPath: string | null = null;
    try {
      if (pending.file) {
        uploadedPath = `${pending.conversationId}/${user.id}/${clientId}-${safeFileName(pending.file.name)}`;
        // Retry uses a deterministic path. Remove a stale partial upload first so
        // a network failure after storage upload cannot make every retry collide.
        await supabase.storage.from("attachments").remove([uploadedPath]);
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(uploadedPath, pending.file, { contentType: pending.file.type || undefined, upsert: false });
        if (uploadError) throw uploadError;
      }

      let messageId: string | null = null;
      const { data: inserted, error: insertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: pending.conversationId,
          sender_id: user.id,
          body: pending.body,
          reply_to: pending.replyToId,
          client_id: clientId,
        })
        .select("id")
        .single();

      if (insertError?.code === "23505") {
        const { data: existing, error: existingError } = await supabase
          .from("messages")
          .select("id")
          .eq("sender_id", user.id)
          .eq("client_id", clientId)
          .maybeSingle();
        if (existingError) throw existingError;
        messageId = existing?.id ? String(existing.id) : null;
      } else if (insertError) {
        throw insertError;
      } else {
        messageId = inserted?.id ? String(inserted.id) : null;
      }

      if (!messageId) throw new Error("Tiger Chat could not confirm the sent message.");

      if (pending.file && uploadedPath) {
        const { error: attachmentError } = await supabase.from("message_attachments").insert({
          message_id: messageId,
          uploader_id: user.id,
          storage_path: uploadedPath,
          file_name: pending.file.name,
          content_type: pending.file.type || null,
          size_bytes: pending.file.size,
        });
        if (attachmentError?.code !== "23505" && attachmentError) throw attachmentError;
      }

      failedQueueRef.current.delete(clientId);
      if (pending.objectUrl) URL.revokeObjectURL(pending.objectUrl);
      setMessages((current) => current.filter((message) => message.id !== localId));
      await Promise.all([
        loadMessages(pending.conversationId),
        loadConversations(),
        markRead(pending.conversationId, user.id, me.show_read_receipts),
      ]);
      haptic(7);
      void sendPushForMessage(messageId);
    } catch (sendError) {
      if (uploadedPath) void supabase.storage.from("attachments").remove([uploadedPath]);
      setMessages((current) => current.map((message) => message.id === localId ? { ...message, local_status: "failed" } : message));
      setError(sendError instanceof Error ? sendError.message : "Could not send the message.");
    }
  }

  async function retryMessage(message: Message) {
    if (!message.client_id) return;
    setError("");
    await attemptPendingSend(message.client_id);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!user || !me || !activeConversationId || activeBlocked || sending) return;
    const body = draft.trim();
    const file = selectedFile;
    if (!body && !file) return;

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingSentRef.current = false;
    sendTypingState(false);

    const clientId = crypto.randomUUID();
    const conversationId = activeConversationId;
    const objectUrl = file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    const localAttachment: Attachment[] = file ? [{
      id: `local-attachment-${clientId}`,
      message_id: `local-${clientId}`,
      uploader_id: user.id,
      storage_path: "",
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
      created_at: new Date().toISOString(),
      signed_url: objectUrl ?? undefined,
    }] : [];

    failedQueueRef.current.set(clientId, { conversationId, body, file, replyToId: replyTo?.id ?? null, objectUrl });
    const optimistic: Message = {
      id: `local-${clientId}`,
      conversation_id: conversationId,
      sender_id: user.id,
      body,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to: replyTo?.id ?? null,
      forwarded_from: null,
      client_id: clientId,
      sender: me,
      attachments: localAttachment,
      reactions: [],
      receipts: [],
      saved: false,
      local_status: "sending",
    };

    setMessages((current) => [...current, optimistic]);
    setDraft("");
    window.localStorage.removeItem(`pulse-draft:${conversationId}`);
    setSelectedFile(null);
    setReplyTo(null);
    setSending(true);
    setError("");
    try {
      await attemptPendingSend(clientId);
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
    if (!user || message.deleted_at) return;
    const mine = message.sender_id === user.id;
    if (!mine && !isAdmin) return;
    if (!window.confirm(mine ? "Delete this message?" : "Remove this message as an admin?")) return;

    // Owners can remove their own uploaded files. Admin deletion of someone else's
    // message soft-deletes the message only, so private storage ownership stays intact.
    if (mine) {
      const paths = message.attachments.map((attachment) => attachment.storage_path);
      if (paths.length > 0) {
        await supabase.storage.from("attachments").remove(paths);
        await supabase.from("message_attachments").delete().eq("message_id", message.id);
      }
    }

    let query = supabase
      .from("messages")
      .update({ body: "", deleted_at: new Date().toISOString(), edited_at: null })
      .eq("id", message.id);

    if (mine) query = query.eq("sender_id", user.id);

    const { error: deleteError } = await query;
    if (deleteError) setError(deleteError.message);
    else if (activeConversationId) await loadMessages(activeConversationId);
  }

  async function toggleReaction(message: Message, emoji: string) {
    if (!user || message.local_status) return;
    const existing = message.reactions.some((reaction) => reaction.user_id === user.id && reaction.emoji === emoji);
    const result = existing
      ? await supabase.from("message_reactions").delete().eq("message_id", message.id).eq("user_id", user.id).eq("emoji", emoji)
      : await supabase.from("message_reactions").insert({ message_id: message.id, user_id: user.id, emoji });
    if (result.error) setError(result.error.message);
    else {
      if (!existing) {
        const next = [emoji, ...recentReactions.filter((item) => item !== emoji)].slice(0, 5);
        setRecentReactions(next);
        window.localStorage.setItem("pulse-recent-reactions", JSON.stringify(next));
      }
      if (activeConversationId) await loadMessages(activeConversationId);
    }
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

  function openConversationFromSearch(conversationId: string) {
    setGlobalSearchOpen(false);
    setActiveConversationId(conversationId);
    setMobileChatOpen(true);
  }

  async function openMessageFromSearch(result: MessageSearchResult) {
    setGlobalSearchOpen(false);
    setMobileChatOpen(true);

    if (activeConversationId !== result.conversation_id) {
      pendingJumpRef.current = result;
      setActiveConversationId(result.conversation_id);
      return;
    }

    try {
      await loadMessageContext(result.conversation_id, result.created_at);
      setHighlightMessageId(result.message_id);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById(`message-${result.message_id}`)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
      });
      window.setTimeout(() => setHighlightMessageId((current) => current === result.message_id ? null : current), 3200);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Could not open that message.");
    }
  }

  async function saveProfile(values: { username: string; displayName: string; bio: string; statusText: string; avatarFile: File | null }) {
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
        status_text: values.statusText,
        avatar_path: avatarPath,
      })
      .eq("id", user.id)
      .select("id, username, display_name, bio, avatar_path, admin_tag, status_text, last_active_at, created_at, dm_privacy, show_read_receipts, show_online_status, notifications_enabled, notification_preview, notification_sound")
      .single();
    if (profileError) throw profileError;

    await supabase.auth.updateUser({ data: { username: values.username, display_name: values.displayName } });
    setMe(data as MyProfile);
    await loadConversations();
  }

  async function savePreferences(values: {
    dmPrivacy: MyProfile["dm_privacy"];
    showReadReceipts: boolean;
    showOnlineStatus: boolean;
    notificationsEnabled: boolean;
    notificationPreview: boolean;
    notificationSound: MyProfile["notification_sound"];
  }) {
    if (!user || !me) return;

    if (me.show_read_receipts && !values.showReadReceipts) {
      const [{ error: clearMembershipReceiptError }, { error: clearMessageReceiptError }] = await Promise.all([
        supabase
          .from("conversation_members")
          .update({ last_read_at: null })
          .eq("user_id", user.id),
        supabase
          .from("message_receipts")
          .update({ read_at: null })
          .eq("user_id", user.id),
      ]);
      if (clearMembershipReceiptError) throw clearMembershipReceiptError;
      if (clearMessageReceiptError) throw clearMessageReceiptError;
    }

    const { data, error: preferenceError } = await supabase
      .from("profiles")
      .update({
        dm_privacy: values.dmPrivacy,
        show_read_receipts: values.showReadReceipts,
        show_online_status: values.showOnlineStatus,
        notifications_enabled: values.notificationsEnabled,
        notification_preview: values.notificationPreview,
        notification_sound: values.notificationSound,
      })
      .eq("id", user.id)
      .select("id, username, display_name, bio, avatar_path, admin_tag, status_text, last_active_at, created_at, dm_privacy, show_read_receipts, show_online_status, notifications_enabled, notification_preview, notification_sound")
      .single();

    if (preferenceError) throw preferenceError;
    setMe(data as MyProfile);

    if (activeConversationId) {
      await loadMembers(activeConversationId);
    }
  }

  async function enableCurrentDevicePush() {
    if (!user) return;
    const next = await enableDevicePush(user.id);
    setPushState(next);
  }

  async function disableCurrentDevicePush() {
    if (!user) return;
    const next = await disableDevicePush(user.id);
    setPushState(next);
  }

  async function setConversationMute(mode: "off" | "1h" | "8h" | "forever") {
    if (!user || !activeConversationId) return;
    const now = Date.now();
    const mutedUntil = mode === "off"
      ? null
      : mode === "1h"
        ? new Date(now + 60 * 60 * 1000).toISOString()
        : mode === "8h"
          ? new Date(now + 8 * 60 * 60 * 1000).toISOString()
          : "9999-12-31T23:59:59.000Z";
    const { error: muteError } = await supabase
      .from("conversation_members")
      .update({ muted_until: mutedUntil })
      .eq("conversation_id", activeConversationId)
      .eq("user_id", user.id);
    if (muteError) throw muteError;
    await loadMembers(activeConversationId);
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
      if (!window.confirm("Block this person? They will no longer be able to message you directly.")) return;
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
    setNotice("Report submitted. You can review its status in Settings → Privacy.");
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

  async function toggleSavedMessage(message: Message) {
    if (!user || message.local_status || message.deleted_at) return;
    const result = message.saved
      ? await supabase.from("saved_messages").delete().eq("user_id", user.id).eq("message_id", message.id)
      : await supabase.from("saved_messages").insert({ user_id: user.id, message_id: message.id });
    if (result.error) { setError(result.error.message); return; }
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, saved: !message.saved } : item));
    haptic(7);
  }

  async function forwardToConversation(targetConversationId: string) {
    if (!user || !forwardMessage || forwardMessage.deleted_at || forwardMessage.local_status) return;
    setError("");
    const clientId = crypto.randomUUID();
    const { data: inserted, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: targetConversationId,
        sender_id: user.id,
        body: forwardMessage.body,
        forwarded_from: forwardMessage.id,
        client_id: clientId,
      })
      .select("id")
      .single();
    if (messageError) throw messageError;

    for (const attachment of forwardMessage.attachments) {
      const destination = `${targetConversationId}/${user.id}/${crypto.randomUUID()}-${safeFileName(attachment.file_name)}`;
      const { error: copyError } = await supabase.storage.from("attachments").copy(attachment.storage_path, destination);
      if (copyError) { console.warn("Could not copy forwarded attachment", copyError); continue; }
      const { error: metadataError } = await supabase.from("message_attachments").insert({
        message_id: inserted.id,
        uploader_id: user.id,
        storage_path: destination,
        file_name: attachment.file_name,
        content_type: attachment.content_type,
        size_bytes: attachment.size_bytes,
      });
      if (metadataError) console.warn("Could not attach forwarded file metadata", metadataError);
    }

    setNotice("Message forwarded.");
    await loadConversations();
    if (targetConversationId === activeConversationId) await loadMessages(targetConversationId);
    void sendPushForMessage(String(inserted.id));
  }

  async function openProfile(profile: Profile) {
    const { data, error: profileError } = await supabase.rpc("get_profile_card", { target_user: profile.id });
    if (profileError) { setError(profileError.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setProfileTarget((row ?? profile) as Profile);
  }

  function openImage(src: string, name: string, providedImages?: Array<{ src: string; name: string }>) {
    const loadedImages = messages.flatMap((message) => message.attachments)
      .filter((attachment) => attachment.content_type?.startsWith("image/") && attachment.signed_url)
      .map((attachment) => ({ src: attachment.signed_url as string, name: attachment.file_name }));
    const candidates = providedImages && providedImages.length > 0 ? providedImages : loadedImages;
    const list = candidates.some((image) => image.src === src) ? candidates : [{ src, name }];
    const initialIndex = Math.max(0, list.findIndex((image) => image.src === src));
    setImageViewer({ images: list, initialIndex });
  }

  async function respondMessageRequest(requestId: string, accept: boolean) {
    if (!user) return;
    const { data, error: requestError } = await supabase.rpc("respond_dm_request", {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (requestError) { setError(requestError.message); return; }
    await Promise.all([loadMessageRequests(user.id), loadConversations()]);
    if (accept && data) {
      setRequestsOpen(false);
      setActiveConversationId(String(data));
      setMobileChatOpen(true);
      setNotice("Message request accepted.");
    } else if (!accept) {
      setNotice("Message request declined.");
    }
  }

  async function togglePinConversation() {
    if (!user || !activeConversation) return;
    const next = activeConversation.pinned_at ? null : new Date().toISOString();
    const { error: updateError } = await supabase.from("conversation_members")
      .update({ pinned_at: next })
      .eq("conversation_id", activeConversation.conversation_id)
      .eq("user_id", user.id);
    if (updateError) throw updateError;
    await loadConversations();
  }

  async function toggleArchiveConversation() {
    if (!user || !activeConversation) return;
    const next = activeConversation.archived_at ? null : new Date().toISOString();
    const { error: updateError } = await supabase.from("conversation_members")
      .update({ archived_at: next, pinned_at: next ? null : activeConversation.pinned_at ?? null })
      .eq("conversation_id", activeConversation.conversation_id)
      .eq("user_id", user.id);
    if (updateError) throw updateError;
    await loadConversations();
    if (next && !showArchived) {
      setInfoOpen(false);
      setMobileChatOpen(false);
    }
  }

  async function clearConversationForMe() {
    if (!user || !activeConversation) return;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("conversation_members")
      .update({ cleared_at: now, last_seen_at: now })
      .eq("conversation_id", activeConversation.conversation_id)
      .eq("user_id", user.id);
    if (updateError) throw updateError;
    setMessages([]);
    setReplyPreviews({});
    await loadConversations();
    setNotice("Chat history cleared for you.");
  }

  async function deleteConversationForMe() {
    if (!user || !activeConversation) return;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("conversation_members")
      .update({ hidden_at: now, archived_at: null, pinned_at: null, cleared_at: now, last_seen_at: now })
      .eq("conversation_id", activeConversation.conversation_id)
      .eq("user_id", user.id);
    if (updateError) throw updateError;
    setMessages([]);
    setReplyPreviews({});
    setActiveConversationId(null);
    setMobileChatOpen(false);
    await loadConversations();
    setNotice("Conversation removed from your list.");
  }

  async function openSavedMessage(conversationId: string, messageId: string, createdAt: string) {
    setSavedOpen(false);
    await openMessageFromSearch({
      message_id: messageId,
      conversation_id: conversationId,
      conversation_kind: "dm",
      conversation_title: "Saved message",
      sender_id: "",
      sender_name: "",
      body: "",
      created_at: createdAt,
    });
  }

  async function blockProfile(profile: Profile) {
    if (!user || profile.id === user.id || blockedUserIds.has(profile.id)) return;
    if (!window.confirm(`Block ${profile.display_name || `@${profile.username}`}? They will no longer be able to message you directly.`)) return;
    const { error: blockError } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: profile.id });
    if (blockError) { setError(blockError.message); return; }
    await loadBlockedUsers(user.id);
    setProfileTarget(null);
    setNotice("User blocked.");
  }

  async function installPulse() {
    if (installPrompt?.prompt) {
      await installPrompt.prompt();
      try { await installPrompt.userChoice; } catch { /* browser may omit userChoice */ }
      setInstallPrompt(null);
      return;
    }
    if (iosInstallHint) {
      setNotice("On iPhone/iPad: tap Share in Safari, then Add to Home Screen.");
    }
  }

  async function signOut() {
    if (presenceChannelRef.current) await presenceChannelRef.current.untrack();
    if (user) {
      try {
        const next = await disableDevicePush(user.id);
        setPushState(next);
      } catch (pushError) {
        console.warn("Could not remove this device push subscription during sign out:", pushError);
      }
    }
    try {
      const badgeNavigator = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      await badgeNavigator.clearAppBadge?.();
    } catch { /* unsupported */ }
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/");
  }

  if (!user || !me) {
    return <main className="loading-shell loading-shell-v8"><div className="loading-sidebar-v8"><span/><span/><span/><span/></div><div className="loading-chat-v8"><span/><span/><span/></div><p className="sr-only">Loading Tiger Chat…</p></main>;
  }

  return (
    <main className={`chat-shell-v5 ${mobileChatOpen && activeConversation ? "mobile-chat-open" : ""}`}>
      {!networkOnline && <div className="connection-banner-v8 offline">Offline — messages will stay ready to retry.</div>}
      {networkOnline && !realtimeConnected && <div className="connection-banner-v8">Reconnecting…</div>}
      <aside className="sidebar-v5">
        <header className="sidebar-header-v5">
          <div className="brand-lockup compact">
            <div className="brand-mark">P</div>
            <div><strong>Tiger Chat</strong><span>@{me.username}</span></div>
          </div>
          <div className="header-actions">
            <button type="button" className="icon-button" onClick={() => setGlobalSearchOpen(true)} title="Search chats and messages" aria-label="Search chats and messages">⌕</button>
            <button type="button" className="icon-button" onClick={() => setNewGroupOpen(true)} title="New group" aria-label="New group">＋</button>
            <button type="button" className="icon-button" onClick={() => { setSettingsInitialTab("profile"); setSettingsOpen(true); }} title="Settings" aria-label="Settings">⚙</button>
          </div>
        </header>

        <div className="search-box-v5">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find people…" aria-label="Find people" />
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

        <div className="sidebar-tools-v8">
          <button type="button" onClick={() => setRequestsOpen(true)}>Requests{messageRequests.length > 0 && <span>{messageRequests.length}</span>}</button>
          <button type="button" onClick={() => setSavedOpen(true)}>★ Saved</button>
          <button type="button" className={showArchived ? "active" : ""} onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Inbox" : "Archived"}</button>
          {(installPrompt || iosInstallHint) && <button type="button" onClick={() => void installPulse()}>Install app</button>}
        </div>

        <div className="conversation-heading-v5"><span>{showArchived ? "Archived" : "Messages"}</span><small>{visibleConversations.length}</small></div>
        <nav className="conversation-list-v5" aria-label="Conversations">
          {visibleConversations.length === 0 && <div className="empty-card sidebar-empty">{showArchived ? "No archived conversations." : "Search for someone or create a group to start chatting."}</div>}
          {visibleConversations.map((conversation) => (
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
                <span className="conversation-title-line"><strong>{conversation.title}</strong>{conversation.pinned_at && <small title="Pinned">⌖</small>}{conversation.kind === "group" && <small>{conversation.member_count}</small>}</span>
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
          <Avatar name={me.display_name || me.username} path={me.avatar_path} online={me.show_online_status} />
          <span><strong>{me.display_name}</strong><small>@{me.username}</small></span>
          <button type="button" className="icon-button" onClick={() => { setSettingsInitialTab("profile"); setSettingsOpen(true); }} aria-label="Open settings">⚙</button>
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
                        ? "Active now"
                        : formatLastSeen(activeOtherProfile?.last_active_at)}
                </span>
              </button>
              <button type="button" className="icon-button header-search-button" onClick={() => setChatSearchOpen(true)} aria-label="Search this conversation">⌕</button>
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
                  replyMessage={message.reply_to ? messages.find((candidate) => candidate.id === message.reply_to) ?? replyPreviews[message.reply_to] : undefined}
                  members={members}
                  highlighted={highlightMessageId === message.id}
                  isAdmin={isAdmin}
                  recentReactions={recentReactions}
                  onReply={setReplyTo}
                  onEdit={(target) => void editMessage(target)}
                  onDelete={(target) => void deleteMessage(target)}
                  onReact={(target, emoji) => void toggleReaction(target, emoji)}
                  onForward={setForwardMessage}
                  onSave={(target) => void toggleSavedMessage(target)}
                  onProfile={(target) => { if (target.sender) void openProfile(target.sender); }}
                  onImage={openImage}
                  onViewEdits={setEditHistoryMessage}
                  onRetry={(target) => void retryMessage(target)}
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
              <form className="composer-v5" onSubmit={sendMessage} onDragOver={(event) => event.preventDefault()} onDrop={dropAttachment}>
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
                    onPaste={pasteAttachment}
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
                  <button type="submit" className="send-button-v5" disabled={sending || (!draft.trim() && !selectedFile)}>Send</button>
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
        {notice && <button type="button" className="notice-toast-v8" onClick={() => setNotice("")}>{notice} ×</button>}
      </section>

      <SettingsModal
        open={settingsOpen}
        profile={me}
        email={user.email ?? ""}
        theme={theme}
        blockedProfiles={blockedProfiles}
        isAdmin={isAdmin}
        reports={reports}
        pushState={pushState}
        initialTab={settingsInitialTab}
        onClose={() => setSettingsOpen(false)}
        onThemeChange={setTheme}
        onSaveProfile={saveProfile}
        onSavePreferences={savePreferences}
        onEnableDevicePush={enableCurrentDevicePush}
        onDisableDevicePush={disableCurrentDevicePush}
        onUnblock={unblockUser}
        onUpdateReport={updateReport}
        onAdminTagChanged={(tag) => setMe((current) => current ? { ...current, admin_tag: tag } : current)}
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
          muted={activeMuted}
          onClose={() => setInfoOpen(false)}
          onToggleBlock={toggleBlock}
          onSetMute={setConversationMute}
          onPin={togglePinConversation}
          onArchive={toggleArchiveConversation}
          onClear={clearConversationForMe}
          onDeleteForMe={deleteConversationForMe}
          onOpenSharedMedia={() => { setInfoOpen(false); setSharedMediaOpen(true); }}
          onSearchChat={() => { setInfoOpen(false); setChatSearchOpen(true); }}
          onViewProfile={(profile) => void openProfile(profile)}
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

      <SearchModal
        open={globalSearchOpen}
        conversations={conversations}
        onClose={() => setGlobalSearchOpen(false)}
        onOpenConversation={openConversationFromSearch}
        onOpenMessage={(result) => void openMessageFromSearch(result)}
      />

      <MessageRequestsModal open={requestsOpen} requests={messageRequests} onClose={() => setRequestsOpen(false)} onRespond={respondMessageRequest} />

      <SavedMessagesModal open={savedOpen} onClose={() => setSavedOpen(false)} onOpenMessage={openSavedMessage} />

      {activeConversation && <ChatSearchModal
        open={chatSearchOpen}
        conversationId={activeConversation.conversation_id}
        conversationTitle={activeConversation.title}
        clearedAt={activeConversation.cleared_at}
        onClose={() => setChatSearchOpen(false)}
        onOpen={async (result) => { setChatSearchOpen(false); await openMessageFromSearch(result); }}
      />}

      {activeConversation && <SharedMediaModal
        open={sharedMediaOpen}
        conversationId={activeConversation.conversation_id}
        title={activeConversation.title}
        clearedAt={activeConversation.cleared_at}
        onClose={() => setSharedMediaOpen(false)}
        onImage={openImage}
      />}

      <ProfileModal
        open={Boolean(profileTarget)}
        profile={profileTarget}
        online={Boolean(profileTarget && onlineUserIds.has(profileTarget.id))}
        blocked={Boolean(profileTarget && blockedUserIds.has(profileTarget.id))}
        onClose={() => setProfileTarget(null)}
        onMessage={profileTarget && profileTarget.id !== user.id ? () => { const target = profileTarget; setProfileTarget(null); void startDm(target); } : undefined}
        onBlock={profileTarget && profileTarget.id !== user.id ? () => { const target = profileTarget; if (blockedUserIds.has(target.id)) void unblockUser(target.id).then(() => setProfileTarget(null)); else void blockProfile(target); } : undefined}
        onReport={profileTarget && profileTarget.id !== user.id ? () => { const target = profileTarget; setProfileTarget(null); setReportTarget({ label: target.display_name || target.username, userId: target.id, messageId: null }); } : undefined}
      />

      <EditHistoryModal messageId={editHistoryMessage?.id ?? null} currentBody={editHistoryMessage?.body ?? ""} onClose={() => setEditHistoryMessage(null)} />

      <ForwardModal message={forwardMessage} conversations={conversations} onClose={() => setForwardMessage(null)} onForward={forwardToConversation} />

      <ImageViewerModal open={Boolean(imageViewer)} images={imageViewer?.images ?? []} initialIndex={imageViewer?.initialIndex ?? 0} onClose={() => setImageViewer(null)} />

      <ReportModal
        open={Boolean(reportTarget)}
        targetLabel={reportTarget?.label ?? "this content"}
        onClose={() => setReportTarget(null)}
        onSubmit={submitReport}
      />
    </main>
  );
}
