import { BugIcon, CaretDown, CaretUp, CheckCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useUpdateVoiceSettings, useVoiceSettings } from "../../lib/hooks/useVoiceSettings";
import { useT } from "../../lib/useT";
import { showVoiceDebug } from "../voice/VoiceDebugPanel";

function isTauri(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

export function VoiceSettings() {
  const { t } = useT("voice");
  const { data: settings } = useVoiceSettings();
  const update = useUpdateVoiceSettings();
  const [commandsOpen, setCommandsOpen] = useState(false);

  const isNative = isTauri();

  if (!settings) return null;

  return (
    <section>
      <h2 className="font-display text-3xl mb-5">{t("title")}</h2>

      {isNative && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-success/15 border border-success/40 text-sm text-success mb-4">
          <CheckCircleIcon size={18} weight="fill" />
          Riconoscimento vocale Apple pronto
        </div>
      )}

      <label className="flex items-center justify-between p-4 rounded-md bg-surface border border-border cursor-pointer mb-4">
        <span className="font-medium">{t("enabled")}</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update.mutate({ enabled: e.target.checked })}
          disabled={false}
          className="w-5 h-5 accent-accent"
        />
      </label>

      {/* Sensitivity slider */}
      <div className="p-4 rounded-md bg-surface border border-border mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">{t("sensitivity")}</span>
          <span className="text-sm text-text-muted">{Math.round(settings.sensitivity * 100)}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">{t("sensitivityLow")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.sensitivity}
            onChange={(e) => update.mutate({ sensitivity: Number(e.target.value) })}
            className="flex-1 accent-accent"
          />
          <span className="text-xs text-text-muted">{t("sensitivityHigh")}</span>
        </div>
      </div>

      {/* Available commands */}
      <VoiceCommandsList open={commandsOpen} onToggle={() => setCommandsOpen(!commandsOpen)} />

      <button
        type="button"
        onClick={showVoiceDebug}
        className="flex items-center gap-2 mt-4 px-4 py-3 rounded-md bg-surface border border-border text-sm text-text-muted hover:bg-surface-warm transition-colors"
      >
        <BugIcon size={18} weight="duotone" />
        Mostra log vocale
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/*  Commands list — grouped by category from voice.commands.categories.*     */
/* ------------------------------------------------------------------------ */

interface Category {
  title: string;
  items: string[];
}

function VoiceCommandsList({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useT("voice");
  const categories = t("commands.categories", { returnObjects: true }) as Record<string, Category>;
  const hint = t("commands.hint");

  return (
    <div className="rounded-md bg-surface border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full p-4 text-left"
        aria-expanded={open}
      >
        <span className="font-medium">{t("commands.title")}</span>
        {open ? <CaretUp size={20} weight="duotone" /> : <CaretDown size={20} weight="duotone" />}
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-5">
          <p className="text-xs text-text-muted leading-snug">{hint}</p>
          {Object.entries(categories).map(([key, cat]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <h3 className="label-mono text-text-muted">{cat.title}</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {cat.items.map((item) => (
                  <li key={item} className="text-text-muted leading-snug">
                    <span className="text-text">“{item}”</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
