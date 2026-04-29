import type { BlinkCamera } from "@home-panel/shared";
import {
  ArrowSquareOutIcon,
  ArrowsOutIcon,
  BatteryHighIcon,
  BroadcastIcon,
  ClockIcon,
  LockIcon,
  LockOpenIcon,
  StopCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DeviceEntity } from "../../../lib/devices/model";
import { useArmCamera, useUpdateCamera } from "../../../lib/hooks/useBlink";
import { useT } from "../../../lib/useT";
import { CameraFullscreenOverlay } from "../../cameras/CameraFullscreenOverlay";
import { CameraLiveFrame } from "../../cameras/CameraLiveFrame";
import { BottomSheet } from "../BottomSheet";

interface CameraControlSheetProps {
  open: boolean;
  device: DeviceEntity;
  onClose: () => void;
}

/**
 * Vista camera nel BottomSheet con live su richiesta + fullscreen.
 *
 * - La diretta non parte da sola: l'utente preme il bottone "Live" per
 *   attivare il polling degli snapshot (risparmio batteria e quota
 *   Blink). Ripremendo il bottone si ferma.
 * - "Ingrandisci" apre lo stesso feed in un overlay a tutto schermo
 *   (CameraFullscreenOverlay). Uscendo si torna al sheet senza perdere
 *   stato di armamento o navigation.
 */
export function CameraControlSheet({ open, device, onClose }: CameraControlSheetProps) {
  const { t } = useT("casa");
  const { t: tAlarm } = useT("alarm");
  const row = device.raw as BlinkCamera;
  const arm = useArmCamera();
  const updateCamera = useUpdateCamera();
  const navigate = useNavigate();

  const [liveActive, setLiveActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  /* Quando il sheet si chiude: spegniamo la live e usciamo da fullscreen,
   * così il polling non continua in background. */
  useEffect(() => {
    if (!open) {
      setLiveActive(false);
      setFullscreen(false);
    }
  }, [open]);

  const isArmed = row.armed;
  const isOffline = row.status !== "online";

  const lastMotion = row.lastMotionAt
    ? new Date(row.lastMotionAt).toLocaleString("it-IT", {
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const goRegistrations = () => {
    navigate("/cameras");
    onClose();
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={device.name}
        subtitle={t("kinds.camera", { count: 1, defaultValue: "Telecamera" })}
      >
        <div className="flex flex-col gap-4 py-3">
          {/* Frame + overlay offline */}
          <div className="relative">
            <CameraLiveFrame camera={row} active={liveActive} />
            {isOffline && (
              <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm flex items-center justify-center rounded-lg">
                <span className="px-3 py-1.5 rounded-full bg-danger/90 text-white text-sm font-medium">
                  Offline
                </span>
              </div>
            )}
          </div>

          {/* Arm / Disarm — azione primaria, full-width */}
          <button
            type="button"
            onClick={() => arm.mutate({ id: device.id, arm: !isArmed })}
            disabled={arm.isPending || isOffline}
            className={`min-h-[3.5rem] rounded-md flex items-center justify-center gap-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
              isArmed
                ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                : "bg-surface border border-border text-text hover:border-accent"
            }`}
          >
            {isArmed ? (
              <>
                <LockIcon size={20} weight="fill" />
                Disarma telecamera
              </>
            ) : (
              <>
                <LockOpenIcon size={20} weight="duotone" />
                Arma telecamera
              </>
            )}
          </button>

          {/* Live toggle + Ingrandisci — riga secondaria */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLiveActive((v) => !v)}
              disabled={isOffline}
              aria-pressed={liveActive}
              className={`min-h-[3.25rem] rounded-md flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                liveActive
                  ? "bg-danger/15 border border-danger/50 text-danger"
                  : "bg-surface border border-border text-text hover:border-accent"
              }`}
            >
              {liveActive ? (
                <>
                  <StopCircleIcon size={20} weight="fill" />
                  Ferma live
                </>
              ) : (
                <>
                  <BroadcastIcon size={20} weight="duotone" />
                  Avvia live
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFullscreen(true)}
              disabled={isOffline}
              className="min-h-[3.25rem] rounded-md bg-surface border border-border text-text flex items-center justify-center gap-2 hover:border-accent transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowsOutIcon size={18} weight="bold" />
              Ingrandisci
            </button>
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-2 gap-2">
            <InfoCell
              icon={<BatteryHighIcon size={18} weight="duotone" />}
              label="Batteria"
              value={row.batteryLevel ?? "—"}
            />
            <InfoCell
              icon={<ClockIcon size={18} weight="duotone" />}
              label="Ultimo evento"
              value={lastMotion ?? "—"}
            />
          </div>

          {/* Includi nell'allarme — quando il sistema è armato, una nuova
           * motion clip su questa camera fa partire la sirena. */}
          <label className="flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 cursor-pointer hover:border-accent transition-colors">
            <input
              type="checkbox"
              checked={row.armedForAlarm}
              disabled={updateCamera.isPending}
              onChange={(e) =>
                updateCamera.mutate({ id: row.id, input: { armedForAlarm: e.target.checked } })
              }
              className="mt-1 h-4 w-4 accent-rose-500"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm leading-tight">
                {tAlarm("camera.armForAlarmLabel")}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {tAlarm("camera.armForAlarmDescription")}
              </p>
            </div>
          </label>

          {/* Vai alle registrazioni */}
          <button
            type="button"
            onClick={goRegistrations}
            className="min-h-[3rem] rounded-md bg-transparent text-accent flex items-center justify-center gap-2 hover:bg-surface-warm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowSquareOutIcon size={16} weight="bold" />
            Vedi le registrazioni
          </button>
        </div>
      </BottomSheet>

      {/* Fullscreen overlay — monta il suo CameraLiveFrame con active=true,
       * a prescindere dallo stato liveActive del sheet. Il polling si
       * ferma quando chiudi il fullscreen. */}
      {fullscreen && <CameraFullscreenOverlay camera={row} onClose={() => setFullscreen(false)} />}
    </>
  );
}

function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-surface border border-border">
      <span className="text-text-muted shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-text-subtle">{label}</span>
        <span className="text-sm text-text truncate">{value}</span>
      </div>
    </div>
  );
}
