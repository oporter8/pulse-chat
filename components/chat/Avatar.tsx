import { avatarUrl, initials } from "@/lib/chat-utils";

type AvatarProps = {
  name: string;
  path?: string | null;
  size?: "small" | "medium" | "large";
  online?: boolean;
};

export function Avatar({ name, path, size = "medium", online = false }: AvatarProps) {
  const url = avatarUrl(path);

  return (
    <span className={`avatar-wrap avatar-${size}`} aria-label={name}>
      <span className="avatar">
        {url ? <img src={url} alt="" /> : initials(name)}
      </span>
      {online && <span className="online-dot" aria-label="Online" />}
    </span>
  );
}
