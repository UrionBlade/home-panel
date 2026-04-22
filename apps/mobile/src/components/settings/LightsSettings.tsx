import {
  CheckCircleIcon,
  LightbulbFilamentIcon,
  SignOutIcon,
  SpinnerIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import {
  useDisconnectEwelink,
  useEwelinkCredentials,
  useSaveEwelinkCredentials,
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
  const save = useSaveEwelinkCredentials();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState("+39");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    save.mutate(
      { email: email.trim(), password, countryCode: countryCode.trim() },
      {
        onError: (err) => {
          const msg =
            err instanceof Error && err.message ? err.message : t("settings.errors.saveFailed");
          setErrorMessage(t("settings.errors.loginFailed", { message: msg }));
        },
        onSuccess: () => {
          setPassword("");
        },
      },
    );
  }

  const canSubmit =
    email.trim().length > 3 &&
    password.length > 0 &&
    countryCode.trim().startsWith("+") &&
    !save.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{t("settings.subtitle")}</p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("settings.form.email")}</span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("settings.form.emailPlaceholder")}
          className="px-4 py-3 rounded-md bg-surface-elevated border border-border text-text focus:border-accent focus:outline-none transition-colors"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("settings.form.password")}</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("settings.form.passwordPlaceholder")}
          className="px-4 py-3 rounded-md bg-surface-elevated border border-border text-text focus:border-accent focus:outline-none transition-colors"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("settings.form.countryCode")}</span>
        <input
          type="text"
          required
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          placeholder={t("settings.form.countryCodePlaceholder")}
          className="px-4 py-3 rounded-md bg-surface-elevated border border-border text-text focus:border-accent focus:outline-none transition-colors max-w-[8rem] tabular-nums"
        />
      </label>

      {errorMessage && (
        <div className="flex gap-2 rounded-md bg-danger/10 border border-danger/40 p-3 text-sm text-danger">
          <WarningIcon size={16} weight="duotone" className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground px-5 py-3 font-medium transition-opacity hover:opacity-90 disabled:opacity-50 min-h-[2.75rem]"
      >
        {save.isPending ? (
          <>
            <SpinnerIcon size={16} className="animate-spin" />
            {t("settings.form.testing")}
          </>
        ) : (
          t("settings.form.connect")
        )}
      </button>
    </form>
  );
}
