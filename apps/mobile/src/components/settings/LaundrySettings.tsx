import {
  CheckCircleIcon,
  SignOutIcon,
  SpinnerIcon,
  WashingMachineIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
  useAssignDevices,
  useLaundryConfig,
  useLaundryStartOauth,
  useSmartThingsDevices,
  useSmartThingsLogout,
} from "../../lib/hooks/useLaundry";
import { useT } from "../../lib/useT";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";

/** True when running inside the Tauri WebView (same check used by
 * AcSettings / VoiceSettings). In a plain browser the authorization URL
 * opens in a new tab; inside Tauri the OS browser handles it. */
function isTauri(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function LaundrySettings() {
  const { t: tSettings } = useT("settings");
  const { data: config, isLoading } = useLaundryConfig();

  if (isLoading) return null;

  return (
    <section className="flex flex-col gap-8">
      <h2 className="font-display text-3xl">{tSettings("sections.laundry")}</h2>

      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <div className="flex items-center gap-3">
          <WashingMachineIcon size={24} weight="duotone" className="text-accent" />
          <h3 className="font-display text-xl">SmartThings</h3>
        </div>

        {config?.configured ? (
          <ConnectedView
            washerDeviceId={config.washerDeviceId}
            dryerDeviceId={config.dryerDeviceId}
          />
        ) : (
          <SetupForm />
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stato connesso: selezione device + disconnect                      */
/* ------------------------------------------------------------------ */
function ConnectedView({
  washerDeviceId,
  dryerDeviceId,
}: {
  washerDeviceId: string | null;
  dryerDeviceId: string | null;
}) {
  const { t: tSettings } = useT("settings");
  const { t: tCommon } = useT("common");
  const logout = useSmartThingsLogout();
  const { data: devices = [], isLoading } = useSmartThingsDevices(true);
  const assign = useAssignDevices();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const washers = devices.filter((d) => d.type === "washer");
  const dryers = devices.filter((d) => d.type === "dryer");

  function handleDisconnect() {
    setConfirmDisconnect(true);
  }

  function doDisconnect() {
    logout.mutate(undefined, { onSettled: () => setConfirmDisconnect(false) });
  }

  const notSelected = "— Non selezionata —";
  const washerOptions: DropdownOption[] = [
    { value: "", label: notSelected },
    ...washers.map((d) => ({ value: d.deviceId, label: d.label })),
  ];
  const dryerOptions: DropdownOption[] = [
    { value: "", label: notSelected },
    ...dryers.map((d) => ({ value: d.deviceId, label: d.label })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircleIcon size={20} weight="fill" className="text-success" />
          <span className="text-sm">Connesso a SmartThings</span>
        </div>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={logout.isPending}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
        >
          <SignOutIcon size={16} weight="bold" />
          Disconnetti
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <SpinnerIcon size={16} className="animate-spin" />
          {tSettings("laundry.loadingDevices")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <WashingMachineIcon size={16} weight="duotone" />
              Lavatrice
            </span>
            <Dropdown
              options={washerOptions}
              value={washerDeviceId ?? ""}
              onChange={(v) => assign.mutate({ washerDeviceId: v || null })}
              disabled={assign.isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <WindIcon size={16} weight="duotone" />
              Asciugatrice
            </span>
            <Dropdown
              options={dryerOptions}
              value={dryerDeviceId ?? ""}
              onChange={(v) => assign.mutate({ dryerDeviceId: v || null })}
              disabled={assign.isPending}
            />
          </div>

          {washers.length === 0 && dryers.length === 0 && (
            <p className="text-sm text-text-muted">{tSettings("laundry.noDevices")}</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title={tCommon("actions.confirm")}
        message={tSettings("laundry.confirmDisconnect")}
        destructive
        isLoading={logout.isPending}
        onConfirm={doDisconnect}
        onClose={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  OAuth link: opens SmartThings login in an external browser         */
/* ------------------------------------------------------------------ */
function SetupForm() {
  const { t: tSettings } = useT("settings");
  const start = useLaundryStartOauth();

  const btnClass =
    "rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-50";

  async function handleLink() {
    /* The SmartApp's redirect_uri must match this value exactly. Read
     * from VITE_API_PUBLIC_URL (HTTPS URL of the Funnel) or fall back
     * to the regular API base for local development. */
    const publicBase =
      (import.meta.env.VITE_API_PUBLIC_URL as string | undefined) ??
      (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
      "http://localhost:3000";
    const redirectUri = `${publicBase.replace(/\/$/, "")}/api/v1/laundry/oauth/callback`;
    try {
      const { authorizationUrl } = await start.mutateAsync(redirectUri);
      await openExternal(authorizationUrl);
    } catch (err) {
      console.error("[laundry] start oauth failed", err);
    }
  }

  const errMsg = start.error
    ? (() => {
        const e = start.error as Error & { body?: { error?: string } };
        return e.body?.error ?? e.message ?? tSettings("laundry.setupError");
      })()
    : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{tSettings("laundry.setupDescription")}</p>

      {errMsg && <p className="text-sm text-danger">{errMsg}</p>}

      <button
        type="button"
        onClick={() => void handleLink()}
        disabled={start.isPending}
        className={btnClass}
      >
        {start.isPending ? <SpinnerIcon size={18} className="animate-spin inline mr-2" /> : null}
        {start.isPending ? tSettings("laundry.linking") : tSettings("laundry.link")}
      </button>
    </div>
  );
}
