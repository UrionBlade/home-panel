import { CheckCircleIcon, SignOutIcon, SnowflakeIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { useAcConfig, useAcDevices, useAcDisconnect, useAcStartOauth } from "../../lib/hooks/useAc";
import { useT } from "../../lib/useT";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/* ------------------------------------------------------------------ */
/*  GE Appliances settings — browser OAuth link + device discovery     */
/* ------------------------------------------------------------------ */
export function AcSettings() {
  const { t: tSettings } = useT("settings");
  const [isLinking, setIsLinking] = useState(false);
  const { data: config, isLoading } = useAcConfig(isLinking);

  /* Stop polling as soon as the backend confirms the link. */
  useEffect(() => {
    if (isLinking && config?.configured) {
      setIsLinking(false);
    }
  }, [isLinking, config?.configured]);

  if (isLoading) return null;

  return (
    <section className="flex flex-col gap-8">
      <h2 className="font-display text-3xl">{tSettings("sections.ac")}</h2>

      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <div className="flex items-center gap-3">
          <SnowflakeIcon size={24} weight="duotone" className="text-accent" />
          <h3 className="font-display text-xl">GE Appliances</h3>
        </div>

        {config?.configured ? (
          <ConnectedView email={config.email} />
        ) : (
          <SetupView isLinking={isLinking} setIsLinking={setIsLinking} />
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Connected: show linked email, list devices, offer disconnect      */
/* ------------------------------------------------------------------ */
function ConnectedView({ email }: { email: string | null }) {
  const { t: tSettings } = useT("settings");
  const { t: tCommon } = useT("common");
  const disconnect = useAcDisconnect();
  const { data: devices = [], isLoading, error } = useAcDevices(true);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircleIcon size={20} weight="fill" className="text-success" />
          <span className="text-sm">
            {email ? tSettings("ac.connectedAs", { email }) : tSettings("ac.connected")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDisconnect(true)}
          disabled={disconnect.isPending}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
        >
          <SignOutIcon size={16} weight="bold" />
          {tSettings("ac.disconnect")}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <SpinnerIcon size={16} className="animate-spin" />
          {tSettings("ac.loadingDevices")}
        </div>
      ) : error ? (
        <p className="text-sm text-danger">{tSettings("ac.devicesError")}</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-text-muted">{tSettings("ac.noDevices")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="font-medium">{d.nickname ?? d.model ?? d.serial}</span>
              <span className="text-xs text-text-muted">{d.serial}</span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title={tCommon("actions.confirm")}
        message={tSettings("ac.confirmDisconnect")}
        destructive
        isLoading={disconnect.isPending}
        onConfirm={() =>
          disconnect.mutate(undefined, { onSettled: () => setConfirmDisconnect(false) })
        }
        onClose={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Not connected: one-click browser OAuth                            */
/* ------------------------------------------------------------------ */
function SetupView({
  isLinking,
  setIsLinking,
}: {
  isLinking: boolean;
  setIsLinking: (v: boolean) => void;
}) {
  const { t: tSettings } = useT("settings");
  const qc = useQueryClient();
  const start = useAcStartOauth();

  const btnClass =
    "rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-50";

  async function handleLink() {
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/v1/ac/oauth/callback`;
    try {
      const { authorizationUrl } = await start.mutateAsync(redirectUri);
      await openUrl(authorizationUrl);
      setIsLinking(true);
      /* Kick the first poll immediately so the spinner switches to
       * "connected" the moment the user finishes the browser flow. */
      void qc.invalidateQueries({ queryKey: ["ac", "config"] });
    } catch (err) {
      console.error("[ac] start oauth failed", err);
      setIsLinking(false);
    }
  }

  function handleCancel() {
    setIsLinking(false);
  }

  if (isLinking) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">{tSettings("ac.waitingForBrowser")}</p>
        <div className="flex items-center gap-2 text-sm">
          <SpinnerIcon size={18} className="animate-spin text-accent" />
          <span>{tSettings("ac.polling")}</span>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="self-start text-sm text-text-muted hover:text-text underline"
        >
          {tSettings("ac.cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{tSettings("ac.setupDescription")}</p>

      {start.isError && (
        <p className="text-sm text-danger">
          {(start.error as Error & { message?: string })?.message ?? tSettings("ac.setupError")}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleLink()}
        disabled={start.isPending}
        className={btnClass}
      >
        {start.isPending ? <SpinnerIcon size={18} className="animate-spin inline mr-2" /> : null}
        {start.isPending ? tSettings("ac.linking") : tSettings("ac.link")}
      </button>
    </div>
  );
}
