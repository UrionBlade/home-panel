import { CheckCircleIcon, SignOutIcon, SpinnerIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import {
  useBlinkLogout,
  useBlinkSetup,
  useBlinkStatus,
  useBlinkVerifyPin,
} from "../../lib/hooks/useBlink";
import { useT } from "../../lib/useT";

export function CameraSettings() {
  const { t: tSettings } = useT("settings");
  const { data: status, isLoading } = useBlinkStatus();

  if (isLoading) return null;

  return (
    <section className="flex flex-col gap-8">
      <h2 className="font-display text-3xl">{tSettings("sections.cameras")}</h2>

      {/* Blink */}
      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <div className="flex items-center gap-3">
          <VideoCameraIcon size={24} weight="duotone" className="text-accent" />
          <h3 className="font-display text-xl">Blink</h3>
        </div>

        {status?.configured ? (
          <BlinkConnected email={status.email ?? undefined} />
        ) : (
          <BlinkSetupForm />
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stato connesso: mostra email + disconnect                          */
/* ------------------------------------------------------------------ */
function BlinkConnected({ email }: { email?: string }) {
  const { t } = useT("cameras");
  const { t: tSettings } = useT("settings");
  const logout = useBlinkLogout();

  function handleDisconnect() {
    if (window.confirm(t("confirm.disconnect"))) {
      logout.mutate();
    }
  }

  function renderConnectedAs(name: string) {
    const template = tSettings("cameras.connectedAs", { name: "___NAME___" }) as string;
    const [before, after] = template.split("___NAME___");
    return (
      <>
        {before}
        <span className="font-medium">{name}</span>
        {after}
      </>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <CheckCircleIcon size={20} weight="fill" className="text-success" />
        <span className="text-sm">
          {email ? renderConnectedAs(email) : tSettings("cameras.connected")}
        </span>
      </div>
      <button
        type="button"
        onClick={handleDisconnect}
        disabled={logout.isPending}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
      >
        <SignOutIcon size={16} weight="bold" />
        {t("actions.disconnect")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form di setup Blink                                                */
/* ------------------------------------------------------------------ */
function BlinkSetupForm() {
  const { t } = useT("cameras");
  const { t: tSettings } = useT("settings");
  const setup = useBlinkSetup();
  const verifyPin = useBlinkVerifyPin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [waitingPin, setWaitingPin] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setup.mutate(
      { email, password },
      {
        onSuccess: (data) => {
          if (data.needs2FA) setWaitingPin(true);
        },
      },
    );
  }

  function handlePinSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pin) return;
    verifyPin.mutate(pin);
  }

  const inputClass =
    "rounded-md border border-border bg-surface px-4 py-3 text-base focus:outline-2 focus:outline-accent";
  const btnClass =
    "rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-50";

  if (!waitingPin) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">{t("setup.body")}</p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("setup.email")}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("setup.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={inputClass}
          />
        </label>

        {setup.isError && (
          <p className="text-sm text-danger">
            {(setup.error as Error & { message?: string })?.message ?? t("errors.setupFailed")}
          </p>
        )}

        <button type="submit" disabled={setup.isPending} className={btnClass}>
          {setup.isPending ? <SpinnerIcon size={18} className="animate-spin inline mr-2" /> : null}
          {setup.isPending ? tSettings("cameras.connecting") : t("setup.connect")}
        </button>

        <p className="text-xs text-text-muted">{t("setup.disclaimer")}</p>
      </form>
    );
  }

  return (
    <form onSubmit={handlePinSubmit} className="flex flex-col gap-4">
      <div className="rounded-md bg-surface-warm border border-warning/30 p-4 text-sm text-text">
        {tSettings("cameras.pinInstructions")}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">PIN</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          required
          placeholder="000000"
          className={`${inputClass} text-center text-2xl tracking-[0.3em] font-display`}
        />
      </label>

      {verifyPin.isError && (
        <p className="text-sm text-danger">
          {(verifyPin.error as Error & { message?: string })?.message ??
            tSettings("cameras.pinInvalid")}
        </p>
      )}

      <button type="submit" disabled={verifyPin.isPending} className={btnClass}>
        {verifyPin.isPending ? tSettings("cameras.verifying") : tSettings("cameras.verifyPin")}
      </button>

      <button
        type="button"
        onClick={() => {
          setWaitingPin(false);
          setPin("");
        }}
        className="text-sm text-text-muted hover:text-text"
      >
        {tSettings("cameras.backToLogin")}
      </button>
    </form>
  );
}
