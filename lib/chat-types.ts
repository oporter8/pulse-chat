export type Theme = "system" | "dark" | "light";
export type DmPrivacy = "everyone" | "mutual_groups" | "nobody";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  admin_tag: string | null;
  created_at: string;
};

export type MyProfile = Profile & {
  dm_privacy: DmPrivacy;
  show_read_receipts: boolean;
  show_online_status: boolean;
  notifications_enabled: boolean;
  notification_preview: boolean;
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
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  last_read_at: string | null;
  muted_until: string | null;
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
  sender?: Profile;
  attachments: Attachment[];
  reactions: Reaction[];
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
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
};
