import { TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { AnimatePresence } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  useDeleteKioskPhoto,
  useKioskPhotos,
  useKioskSettings,
  useRefreshKioskPhotos,
  useUpdateKioskSettings,
  useUploadKioskPhoto,
} from "../../lib/hooks/useKioskSettings";
import { useNightMode } from "../../lib/kiosk/NightModeProvider";
import { useT } from "../../lib/useT";
import { useUiStore } from "../../store/ui-store";
import { ScreensaverOverlay } from "../kiosk/ScreensaverOverlay";
import { Button } from "../ui/Button";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";

const HOUR_OPTIONS: DropdownOption[] = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, "0")}:00`,
}));

export function KioskSettings() {
  const { t } = useT("kiosk");
  const { data: settings } = useKioskSettings();
  const { data: photos } = useKioskPhotos();
  const update = useUpdateKioskSettings();
  const refreshPhotos = useRefreshKioskPhotos();
  const uploadPhoto = useUploadKioskPhoto();
  const deletePhoto = useDeleteKioskPhoto();
  const pushToast = useUiStore((s) => s.pushToast);
  const { setForceNight } = useNightMode();
  const [showTestScreensaver, setShowTestScreensaver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const photoUrls = useMemo(() => (photos ?? []).map((p) => p.url), [photos]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      let okCount = 0;
      for (const file of list) {
        try {
          await uploadPhoto.mutateAsync(file);
          okCount += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : t("screensaver.uploadError");
          pushToast({ tone: "danger", text: `${file.name}: ${msg}` });
        }
      }
      if (okCount > 0) {
        pushToast({
          tone: "success",
          text: t("screensaver.uploadSuccess", { count: okCount }),
        });
      }
    },
    [uploadPhoto, pushToast, t],
  );

  const handlePickFiles = useCallback(() => fileInputRef.current?.click(), []);

  const handleDelete = useCallback(
    (filename: string) => {
      deletePhoto.mutate(filename, {
        onSuccess: () => {
          pushToast({ tone: "success", text: t("screensaver.deleted") });
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : t("screensaver.deleteError");
          pushToast({ tone: "danger", text: msg });
        },
      });
    },
    [deletePhoto, pushToast, t],
  );

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
            <Dropdown
              label={t("nightMode.start")}
              options={HOUR_OPTIONS}
              value={String(settings.nightStartHour)}
              onChange={(v) => update.mutate({ nightStartHour: Number(v) })}
            />
            <Dropdown
              label={t("nightMode.end")}
              options={HOUR_OPTIONS}
              value={String(settings.nightEndHour)}
              onChange={(v) => update.mutate({ nightEndHour: Number(v) })}
            />

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

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm text-text-muted">
                  {photos && photos.length > 0
                    ? t("screensaver.photoCount", { count: photos.length })
                    : t("screensaver.noPhotos")}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshPhotos}
                    isLoading={refreshPhotos.isPending}
                  >
                    {t("screensaver.refreshPhotos")}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handlePickFiles}
                    isLoading={uploadPhoto.isPending}
                  >
                    <UploadSimpleIcon size={16} weight="bold" />
                    {t("screensaver.uploadCta")}
                  </Button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void uploadFiles(e.target.files);
                  }
                  e.target.value = "";
                }}
              />

              {/* Drag-drop zone — clicking it opens the file picker too. */}
              <button
                type="button"
                onClick={handlePickFiles}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    void uploadFiles(e.dataTransfer.files);
                  }
                }}
                className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-sm transition-colors ${
                  isDragOver
                    ? "border-accent bg-accent/10 text-text"
                    : "border-border bg-surface-muted/50 text-text-muted hover:border-accent/60 hover:text-text"
                }`}
              >
                <UploadSimpleIcon size={22} weight="duotone" />
                <span className="font-medium">{t("screensaver.dropHint")}</span>
                <span className="text-xs">{t("screensaver.dropFormats")}</span>
              </button>

              {photos && photos.length > 0 && (
                <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {photos.map((p) => (
                    <li
                      key={p.filename}
                      className="relative aspect-square overflow-hidden rounded-sm border border-border bg-surface-muted"
                    >
                      <img
                        src={p.url}
                        alt={p.filename}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label={t("screensaver.deletePhoto")}
                        onClick={() => handleDelete(p.filename)}
                        className="absolute top-1 right-1 p-1.5 rounded-full bg-black/60 text-white hover:bg-danger/80 transition-colors"
                      >
                        <TrashIcon size={14} weight="bold" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
