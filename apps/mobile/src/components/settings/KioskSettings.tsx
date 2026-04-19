import { AnimatePresence } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import {
  useKioskPhotos,
  useKioskSettings,
  useRefreshKioskPhotos,
  useUpdateKioskSettings,
} from "../../lib/hooks/useKioskSettings";
import { useNightMode } from "../../lib/kiosk/NightModeProvider";
import { useT } from "../../lib/useT";
import { useUiStore } from "../../store/ui-store";
import { ScreensaverOverlay } from "../kiosk/ScreensaverOverlay";
import { Button } from "../ui/Button";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function KioskSettings() {
  const { t } = useT("kiosk");
  const { data: settings } = useKioskSettings();
  const { data: photos } = useKioskPhotos();
  const update = useUpdateKioskSettings();
  const refreshPhotos = useRefreshKioskPhotos();
  const pushToast = useUiStore((s) => s.pushToast);
  const { setForceNight } = useNightMode();
  const [showTestScreensaver, setShowTestScreensaver] = useState(false);

  const photoUrls = useMemo(() => (photos ?? []).map((p) => p.url), [photos]);

  const handleRefreshPhotos = useCallback(() => {
    refreshPhotos.mutate(undefined, {
      onSuccess: () => {
        pushToast({ tone: "success", text: t("screensaver.photosRefreshed") });
      },
    });
  }, [refreshPhotos, pushToast, t]);

  const handleTestNightMode = useCallback(() => {
    setForceNight(true);
    setTimeout(() => setForceNight(null), 30_000);
  }, [setForceNight]);

  if (!settings) return null;

  return (
    <section className="flex flex-col gap-8">
      <h2 className="font-display text-3xl">{t("title")}</h2>

      {/* Night mode */}
      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <h3 className="font-display text-xl">{t("nightMode.title")}</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.nightModeEnabled}
            onChange={(e) => update.mutate({ nightModeEnabled: e.target.checked })}
            className="w-5 h-5 accent-accent"
          />
          <span>{t("nightMode.enabled")}</span>
        </label>

        {settings.nightModeEnabled && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="night-start-hour" className="text-sm text-text-muted">
                {t("nightMode.start")}
              </label>
              <select
                id="night-start-hour"
                value={settings.nightStartHour}
                onChange={(e) => update.mutate({ nightStartHour: Number(e.target.value) })}
                className="rounded-sm border border-border bg-surface px-3 py-2 text-text"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="night-end-hour" className="text-sm text-text-muted">
                {t("nightMode.end")}
              </label>
              <select
                id="night-end-hour"
                value={settings.nightEndHour}
                onChange={(e) => update.mutate({ nightEndHour: Number(e.target.value) })}
                className="rounded-sm border border-border bg-surface px-3 py-2 text-text"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <label htmlFor="night-brightness" className="text-sm text-text-muted">
                {t("nightMode.brightness")} ({Math.round(settings.nightBrightness * 100)}%)
              </label>
              <input
                id="night-brightness"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.nightBrightness}
                onChange={(e) => update.mutate({ nightBrightness: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          </div>
        )}
      </div>

      {/* Screensaver */}
      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <h3 className="font-display text-xl">{t("screensaver.title")}</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.screensaverEnabled}
            onChange={(e) => update.mutate({ screensaverEnabled: e.target.checked })}
            className="w-5 h-5 accent-accent"
          />
          <span>{t("screensaver.enabled")}</span>
        </label>

        {settings.screensaverEnabled && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="screensaver-idle-minutes" className="text-sm text-text-muted">
                {t("screensaver.idleMinutes")}
              </label>
              <input
                id="screensaver-idle-minutes"
                type="number"
                min={1}
                max={60}
                value={settings.screensaverIdleMinutes}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 1) update.mutate({ screensaverIdleMinutes: val });
                }}
                className="w-24 rounded-sm border border-border bg-surface px-3 py-2 text-text"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshPhotos}
                isLoading={refreshPhotos.isPending}
              >
                {t("screensaver.refreshPhotos")}
              </Button>
              <span className="text-sm text-text-muted">
                {photos ? `${photos.length} foto` : t("screensaver.noPhotos")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Test actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={() => setShowTestScreensaver(true)}>
          {t("actions.testScreensaver")}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleTestNightMode}>
          {t("actions.testNightMode")}
        </Button>
      </div>

      <AnimatePresence>
        {showTestScreensaver && (
          <ScreensaverOverlay
            photoUrls={photoUrls}
            onDismiss={() => setShowTestScreensaver(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
