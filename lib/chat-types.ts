export type Theme = "system" | "dark" | "light";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  created_at: string;
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
  last_read_at: string;
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
