export type Theme = "system" | "dark" | "light";
export type DmPrivacy = "everyone" | "requests" | "mutual_groups" | "nobody";
export type NotificationSound = "default" | "soft" | "pop" | "none";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  admin_tag: string | null;
  status_text: string;
  last_active_at: string | null;
  created_at: string;
};

export type MyProfile = Profile & {
  dm_privacy: DmPrivacy;
  show_read_receipts: boolean;
  show_online_status: boolean;
  notifications_enabled: boolean;
  notification_preview: boolean;
  notification_sound: NotificationSound;
};

export type Conversation = {
  conversation_id: string;
  kind: "dm" | "group";
  title: string;
  avatar_path: string | null;
  other_user_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  member_count: number;
  pinned_at?: string | null;
  archived_at?: string | null;
  cleared_at?: string | null;
  hidden_at?: string | null;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  last_read_at: string | null;
  muted_until: string | null;
  pinned_at?: string | null;
  archived_at?: string | null;
  cleared_at?: string | null;
  hidden_at?: string | null;
  profile: Profile;
};

export type Attachment = {
  id: string;
  message_id: string;
  uploader_id: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
  signed_url?: string;
};

export type Receipt = {
  message_id: string;
  user_id: string;
  delivered_at: string;
  read_at: string | null;
};

export type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to: string | null;
  forwarded_from: string | null;
  client_id: string | null;
  sender?: Profile;
  attachments: Attachment[];
  reactions: Reaction[];
  receipts: Receipt[];
  saved?: boolean;
  local_status?: "sending" | "failed";
};

export type MessageSearchResult = {
  message_id: string;
  conversation_id: string;
  conversation_kind: "dm" | "group";
  conversation_title: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

export type Report = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  message_id: string | null;
  reason: "spam" | "harassment" | "impersonation" | "inappropriate" | "other";
  details: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type AdminUser = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  admin_tag: string | null;
  status_text: string;
  last_active_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
};


export type DmRequest = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  sender?: Profile;
};

export type DeviceSession = {
  id: string;
  user_id: string;
  device_key: string;
  device_name: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export type AccountEvent = {
  id: string;
  event_type: "new_device" | "device_revoked" | "email_change" | "password_change";
  detail: string;
  created_at: string;
};

export type MessageEdit = {
  id: string;
  message_id: string;
  editor_id: string;
  old_body: string;
  edited_at: string;
};
