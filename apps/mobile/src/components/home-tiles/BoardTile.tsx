import { useNavigate } from "react-router-dom";
import { usePostits } from "../../lib/hooks/usePostits";
import { useT } from "../../lib/useT";
import { PostItStackArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

export function BoardTile() {
  const { t } = useT("board");
  const navigate = useNavigate();
  const { data: postits = [] } = usePostits();

  return (
    <Tile size="md" onClick={() => navigate("/board")} ariaLabel={t("title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 100%, var(--tile-mauve-b) 0%, transparent 55%)",
          opacity: 0.55,
        }}
      />

      <PostItStackArt
        size={74}
        className="absolute top-2 right-2 pointer-events-none select-none opacity-90 anim-sway"
      />
      <div className="relative flex flex-col justify-between h-full z-10 pr-20 md:pr-24">
        <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
          {t("title")}
        </span>
        {postits.length === 0 ? (
          <span className="font-display text-xl italic text-text-muted leading-tight">
            {t("tile.empty")}
          </span>
        ) : (
          <span
            className="font-display font-black tabular-nums leading-none text-text"
            style={{ fontSize: "clamp(3.5rem, 7vw, 5.75rem)" }}
          >
            {postits.length}
          </span>
        )}
      </div>
    </Tile>
  );
}
