import { useNavigate } from "react-router-dom";
import { useWasteToday, useWasteTomorrow, useWasteTypes } from "../../lib/hooks/useWaste";
import { TrashBinArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

const TONIGHT_CUTOFF_HOUR = 16;

export function WasteTile() {
  const navigate = useNavigate();
  const now = new Date();
  const showTonight = now.getHours() >= TONIGHT_CUTOFF_HOUR;
  const tonightQuery = useWasteToday();
  const tomorrowQuery = useWasteTomorrow();
  const { data: allTypes = [] } = useWasteTypes();

  const data = showTonight ? tonightQuery.data : tomorrowQuery.data;
  const heading = showTonight ? "Stasera" : "Domani";
  const types = data?.wasteTypes ?? [];

  const colorById = new Map<string, string>();
  for (const t of allTypes) colorById.set(t.id, t.color);

  return (
    <Tile size="md" onClick={() => navigate("/waste")} ariaLabel="Raccolta rifiuti">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 100%, var(--tile-sage-b) 0%, transparent 55%)",
          opacity: 0.55,
        }}
      />

      <div className="relative flex items-center gap-4 h-full z-10">
        <div className="flex flex-col justify-between h-full min-w-0 flex-1">
          <span className="label-mono text-text-muted">Raccolta</span>
          <div className="flex flex-col gap-1.5">
            <p className="font-display text-3xl leading-none font-black text-text">{heading}</p>
            {types.length === 0 ? (
              <p className="text-xs text-text-muted">Niente da portare fuori</p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {types.slice(0, 4).map((t) => (
                  <li
                    key={t.id}
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      backgroundColor: `color-mix(in oklch, ${colorById.get(t.id) ?? "oklch(50% 0 0)"} 22%, transparent)`,
                      color: `color-mix(in oklch, ${colorById.get(t.id) ?? "oklch(20% 0 0)"} 80%, oklch(15% 0 0))`,
                    }}
                  >
                    {t.displayName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <TrashBinArt size={110} className="shrink-0 pointer-events-none select-none" />
      </div>
    </Tile>
  );
}
