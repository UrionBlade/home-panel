import type { ZigbeeDevice } from "@home-panel/shared";
import {
  BatteryFullIcon,
  BroadcastIcon,
  DoorIcon,
  DropIcon,
  PlusCircleIcon,
  PulseIcon,
  TrashIcon,
  WifiHighIcon,
  WifiSlashIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import {
  useZigbeeClosePermitJoin,
  useZigbeeLiveSync,
  useZigbeePermitJoin,
  useZigbeeRemoveDevice,
  useZigbeeRenameDevice,
  useZigbeeState,
} from "../lib/hooks/useZigbee";
import { useT } from "../lib/useT";

const PERMIT_JOIN_DURATION = 60;

function deviceIcon(d: ZigbeeDevice) {
  const desc = (d.description ?? "").toLowerCase();
  const model = (d.model ?? "").toLowerCase();
  if (desc.includes("door") || desc.includes("window") || model.startsWith("mccgq")) {
    return DoorIcon;
  }
  if (desc.includes("water") || desc.includes("leak")) return DropIcon;
  if (desc.includes("motion") || desc.includes("occupancy")) return PulseIcon;
  return BroadcastIcon;
}

function relativeTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 60_000) return locale.startsWith("it") ? "ora" : "now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return locale.startsWith("it") ? `${minutes} min fa` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale.startsWith("it") ? `${hours}h fa` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return locale.startsWith("it") ? `${days}g fa` : `${days}d ago`;
}

function StateLine({ device }: { device: ZigbeeDevice }) {
  const { t } = useT("zigbee");

  const lines: string[] = [];
  const state = device.state;

  for (const [key, val] of Object.entries(state)) {
    if (key === "battery" || key === "linkquality" || key === "voltage") continue;
    if (typeof val === "boolean") {
      const k = `state.${key}.${val ? "true" : "false"}`;
      const localized = t(k as never) as string;
      // i18next returns the key itself when missing; treat that as "no
      // localization available" and fall back to a generic on/off.
      if (localized && localized !== k) {
        lines.push(localized);
      } else {
        lines.push(`${key}: ${val ? "on" : "off"}`);
      }
    } else if (typeof val === "number") {
      lines.push(`${key}: ${Math.round(val * 100) / 100}`);
    } else if (typeof val === "string" && val.length < 32) {
      lines.push(`${key}: ${val}`);
    }
  }

  if (lines.length === 0) {
    return <p className="text-sm text-text-muted italic">{t("device.noState")}</p>;
  }
  return <p className="text-sm text-text-muted">{lines.slice(0, 3).join(" · ")}</p>;
}

function DeviceCard({
  device,
  onRename,
  onRemove,
}: {
  device: ZigbeeDevice;
  onRename: (d: ZigbeeDevice) => void;
  onRemove: (d: ZigbeeDevice) => void;
}) {
  const { t } = useT("zigbee");
  const Icon = deviceIcon(device);

  const availability = device.availability;
  const availabilityLabel =
    availability === "online"
      ? t("list.online")
      : availability === "offline"
        ? t("list.offline")
        : t("list.unknown");
  const availabilityClass =
    availability === "online"
      ? "text-emerald-600 dark:text-emerald-400"
      : availability === "offline"
        ? "text-rose-600 dark:text-rose-400"
        : "text-text-muted";

  return (
    <article className="rounded-2xl border border-border bg-surface-1 p-4 flex flex-col gap-3">
      <header className="flex items-start gap-3">
        <div className="shrink-0 size-11 rounded-xl bg-surface-2 grid place-items-center text-text">
          <Icon size={22} weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-medium text-text truncate">{device.friendlyName}</h3>
            <span className={`text-xs ${availabilityClass}`}>{availabilityLabel}</span>
          </div>
          <p className="text-xs text-text-muted truncate">
            {[device.vendor, device.model].filter(Boolean).join(" · ") || device.ieeeAddress}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onRename(device)}
            className="size-9 grid place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2"
            aria-label={t("device.rename")}
          >
            <PulseIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => onRemove(device)}
            className="size-9 grid place-items-center rounded-lg text-rose-500/80 hover:text-rose-500 hover:bg-rose-500/10"
            aria-label={t("device.remove")}
          >
            <TrashIcon size={18} />
          </button>
        </div>
      </header>

      <StateLine device={device} />

      <footer className="flex items-center gap-4 text-xs text-text-muted">
        {typeof device.battery === "number" && (
          <span className="inline-flex items-center gap-1">
            <BatteryFullIcon size={14} />
            {device.battery}%
          </span>
        )}
        {typeof device.linkQuality === "number" && (
          <span className="inline-flex items-center gap-1">
            <WifiHighIcon size={14} />
            {device.linkQuality}
          </span>
        )}
        {device.lastSeenAt && (
          <span className="ml-auto">
            {t("list.lastSeen")} {relativeTime(device.lastSeenAt, navigator.language)}
          </span>
        )}
      </footer>
    </article>
  );
}

