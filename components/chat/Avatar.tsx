import { initials } from "@/lib/chat-utils";

type AvatarProps = {
  name: string;
  path?: string | null;
  size?: "small" | "medium" | "large";
  online?: boolean;
};

export function Avatar({ name, size = "medium", online = false }: AvatarProps) {
  return (
    <span className={`avatar-wrap avatar-${size} tiger-initial-avatar`} aria-label={name} title="Tiger Chat uses text-only profiles">
      <span className="avatar" aria-hidden="true">{initials(name)}</span>
      {online && <span className="online-dot" aria-label="Online" />}
    </span>
  );
}
