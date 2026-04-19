import type { PostitColor } from "@home-panel/shared";

interface PostitCardProps {
  title: string | null;
  body: string | null;
  color: PostitColor;
}

const COLOR_MAP: Record<PostitColor, string> = {
  amber: "oklch(88% 0.08 85)",
  terracotta: "oklch(78% 0.10 45)",
  sage: "oklch(82% 0.06 145)",
  sand: "oklch(88% 0.04 75)",
  mauve: "oklch(80% 0.06 310)",
  ochre: "oklch(82% 0.10 70)",
};

export { COLOR_MAP as POSTIT_COLOR_MAP };

export function PostitCard({ title, body, color }: PostitCardProps) {
  const bg = COLOR_MAP[color];

  return (
    <div
      className="min-w-[120px] max-w-[220px] min-h-[60px] rounded-xl p-4 flex flex-col gap-1.5 select-none overflow-hidden"
      style={{
        backgroundColor: bg,
        boxShadow: "0 4px 16px oklch(30% 0.04 60 / 0.18)",
        color: "oklch(25% 0.02 60)",
      }}
    >
      {title && (
        <h3 className="font-display font-medium text-base leading-tight line-clamp-2">{title}</h3>
      )}
      {body && (
        <p className="text-sm leading-relaxed opacity-80 line-clamp-5 whitespace-pre-wrap">
          {body}
        </p>
      )}
    </div>
  );
}