export function ZigbeePage() {
  const { t } = useT("zigbee");
  const { t: tCommon } = useT("common");
  const stateQuery = useZigbeeState();
  useZigbeeLiveSync();
  const permitJoin = useZigbeePermitJoin();
  const closePermitJoin = useZigbeeClosePermitJoin();
  const renameMutation = useZigbeeRenameDevice();
  const removeMutation = useZigbeeRemoveDevice();

  const [removeTarget, setRemoveTarget] = useState<ZigbeeDevice | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const bridge = stateQuery.data?.bridge;
  const devices = useMemo(
    () =>
      [...(stateQuery.data?.devices ?? [])].sort((a, b) =>
        a.friendlyName.localeCompare(b.friendlyName),
      ),
    [stateQuery.data],
  );

  // Tick for permit-join countdown
  useEffect(() => {
    if (!bridge?.permitJoinUntil) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [bridge?.permitJoinUntil]);

  const permitJoinRemainingSeconds = bridge?.permitJoinUntil
    ? Math.max(0, Math.round((new Date(bridge.permitJoinUntil).getTime() - now) / 1_000))
    : 0;
  const permitJoinActive = permitJoinRemainingSeconds > 0;

  const handlePermitJoin = async () => {
    setFeedback(null);
    try {
      if (permitJoinActive) {
        await closePermitJoin.mutateAsync();
      } else {
        await permitJoin.mutateAsync(PERMIT_JOIN_DURATION);
      }
    } catch (err) {
      setFeedback(t("permitJoin.error", { message: errorMessage(err) }));
    }
  };

  const handleRename = async (device: ZigbeeDevice) => {
    const next = window.prompt(
      t("device.renamePrompt", { name: device.friendlyName }),
      device.friendlyName,
    );
    if (!next || next.trim() === device.friendlyName) return;
    try {
      await renameMutation.mutateAsync({
        ieeeAddress: device.ieeeAddress,
        friendlyName: next.trim(),
      });
    } catch (err) {
      setFeedback(t("device.renameError", { message: errorMessage(err) }));
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMutation.mutateAsync(removeTarget.ieeeAddress);
      setRemoveTarget(null);
    } catch (err) {
      setFeedback(t("device.removeError", { message: errorMessage(err) }));
      setRemoveTarget(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <button
            type="button"
            onClick={handlePermitJoin}
            disabled={permitJoin.isPending || closePermitJoin.isPending}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-medium transition ${
              permitJoinActive
                ? "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                : "bg-text text-bg hover:opacity-90"
            } disabled:opacity-50`}
          >
            <PlusCircleIcon size={18} weight={permitJoinActive ? "regular" : "fill"} />
            {permitJoinActive
              ? t("permitJoin.remaining", { seconds: permitJoinRemainingSeconds })
              : t("permitJoin.open")}
          </button>
        }
      />

      <BridgeBanner
        mqttConnected={bridge?.mqttConnected ?? false}
        z2mOnline={bridge?.z2mOnline ?? false}
      />

      {permitJoinActive && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {t("permitJoin.active")}
        </div>
      )}

      {feedback && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {feedback}
        </div>
      )}

      {stateQuery.isLoading ? (
        <p className="text-text-muted">{t("list.loading")}</p>
      ) : devices.length === 0 ? (
        <p className="text-text-muted">{t("list.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {devices.map((d) => (
            <DeviceCard
              key={d.ieeeAddress}
              device={d}
              onRename={handleRename}
              onRemove={setRemoveTarget}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={t("device.remove")}
        message={removeTarget ? t("device.removeConfirm", { name: removeTarget.friendlyName }) : ""}
        confirmLabel={tCommon("actions.delete")}
        cancelLabel={tCommon("actions.cancel")}
        destructive
        onConfirm={confirmRemove}
        onClose={() => setRemoveTarget(null)}
      />
    </PageContainer>
  );
}

function BridgeBanner({
  mqttConnected,
  z2mOnline,
}: {
  mqttConnected: boolean;
  z2mOnline: boolean;
}) {
  const { t } = useT("zigbee");
  if (mqttConnected && z2mOnline) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
        <WifiHighIcon size={16} />
        {t("bridge.online")}
      </div>
    );
  }
  if (!mqttConnected) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 inline-flex items-center gap-2">
        <WifiSlashIcon size={16} />
        {t("bridge.mqttDisconnected")}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 inline-flex items-center gap-2">
      <WifiSlashIcon size={16} />
      {t("bridge.z2mDown")}
    </div>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "errore sconosciuto";
}
