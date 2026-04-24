import type { LightSummary } from "@home-panel/shared";
import {
  ArrowsClockwiseIcon,
  GearIcon,
  LightbulbFilamentIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LightbulbArt } from "../components/illustrations/TileArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import {
  useEwelinkCredentials,
  useLightCommand,
  useLights,
  useSyncLights,
} from "../lib/hooks/useLights";
import { useRooms } from "../lib/hooks/useRooms";
import { useT } from "../lib/useT";

/* ------------------------------------------------------------------------ */
/*  Card                                                                     */
/* ------------------------------------------------------------------------ */

function LightCard({ light }: { light: LightSummary }) {
  const { t } = useT("lights");
  const command = useLightCommand();
  const isOn = light.state === "on";
  const isUnknown = light.state === "unknown";

  /* One-tap toggle: the switch IS the card. No secondary actions to compete
   * with the primary intent. */
  const handleToggle = () => {
    command.mutate({ id: light.id, toggle: true });
  };

  return (
    <motion.button
      type="button"
      onClick={handleToggle}
      disabled={command.isPending}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.97 }}
      aria-pressed={isOn}
      aria-label={
        isOn ? `${light.name} — ${t("actions.turnOff")}` : `${light.name} — ${t("actions.turnOn")}`
      }
      className={`relative flex flex-col gap-3 rounded-md border p-5 text-left transition-all min-h-[8rem] ${
        isOn
          ? "bg-accent/10 border-accent/50 shadow-[0_0_0_1px_var(--tw-gradient-to,transparent)]"
          : "bg-surface-elevated border-border hover:border-accent/40"
      } disabled:opacity-60`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`p-2.5 rounded-md transition-colors ${
            isOn ? "bg-accent/20 text-accent" : "bg-surface text-text-muted"
          }`}
        >
          <LightbulbFilamentIcon size={26} weight={isOn ? "fill" : "duotone"} />
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isOn
              ? "bg-accent/20 text-accent"
              : isUnknown
                ? "bg-warning/15 text-warning"
                : "bg-surface text-text-subtle"
          }`}
        >
          {t(`states.${light.state}`)}
        </span>
      </div>

      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-display text-lg font-medium text-text truncate">{light.name}</span>
        {light.room && <span className="text-xs text-text-subtle truncate">{light.room}</span>}
      </div>
    </motion.button>
  );
}

/* ------------------------------------------------------------------------ */
/*  Page                                                                     */
/* ------------------------------------------------------------------------ */

export function LightsPage() {
  const { t } = useT("lights");
  const navigate = useNavigate();
  const { data: lights = [], isLoading } = useLights();
  const { data: credentials } = useEwelinkCredentials();
  const { data: rooms = [] } = useRooms();
  const sync = useSyncLights();

  const lightsByRoom = useMemo(() => {
    /* Resolve each light's display room by preferring the FK `roomId`
     * (set via Settings → Rooms) and falling back to the legacy free-text
     * `light.room` for pre-migration rows. Lights whose roomId no longer
     * exists (orphans) also land in "__unassigned__". */
    const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));
    const groups = new Map<string, LightSummary[]>();
    for (const l of lights) {
      const resolved = (l.roomId ? roomNameById.get(l.roomId) : null) ?? l.room ?? null;
      const key = resolved ?? "__unassigned__";
      const arr = groups.get(key) ?? [];
      arr.push(l);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      /* Unassigned sinks to the bottom so named rooms lead. */
      if (a === "__unassigned__") return 1;
      if (b === "__unassigned__") return -1;
      return a.localeCompare(b);
    });
  }, [lights, rooms]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <SpinnerIcon size={32} className="animate-spin text-text-muted" />
      </div>
    );
  }

  /* Not configured — push users to settings before showing the empty grid. */
  if (credentials && !credentials.configured) {
    return (
      <PageContainer>
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          artwork={<LightbulbArt size={96} />}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto mt-16 flex flex-col items-center gap-5 text-center"
        >
          <LightbulbArt size={140} className="opacity-75 anim-drift" />
          <h2 className="font-display text-2xl text-text">{t("notConfigured.title")}</h2>
          <p className="text-text-muted">{t("notConfigured.body")}</p>
          <button
            type="button"
            onClick={() => navigate("/settings#lights")}
            className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90"
          >
            <GearIcon size={18} weight="bold" />
            {t("notConfigured.cta")}
          </button>
        </motion.div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        artwork={<LightbulbArt size={96} />}
        actions={
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-2 rounded-md bg-surface-elevated border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent disabled:opacity-50 min-h-[2.75rem]"
          >
            <ArrowsClockwiseIcon
              size={16}
              weight="bold"
              className={sync.isPending ? "animate-spin" : ""}
            />
            {t("actions.sync")}
          </button>
        }
      />

      {lights.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto mt-16 flex flex-col items-center gap-5 text-center"
        >
          <LightbulbArt size={140} className="opacity-75 anim-drift" />
          <h2 className="font-display text-2xl text-text">{t("empty.noneAdopted.title")}</h2>
          <p className="text-text-muted">{t("empty.noneAdopted.body")}</p>
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <ArrowsClockwiseIcon
              size={18}
              weight="bold"
              className={sync.isPending ? "animate-spin" : ""}
            />
            {t("empty.noneAdopted.cta")}
          </button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-8">
          {lightsByRoom.map(([roomKey, roomLights]) => (
            <section key={roomKey} className="flex flex-col gap-3">
              <h2 className="label-italic text-lg text-text-muted">
                {roomKey === "__unassigned__" ? t("rooms.unassigned") : roomKey}
              </h2>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {roomLights.map((light) => (
                  <LightCard key={light.id} light={light} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
