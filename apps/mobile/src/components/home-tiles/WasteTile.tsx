import { useNavigate } from "react-router-dom";
import { useWasteTomorrow, useWasteTypes } from "../../lib/hooks/useWaste";
import { useT } from "../../lib/useT";
import { TrashBinArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

const TONIGHT_CUTOFF_HOUR = 16;

export function WasteTile() {
  const { t: tWaste } = useT("waste");
  const navigate = useNavigate();
  const now = new Date();
  const showTonight = now.getHours() >= TONIGHT_CUTOFF_HOUR;
  const tomorrowQuery = useWasteTomorrow();
  const { data: allTypes = [] } = useWasteTypes();

  /* Both framings point to tomorrow's pickup: at 14:00 "Domani" warns "plan
   * for tomorrow", at 21:00 "Stasera" prompts "put these out tonight".
   * Showing today's data at 21:00 would be misleading — today's truck came
   * this morning. */
  const data = tomorrowQuery.data;
  const heading = showTonight ? "Stasera" : "Domani";
  const types = data?.wasteTypes ?? [];

  const colorById = new Map<string, string>();
  for (const t of allTypes) colorById.set(t.id, t.color);

  return (
    <Tile size="md" onClick={() => navigate("/settings#waste")} ariaLabel="Raccolta rifiuti">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 100%, var(--tile-sage-b) 0%, transparent 55%)",
          opacity: 0.55,
        }}
      />

      <TrashBinArt
        size={74}
        className="absolute top-2 right-2 pointer-events-none select-none opacity-90"
      />
      <div className="relative flex flex-col justify-between h-full z-10 pr-20 md:pr-24">
        <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
          {tWaste("tileLabel")}
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="font-display text-3xl leading-none font-black text-text">{heading}</p>
          {types.length === 0 ? (
            <p className="text-xs text-text-muted">Niente da portare fuori</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {types.slice(0, 4).map((type) => (
                <li
                  key={type.id}
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{
                    backgroundColor: `color-mix(in oklch, ${colorById.get(type.id) ?? "oklch(50% 0 0)"} 22%, transparent)`,
                    color: `color-mix(in oklch, ${colorById.get(type.id) ?? "oklch(20% 0 0)"} 80%, oklch(15% 0 0))`,
                  }}
                >
                  {type.displayName}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Tile>
  );
}
