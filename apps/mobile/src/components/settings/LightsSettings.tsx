import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  LightbulbFilamentIcon,
  SignOutIcon,
  SpinnerIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import {
  useDisconnectEwelink,
  useEwelinkCredentials,
  useEwelinkCredentialsPolled,
  useStartEwelinkOAuth,
} from "../../lib/hooks/useLights";
import { i18next } from "../../lib/i18n";
import { useT } from "../../lib/useT";
import { ConfirmDialog } from "../ui/ConfirmDialog";

function formatIso(iso: string | null): string {
  if (!iso) return "—";
  const locale = i18next.language.startsWith("it") ? "it-IT" : "en-US";
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LightsSettings() {
  const { t } = useT("lights");
  const { data: credentials, isLoading } = useEwelinkCredentials();

  if (isLoading) return null;
  if (!credentials) return null;

  return (
    <section className="flex flex-col gap-8" id="lights">
      <h2 className="font-display text-3xl">{t("settings.title")}</h2>

      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <div className="flex items-center gap-3">
          <LightbulbFilamentIcon size={24} weight="duotone" className="text-accent" />
          <h3 className="font-display text-xl">eWeLink</h3>
        </div>

        {!credentials.appConfigured ? (
          <AppMissingNotice />
        ) : credentials.configured ? (
          <ConnectedView
            email={credentials.email ?? ""}
            region={credentials.region ?? "eu"}
            lastAuthAt={credentials.lastAuthAt}
          />
        ) : (
          <SetupForm />
        )}
      </div>
    </section>
  );
}

function AppMissingNotice() {
  const { t } = useT("lights");
  return (
    <div className="flex gap-3 rounded-md bg-warning/10 border border-warning/40 p-4">
      <WarningIcon size={22} weight="duotone" className="text-warning shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1">
        <span className="font-medium text-text">{t("settings.appMissing.title")}</span>
        <p className="text-sm text-text-muted leading-relaxed">{t("settings.appMissing.body")}</p>
      </div>
    </div>
  );
}

function ConnectedView({
  email,
  region,
  lastAuthAt,
}: {
  email: string;
  region: string;
  lastAuthAt: string | null;
}) {
  const { t } = useT("lights");
  const { t: tCommon } = useT("common");
  const disconnect = useDisconnectEwelink();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function doDisconnect() {
    disconnect.mutate(undefined, { onSettled: () => setConfirmOpen(false) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircleIcon size={20} weight="fill" className="text-success" />
          <span className="text-sm">{t("settings.status.connected", { email })}</span>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={disconnect.isPending}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
        >
          <SignOutIcon size={16} weight="bold" />
          {t("settings.form.disconnect")}
        </button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-text-muted">{t("settings.status.regionLabel")}</dt>
        <dd className="font-medium uppercase">{region}</dd>
        <dt className="text-text-muted">{t("settings.status.lastAuthLabel")}</dt>
        <dd className="font-medium">{formatIso(lastAuthAt)}</dd>
      </dl>

      <ConfirmDialog
        open={confirmOpen}
        title={t("settings.confirmDisconnect.title")}
        message={t("settings.confirmDisconnect.body")}
        confirmLabel={t("settings.form.disconnect")}
        cancelLabel={tCommon("actions.cancel")}
        destructive
        isLoading={disconnect.isPending}
        onConfirm={doDisconnect}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function SetupForm() {
  const { t } = useT("lights");
  const start = useStartEwelinkOAuth();
  const [waiting, setWaiting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  /* While waiting, poll credentials every 1.5s so the UI flips to
   * "Connected" automatically as soon as the callback completes. */
  const polled = useEwelinkCredentialsPolled(waiting);

  useEffect(() => {
    if (waiting && polled.data?.configured) {
      setWaiting(false);
      try {
        popupRef.current?.close();
      } catch {
        /* cross-origin restrictions on popup.close are expected — the
         * user will just close the window themselves. */
      }
    }
  }, [waiting, polled.data?.configured]);

  const handleConnect = () => {
    setErrorMessage(null);
    start.mutate(undefined, {
      onSuccess: (res) => {
        const win = window.open(res.authorizationUrl, "_blank", "noopener,noreferrer");
        popupRef.current = win;
        setWaiting(true);
      },
      onError: (err) => {
        const msg =
          err instanceof Error && err.message ? err.message : t("settings.errors.saveFailed");
        setErrorMessage(t("settings.errors.loginFailed", { message: msg }));
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{t("settings.subtitleOauth")}</p>

      {errorMessage && (
        <div className="flex gap-2 rounded-md bg-danger/10 border border-danger/40 p-3 text-sm text-danger">
          <WarningIcon size={16} weight="duotone" className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleConnect}
        disabled={start.isPending || waiting}
        className="flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground px-5 py-3 font-medium transition-opacity hover:opacity-90 disabled:opacity-50 min-h-[2.75rem]"
      >
        {start.isPending || waiting ? (
          <>
            <SpinnerIcon size={16} className="animate-spin" />
            {waiting ? t("settings.form.waiting") : t("settings.form.opening")}
          </>
        ) : (
          <>
            <ArrowSquareOutIcon size={16} weight="bold" />
            {t("settings.form.connectOauth")}
          </>
        )}
      </button>

      {waiting && (
        <p className="text-xs text-text-subtle text-center">{t("settings.form.waitingHint")}</p>
      )}
    </div>
  );
}
