import {
  CheckCircleIcon,
  SignOutIcon,
  SpinnerIcon,
  WashingMachineIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import {
  useAssignDevices,
  useLaundryConfig,
  useSmartThingsDevices,
  useSmartThingsLogout,
  useSmartThingsSetup,
} from "../../lib/hooks/useLaundry";
import { useT } from "../../lib/useT";

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
  const logout = useSmartThingsLogout();
  const { data: devices = [], isLoading } = useSmartThingsDevices(true);
  const assign = useAssignDevices();

  const washers = devices.filter((d) => d.type === "washer");
  const dryers = devices.filter((d) => d.type === "dryer");

  function handleDisconnect() {
    if (window.confirm(tSettings("laundry.confirmDisconnect"))) {
      logout.mutate();
    }
  }

  const selectClass = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

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
          {/* Lavatrice */}
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <WashingMachineIcon size={16} weight="duotone" />
              Lavatrice
            </span>
            <select
              value={washerDeviceId ?? ""}
              onChange={(e) =>
                assign.mutate({
                  washerDeviceId: e.target.value || null,
                })
              }
              className={selectClass}
            >
              <option value="">— Non selezionata —</option>
              {washers.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          {/* Asciugatrice */}
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <WindIcon size={16} weight="duotone" />
              Asciugatrice
            </span>
            <select
              value={dryerDeviceId ?? ""}
              onChange={(e) =>
                assign.mutate({
                  dryerDeviceId: e.target.value || null,
                })
              }
              className={selectClass}
            >
              <option value="">— Non selezionata —</option>
              {dryers.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          {washers.length === 0 && dryers.length === 0 && (
            <p className="text-sm text-text-muted">{tSettings("laundry.noDevices")}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form di setup SmartThings PAT                                      */
/* ------------------------------------------------------------------ */
function SetupForm() {
  const setup = useSmartThingsSetup();
  const [pat, setPat] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pat.trim()) return;
    setup.mutate({ pat: pat.trim() });
  }

  const inputClass =
    "rounded-md border border-border bg-surface px-4 py-3 text-base focus:outline-2 focus:outline-accent";
  const btnClass =
    "rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Inserisci un Personal Access Token SmartThings per monitorare lavatrice e asciugatrice.
        Generalo su <span className="font-medium text-text">account.smartthings.com/tokens</span>.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Personal Access Token</span>
        <input
          type="password"
          value={pat}
          onChange={(e) => setPat(e.target.value)}
          required
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className={inputClass}
        />
      </label>

      {setup.isError && (
        <p className="text-sm text-danger">
          {(setup.error as Error & { message?: string })?.message ?? "Token non valido"}
        </p>
      )}

      <button type="submit" disabled={setup.isPending} className={btnClass}>
        {setup.isPending ? <SpinnerIcon size={18} className="animate-spin inline mr-2" /> : null}
        {setup.isPending ? "Verifica..." : "Collega"}
      </button>

      <p className="text-xs text-text-muted">
        Il token viene salvato in modo sicuro sul tuo server locale.
      </p>
    </form>
  );
}
