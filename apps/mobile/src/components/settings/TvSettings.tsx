import { CheckCircleIcon, SpinnerIcon, TelevisionIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTvAssign, useTvConfig, useTvDevices, useTvStatus } from "../../lib/hooks/useTv";
import { useT } from "../../lib/useT";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";

type TestState = "idle" | "loading" | "ok-on" | "ok-off" | "error";

export function TvSettings() {
  const { t: tTv } = useT("tv");
  const { t: tSettings } = useT("settings");
  const { t: tCommon } = useT("common");
  const { data: config } = useTvConfig();
  const { data: devices = [], isLoading: loadingDevices } = useTvDevices(
    !!config?.smartThingsConfigured,
  );
  const assign = useTvAssign();
  const status = useTvStatus();
  const [testState, setTestState] = useState<TestState>("idle");
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  /* Anchor support: scroll #tv into view on mount if hash matches. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#tv" && sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  function handlePick(deviceId: string) {
    assign.mutate({ tvDeviceId: deviceId });
  }

  function handleUnbind() {
    setConfirmUnbind(true);
  }

  function doUnbind() {
    assign.mutate({ tvDeviceId: null }, { onSettled: () => setConfirmUnbind(false) });
  }

  async function handleTest() {
    setTestState("loading");
    try {
      const result = await status.refetch();
      if (result.isError || !result.data) {
        setTestState("error");
        return;
      }
      setTestState(result.data.power === "on" ? "ok-on" : "ok-off");
    } catch {
      setTestState("error");
    }
  }

  const boundDevice = devices.find((d) => d.deviceId === config?.tvDeviceId) ?? null;
  const smartThingsNotReady = config && !config.smartThingsConfigured;
  const deviceOptions: DropdownOption[] = [
    { value: "", label: tTv("settings.noneBound") },
    ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
  ];

  return (
    <section id="tv" ref={sectionRef} className="flex flex-col gap-8">
      <h2 className="font-display text-3xl">{tSettings("sections.tv")}</h2>

      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <div className="flex items-center gap-3">
          <TelevisionIcon size={24} weight="duotone" className="text-accent" />
          <h3 className="font-display text-xl">{tTv("settings.sectionTitle")}</h3>
        </div>

        {smartThingsNotReady ? (
          <p className="text-sm text-text-muted">{tTv("settings.notConnectedSmartThings")}</p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircleIcon size={20} weight="fill" className="text-success" />
              <span>{tTv("settings.connectedSmartThings")}</span>
            </div>

            {loadingDevices ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <SpinnerIcon size={16} className="animate-spin" />
                {tTv("settings.loadingDevices")}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{tTv("settings.boundLabel")}</span>
                <Dropdown
                  options={deviceOptions}
                  value={config?.tvDeviceId ?? ""}
                  onChange={(v) => {
                    if (v === "") handleUnbind();
                    else handlePick(v);
                  }}
                  disabled={assign.isPending}
                />
                {devices.length === 0 && (
                  <span className="text-xs text-text-muted">{tTv("settings.noDevices")}</span>
                )}
              </div>
            )}

            {boundDevice && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testState === "loading"}
                  className="rounded-md bg-surface border border-border px-3 py-2 text-sm font-medium hover:border-accent transition-colors disabled:opacity-60"
                >
                  {testState === "loading" ? (
                    <SpinnerIcon size={14} className="animate-spin inline mr-1.5" />
                  ) : null}
                  {tTv("settings.testConnection")}
                </button>
                <button
                  type="button"
                  onClick={handleUnbind}
                  disabled={assign.isPending}
                  className="rounded-md px-3 py-2 text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  {tTv("settings.unbindTv")}
                </button>
                <TestFeedback state={testState} />
              </div>
            )}

            <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-3 flex gap-2 items-start">
              <WarningIcon size={18} weight="duotone" className="text-warning shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{tTv("settings.warnNetworkWakeTitle")}</span>
                <span className="text-xs text-text-muted leading-snug">
                  {tTv("settings.warnNetworkWakeBody")}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmUnbind}
        title={tCommon("actions.confirm")}
        message={tTv("settings.confirmUnbind")}
        destructive
        isLoading={assign.isPending}
        onConfirm={doUnbind}
        onClose={() => setConfirmUnbind(false)}
      />
    </section>
  );
}

function TestFeedback({ state }: { state: TestState }) {
  const { t: tTv } = useT("tv");
  if (state === "idle" || state === "loading") return null;
  if (state === "error") {
    return (
      <span className="text-sm text-danger" role="status">
        {tTv("settings.testFail")}
      </span>
    );
  }
  const stateLabel = state === "ok-on" ? tTv("settings.testOkOn") : tTv("settings.testOkOff");
  return (
    <span className="text-sm text-success" role="status">
      {tTv("settings.testOk", { state: stateLabel })}
    </span>
  );
}
