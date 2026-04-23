import { CheckCircleIcon, SignOutIcon, SnowflakeIcon, SpinnerIcon } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { useAcConfig, useAcDevices, useAcDisconnect, useAcSetup } from "../../lib/hooks/useAc";
import { useT } from "../../lib/useT";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/* ------------------------------------------------------------------ */
/*  GE Appliances settings — direct credential login (gehome-style)    */
/* ------------------------------------------------------------------ */
export function AcSettings() {
  const { t: tSettings } = useT("settings");
  const { data: config, isLoading } = useAcConfig();

  if (isLoading) return null;

  return (
    <section className="flex flex-col gap-8">
      <h2 className="font-display text-3xl">{tSettings("sections.ac")}</h2>

      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <div className="flex items-center gap-3">
          <SnowflakeIcon size={24} weight="duotone" className="text-accent" />
          <h3 className="font-display text-xl">GE Appliances</h3>
        </div>

        {config?.configured ? <ConnectedView email={config.email} /> : <SetupForm />}
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
/*  Not connected: email + password form                              */
/* ------------------------------------------------------------------ */
function SetupForm() {
  const { t: tSettings } = useT("settings");
  const setup = useAcSetup();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setup.mutate({ email: email.trim(), password });
  }

  const inputClass =
    "rounded-md border border-border bg-surface px-4 py-3 text-base focus:outline-2 focus:outline-accent";
  const btnClass =
    "rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-50";

  /* Surface backend error messages directly — the API already returns
   * user-friendly Italian strings for the expected cases (bad creds,
   * MFA pending, terms to accept). */
  const errMsg = setup.error
    ? (() => {
        const e = setup.error as Error & { body?: { error?: string } };
        return e.body?.error ?? e.message ?? tSettings("ac.setupError");
      })()
    : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{tSettings("ac.setupDescription")}</p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{tSettings("ac.emailLabel")}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          placeholder="mario.rossi@example.com"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{tSettings("ac.passwordLabel")}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </label>

      {errMsg && <p className="text-sm text-danger">{errMsg}</p>}

      <button type="submit" disabled={setup.isPending} className={btnClass}>
        {setup.isPending ? <SpinnerIcon size={18} className="animate-spin inline mr-2" /> : null}
        {setup.isPending ? tSettings("ac.linking") : tSettings("ac.link")}
      </button>

      <p className="text-xs text-text-muted">{tSettings("ac.passwordHint")}</p>
    </form>
  );
}
