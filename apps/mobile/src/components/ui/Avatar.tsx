import clsx from "clsx";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  accentColor?: string | null;
  size?: AvatarSize;
}

const sizeClass: Record<AvatarSize, string> = {
  sm: "w-10 h-10 text-sm",
  md: "w-14 h-14 text-base",
  lg: "w-20 h-20 text-xl",
  xl: "w-28 h-28 text-3xl",
};

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function Avatar({ name, imageUrl, accentColor, size = "md" }: AvatarProps) {
  const initials = getInitials(name);
  const bg = accentColor ?? "var(--color-accent)";

  return (
    <span
      role="img"
      className={clsx(
        "inline-flex items-center justify-center rounded-full font-display font-medium select-none border border-border",
        sizeClass[size],
      )}
      style={{
        backgroundColor: imageUrl ? undefined : bg,
        color: imageUrl ? undefined : "var(--color-accent-foreground)",
        backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      aria-label={name}
    >
      {!imageUrl && initials}
    </span>
  );
}
