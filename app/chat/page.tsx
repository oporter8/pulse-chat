"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string;
  created_at: string;
};

type Conversation = {
  conversation_id: string;
  other_user_id: string;
  username: string;
  last_message: string | null;
  last_message_at: string | null;
};

type Theme = "system" | "dark" | "light";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function initials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

export default function ChatPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsUsername, setSettingsUsername] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const activeChannelReadyRef = useRef(false);
  const presenceChannelReadyRef = useRef(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("pulse-theme");
    if (storedTheme === "dark" || storedTheme === "light" || storedTheme === "system") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }

    window.localStorage.setItem("pulse-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (me) {
      setSettingsUsername(me.username);
    }
  }, [me]);

  useEffect(() => {
    if (!settingsOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.conversation_id === activeConversationId,
      ) ?? null,
    [conversations, activeConversationId],
  );

  const loadConversations = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("get_my_conversations");

    if (loadError) {
      setError(loadError.message);
      return;
    }

    const next = (data ?? []) as Conversation[];
    setConversations(next);

    setActiveConversationId((current) => {
      if (
        current &&
        next.some((conversation) => conversation.conversation_id === current)
      ) {
        return current;
      }

      return next[0]?.conversation_id ?? null;
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError || !data.session) {
        router.replace("/");
        return;
      }

      setUser(data.session.user);

      // Needed for private Realtime channels that use RLS authorization.
      await supabase.realtime.setAuth(data.session.access_token);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, created_at")
        .eq("id", data.session.user.id)
        .single();

      if (!mounted) return;

      if (profileError) {
        setError(profileError.message);
        return;
      }

      setMe(profile as Profile);
      await loadConversations();
    }

    boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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
  }, [loadConversations, router]);

  // Global presence for signed-in users.
  useEffect(() => {
    if (!user || !me) return;

    const currentUser = user;
    const currentMe = me;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    presenceChannelReadyRef.current = false;

    async function connectPresence() {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (cancelled) return;

      if (sessionError || !data.session?.access_token) {
        setError("Your login session expired. Please sign in again.");
        return;
      }

      // Private Realtime channels need the authenticated user's JWT before subscribe().
      await supabase.realtime.setAuth(data.session.access_token);

      if (cancelled) return;

      channel = supabase.channel("school:presence", {
        config: {
          private: true,
          presence: {
            key: currentUser.id,
          },
        },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState();
          setOnlineUserIds(new Set(Object.keys(state)));
        })
        .on("presence", { event: "join" }, () => {
          if (!channel) return;
          const state = channel.presenceState();
          setOnlineUserIds(new Set(Object.keys(state)));
        })
        .on("presence", { event: "leave" }, () => {
          if (!channel) return;
          const state = channel.presenceState();
          setOnlineUserIds(new Set(Object.keys(state)));
        })
        .subscribe(async (status, channelError) => {
          if (!channel || cancelled) return;

          if (status === "SUBSCRIBED") {
            presenceChannelReadyRef.current = true;
            await channel.track({
              user_id: currentUser.id,
              username: currentMe.username,
              online_at: new Date().toISOString(),
            });
          }

          if (status === "CLOSED") {
            presenceChannelReadyRef.current = false;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            presenceChannelReadyRef.current = false;
            console.error("Presence channel error:", channelError);
          }
        });

      presenceChannelRef.current = channel;
    }

    void connectPresence();

    return () => {
      cancelled = true;
      presenceChannelReadyRef.current = false;

      if (channel) {
        void channel.untrack();
        void supabase.removeChannel(channel);
      }

      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }
    };
  }, [me, user]);

  // Current conversation: messages + ephemeral typing broadcasts.
  useEffect(() => {
    setOtherUserTyping(false);
    activeChannelReadyRef.current = false;

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    typingSentRef.current = false;

    if (!activeConversationId || !user) {
      setMessages([]);
      return;
    }

    const currentUser = user;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function loadMessages() {
      setError("");

      const { data, error: messagesError } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, edited_at")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(250);

      if (messagesError) {
        setError(messagesError.message);
        return;
      }

      setMessages((data ?? []) as Message[]);
    }

    async function connectConversation() {
      await loadMessages();

      const { data, error: sessionError } = await supabase.auth.getSession();

      if (cancelled) return;

      if (sessionError || !data.session?.access_token) {
        setError("Your login session expired. Please sign in again.");
        return;
      }

      // Refresh the JWT immediately before joining the private topic.
      await supabase.realtime.setAuth(data.session.access_token);

      if (cancelled) return;

      if (activeChannelRef.current) {
        await supabase.removeChannel(activeChannelRef.current);
      }

      channel = supabase
        .channel(`conversation:${activeConversationId}`, {
          config: {
            private: true,
          },
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${activeConversationId}`,
          },
          (payload) => {
            const incoming = payload.new as Message;

            setMessages((current) =>
              current.some((message) => message.id === incoming.id)
                ? current
                : [...current, incoming],
            );

            void loadConversations();
          },
        )
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload.user_id === currentUser.id) return;
          setOtherUserTyping(Boolean(payload.is_typing));
        })
        .subscribe((status, channelError) => {
          if (cancelled) return;

          if (status === "SUBSCRIBED") {
            activeChannelReadyRef.current = true;
          }

          if (status === "CLOSED") {
            activeChannelReadyRef.current = false;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            activeChannelReadyRef.current = false;
            console.error("Conversation channel error:", channelError);
            setError("Realtime connection failed. Run supabase/realtime.sql, then refresh.");
          }
        });

      activeChannelRef.current = channel;
    }

    void connectConversation();

    return () => {
      cancelled = true;
      activeChannelReadyRef.current = false;

      if (channel) {
        void supabase.removeChannel(channel);
      }

      if (activeChannelRef.current === channel) {
        activeChannelRef.current = null;
      }
    };
  }, [activeConversationId, loadConversations, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherUserTyping]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const query = search.trim().toLowerCase();

      if (query.length < 2 || !user) {
        setSearchResults([]);
        return;
      }

      setSearching(true);

      const { data, error: searchError } = await supabase
        .from("profiles")
        .select("id, username, created_at")
        .ilike("username", `%${query}%`)
        .neq("id", user.id)
        .limit(8);

      if (searchError) {
        setError(searchError.message);
      }

      setSearchResults((data ?? []) as Profile[]);
      setSearching(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [search, user]);

  async function startDm(profile: Profile) {
    setError("");

    const { data, error: dmError } = await supabase.rpc("start_dm", {
      other_user: profile.id,
    });

    if (dmError) {
      setError(dmError.message);
      return;
    }

    setSearch("");
    setSearchResults([]);
    await loadConversations();
    setActiveConversationId(data as string);
  }

  function sendTypingState(isTyping: boolean) {
    if (!activeChannelRef.current || !activeChannelReadyRef.current || !user || !me) return;

    void activeChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: user.id,
        username: me.username,
        is_typing: isTyping,
      },
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

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }

    if (hasText) {
      typingTimerRef.current = window.setTimeout(() => {
        if (typingSentRef.current) {
          typingSentRef.current = false;
          sendTypingState(false);
        }
      }, 1200);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    const body = draft.trim();

    if (!body || !activeConversationId || !user) return;

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    if (typingSentRef.current) {
      typingSentRef.current = false;
      sendTypingState(false);
    }

    setDraft("");

    const { error: sendError } = await supabase.from("messages").insert({
      conversation_id: activeConversationId,
      sender_id: user.id,
      body,
    });

    if (sendError) {
      setDraft(body);
      setError(sendError.message);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();

    if (!user || !me) return;

    const cleanUsername = settingsUsername.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setSettingsMessage(
        "Username must be 3–20 characters using letters, numbers, or underscores.",
      );
      return;
    }

    if (cleanUsername === me.username) {
      setSettingsMessage("Settings saved.");
      return;
    }

    setSavingSettings(true);
    setSettingsMessage("");

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ username: cleanUsername })
      .eq("id", user.id);

    if (updateError) {
      setSettingsMessage(
        updateError.code === "23505"
          ? "That username is already taken."
          : updateError.message,
      );
      setSavingSettings(false);
      return;
    }

    // Keep Auth metadata in sync with the profile table.
    await supabase.auth.updateUser({
      data: { username: cleanUsername },
    });

    setMe({ ...me, username: cleanUsername });
    setSettingsMessage("Settings saved.");
    setSavingSettings(false);
  }

  async function signOut() {
    if (presenceChannelRef.current) {
      await presenceChannelRef.current.untrack();
    }

    await supabase.auth.signOut();
    router.replace("/");
  }

  if (!user || !me) {
    return (
      <main className="loading-shell">
        <div className="spinner" />
        <p>Loading Pulse Chat…</p>
      </main>
    );
  }

  return (
    <main className="chat-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-lockup compact">
            <div className="brand-mark">P</div>
            <div>
              <strong>Pulse Chat</strong>
              <span>@{me.username}</span>
            </div>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={() => {
              setSettingsMessage("");
              setSettingsOpen(true);
            }}
            title="Settings"
            aria-label="Open settings"
          >
            ⚙
          </button>
        </div>

        <div className="user-search">
          <label htmlFor="user-search">Start a chat</label>
          <input
            id="user-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search usernames…"
          />

          {(searching || searchResults.length > 0) && (
            <div className="search-results">
              {searching && <p>Searching…</p>}

              {!searching &&
                searchResults.map((profile) => {
                  const online = onlineUserIds.has(profile.id);

                  return (
                    <button
                      type="button"
                      key={profile.id}
                      onClick={() => startDm(profile)}
                    >
                      <span className="avatar-wrap">
                        <span className="avatar small">
                          {initials(profile.username)}
                        </span>
                        {online && <span className="online-dot" />}
                      </span>
                      <span>@{profile.username}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        <div className="conversation-label">Messages</div>

        <nav className="conversation-list" aria-label="Direct messages">
          {conversations.length === 0 && (
            <p className="empty-sidebar">
              Search for another user to start your first conversation.
            </p>
          )}

          {conversations.map((conversation) => {
            const online = onlineUserIds.has(conversation.other_user_id);

            return (
              <button
                type="button"
                key={conversation.conversation_id}
                className={
                  conversation.conversation_id === activeConversationId
                    ? "conversation active"
                    : "conversation"
                }
                onClick={() =>
                  setActiveConversationId(conversation.conversation_id)
                }
              >
                <span className="avatar-wrap">
                  <span className="avatar">{initials(conversation.username)}</span>
                  {online && <span className="online-dot" />}
                </span>

                <span className="conversation-copy">
                  <strong>@{conversation.username}</strong>
                  <span>
                    {online
                      ? "Online"
                      : conversation.last_message ?? "No messages yet"}
                  </span>
                </span>

                {conversation.last_message_at && (
                  <time>{formatTime(conversation.last_message_at)}</time>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="settings-button"
            onClick={() => {
              setSettingsMessage("");
              setSettingsOpen(true);
            }}
          >
            <span aria-hidden="true">⚙</span>
            <span className="settings-button-copy">Settings</span>
          </button>
        </div>
      </aside>

      <section className="chat-panel">
        {activeConversation ? (
          <>
            <header className="chat-header">
              <span className="avatar-wrap">
                <span className="avatar">
                  {initials(activeConversation.username)}
                </span>
                {onlineUserIds.has(activeConversation.other_user_id) && (
                  <span className="online-dot" />
                )}
              </span>

              <div>
                <strong>@{activeConversation.username}</strong>
                <span>
                  {onlineUserIds.has(activeConversation.other_user_id)
                    ? "Online"
                    : "Offline"}
                </span>
              </div>
            </header>

            <div className="messages" aria-live="polite">
              {messages.length === 0 && (
                <div className="empty-chat">
                  <span className="avatar large">
                    {initials(activeConversation.username)}
                  </span>
                  <h2>@{activeConversation.username}</h2>
                  <p>This is the beginning of your conversation.</p>
                </div>
              )}

              {messages.map((message, index) => {
                const mine = message.sender_id === user.id;
                const previous = messages[index - 1];
                const grouped =
                  previous &&
                  previous.sender_id === message.sender_id &&
                  new Date(message.created_at).getTime() -
                    new Date(previous.created_at).getTime() <
                    5 * 60 * 1000;

                return (
                  <div
                    key={message.id}
                    className={`message-row ${mine ? "mine" : ""} ${
                      grouped ? "grouped" : ""
                    }`}
                  >
                    {!grouped && !mine && (
                      <span className="avatar small">
                        {initials(activeConversation.username)}
                      </span>
                    )}

                    <div className="message-stack">
                      {!grouped && (
                        <div className="message-meta">
                          <strong>
                            {mine
                              ? `@${me.username}`
                              : `@${activeConversation.username}`}
                          </strong>
                          <time>{formatTime(message.created_at)}</time>
                        </div>
                      )}

                      <div className="message-bubble">{message.body}</div>
                    </div>
                  </div>
                );
              })}

              {otherUserTyping && (
                <div className="typing-row" aria-label="User is typing">
                  <span className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>@{activeConversation.username} is typing…</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input
                value={draft}
                onChange={(event) => updateDraft(event.target.value)}
                placeholder={`Message @${activeConversation.username}`}
                maxLength={2000}
                aria-label={`Message @${activeConversation.username}`}
              />
              <button type="submit" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="welcome-panel">
            <div className="brand-mark large-mark">P</div>
            <h2>Your messages</h2>
            <p>
              Search for a username on the left to start a realtime
              conversation.
            </p>
          </div>
        )}

        {settingsOpen && (
          <div
            className="settings-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setSettingsOpen(false);
            }}
          >
            <section
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
            >
              <div className="settings-heading">
                <div>
                  <h2 id="settings-title">Settings</h2>
                  <p>Manage your Pulse account and appearance.</p>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close settings"
                >
                  ×
                </button>
              </div>

              <form className="settings-form" onSubmit={saveSettings}>
                <div className="settings-section">
                  <h3>Profile</h3>

                  <label>
                    Username
                    <input
                      value={settingsUsername}
                      onChange={(event) => setSettingsUsername(event.target.value)}
                      maxLength={20}
                      autoComplete="username"
                    />
                    <span>3–20 characters. Letters, numbers, and underscores.</span>
                  </label>

                  <label>
                    Email
                    <input value={user.email ?? ""} disabled />
                  </label>
                </div>

                <div className="settings-section">
                  <h3>Appearance</h3>

                  <label>
                    Theme
                    <select
                      value={theme}
                      onChange={(event) => setTheme(event.target.value as Theme)}
                    >
                      <option value="system">System</option>
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </label>
                </div>

                {settingsMessage && (
                  <p className="settings-message" aria-live="polite">
                    {settingsMessage}
                  </p>
                )}

                <div className="settings-actions">
                  <button
                    className="secondary-button danger-button"
                    type="button"
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={savingSettings}
                  >
                    {savingSettings ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {error && (
          <button
            className="error-toast"
            type="button"
            onClick={() => setError("")}
          >
            {error} ×
          </button>
        )}
      </section>
    </main>
  );
}
