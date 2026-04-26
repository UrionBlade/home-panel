import { BellRingingIcon, CheckCircleIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  isTauriPlatform,
  usePushDevices,
  useRemovePushDevice,
  useTestPush,
  useThisDeviceRegistered,
} from "../../lib/hooks/usePush";
import { useT } from "../../lib/useT";
import { useUiStore } from "../../store/ui-store";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 60_000) return "ora";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.round(hours / 24);
  return `${days}g fa`;
}

export function PushSettings() {
  const { t } = useT("alarm");
  const { data, isLoading } = usePushDevices();
  const removeDevice = useRemovePushDevice();
  const testPush = useTestPush();
  const pushToast = useUiStore((s) => s.pushToast);
  const thisDeviceRegistered = useThisDeviceRegistered(data?.devices ?? []);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onTest = async () => {
    try {
      const res = await testPush.mutateAsync(undefined);
      const okCount = res.results.filter((r) => r.ok).length;
      pushToast({
        tone: okCount > 0 ? "success" : "danger",
        text:
          okCount > 0
            ? t("push.testSent", { count: okCount, defaultValue: "Notifica inviata" })
            : t("push.testFailed", {
                defaultValue: "Invio fallito su tutti i device",
              }),
      });
    } catch (err) {
      pushToast({
        tone: "danger",
        text: err instanceof Error ? err.message : "errore",
      });
    }
  };

  const onRemove = async (id: string) => {
    setPendingId(id);
    try {
      await removeDevice.mutateAsync(id);
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) return null;

  const apnsConfigured = data?.apnsConfigured ?? false;
  const devices = data?.devices ?? [];

  return (
    <section className="flex flex-col gap-4" id="push">
      <h2 className="font-display text-3xl">
        {t("push.title", { defaultValue: "Notifiche push" })}
      </h2>

      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <div className="flex items-center gap-3">
          <BellRingingIcon size={24} weight="duotone" className="text-accent" />
          <h3 className="font-display text-xl">APNs</h3>
          {apnsConfigured ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircleIcon size={14} weight="fill" />
              {t("push.backendReady", { defaultValue: "Backend pronto" })}
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <WarningIcon size={14} weight="fill" />
              {t("push.backendNotConfigured", {
                defaultValue: "Backend non ancora configurato",
              })}
            </span>
          )}
        </div>

        {!apnsConfigured && (
          <p className="text-sm text-text-muted leading-relaxed">
            {t("push.setupHint", {
              defaultValue:
                "Per ricevere le notifiche fuori dall'app servono le chiavi APNs di Apple Developer (vedi README). Senza, le notifiche arrivano solo quando il pannello è aperto.",
            })}
          </p>
        )}

        {!isTauriPlatform() && (
          <p className="text-sm text-text-muted leading-relaxed italic">
            {t("push.webOnlyHint", {
              defaultValue:
                "Le push richiedono l'app TestFlight su iOS — qui sul browser non c'è APNs.",
            })}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-muted">
            {devices.length === 0
              ? t("push.noDevices", { defaultValue: "Nessun device registrato" })
              : t("push.deviceCount", {
                  count: devices.length,
                  defaultValue: `${devices.length} device registrato/i`,
                })}
          </span>
          {devices.length > 0 && (
            <button
              type="button"
              onClick={onTest}
              disabled={testPush.isPending || !apnsConfigured}
              className="inline-flex items-center gap-2 rounded-lg bg-text text-bg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {t("push.sendTest", { defaultValue: "Invia notifica di prova" })}
            </button>
          )}
        </div>

        {devices.length > 0 && (
          <ul className="flex flex-col gap-2">
            {devices.map((d) => {
              const isThis = thisDeviceRegistered && /* simple guard: */ true;
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-surface-1 px-3 py-2.5"
                >
                  <BellRingingIcon size={18} className="text-text-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text truncate">
                      {d.label ?? `${d.platform.toUpperCase()} · ${d.token.slice(0, 8)}…`}
                    </p>
                    <p className="text-xs text-text-muted">
                      {t("push.lastSeen", {
                        when: relativeTime(d.lastSeenAt),
                        defaultValue: `Visto ${relativeTime(d.lastSeenAt)}`,
                      })}
                      {isThis && (
                        <>
                          {" · "}
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {t("push.thisDevice", { defaultValue: "questo device" })}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(d.id)}
                    disabled={pendingId === d.id}
                    className="size-9 grid place-items-center rounded-lg text-rose-500/80 hover:text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                    aria-label={t("push.remove", { defaultValue: "Rimuovi" })}
                  >
                    <TrashIcon size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
