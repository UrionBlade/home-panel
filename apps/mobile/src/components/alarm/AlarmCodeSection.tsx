/**
 * Section UI for setting and changing the alarm disarm code.
 * Auto-detects the right flow:
 *  - First-time setup: only `newCode` + `confirmCode`
 *  - Reset enabled (env override): same as above, with a "reset" hint
 *  - Normal change: `oldCode` required on top
 *
 * The plaintext code never leaves React state — submission is one
 * POST and the local fields are cleared on success.
 */

import { CheckCircleIcon, KeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { ApiError } from "../../lib/api-client";
import { useDisarmCodeStatus, useSetDisarmCode } from "../../lib/hooks/useAlarm";
import { useT } from "../../lib/useT";

const CODE_PATTERN = /^\d{4,8}$/;

export function AlarmCodeSection() {
  const { t } = useT("alarm");
  const { data: status, isLoading } = useDisarmCodeStatus();
  const setMutation = useSetDisarmCode();

  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /* Hide the success banner after a few seconds — no clutter when the
   * user comes back to the page later. */
  useEffect(() => {
    if (!savedAt) return;
    const id = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(id);
  }, [savedAt]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-surface-1 p-4 text-sm text-text-muted">
        {t("code.section")}…
      </section>
    );
  }

  if (!status) {
    return (
      <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
        {t("code.section")} — API non raggiungibile (riavvia il backend per applicare le nuove
        rotte).
      </section>
    );
  }

  const requireOld = status.configured && !status.resetEnabled;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!CODE_PATTERN.test(newCode)) {
      setError(newCode.length < 4 ? t("code.errors.tooShort") : t("code.errors.tooLong"));
      return;
    }
    if (newCode !== confirmCode) {
      setError(t("code.errors.mismatch"));
      return;
    }
    if (requireOld && !CODE_PATTERN.test(oldCode)) {
      setError(t("code.errors.tooShort"));
      return;
    }
    try {
      await setMutation.mutateAsync({
        oldCode: requireOld ? oldCode : undefined,
        newCode,
      });
      setOldCode("");
      setNewCode("");
      setConfirmCode("");
      setSavedAt(Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t("code.errors.wrongOld"));
        return;
      }
      const message = err instanceof Error ? err.message : "errore";
      setError(t("code.errors.generic", { message }));
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <KeyIcon size={26} weight="duotone" className="text-amber-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl">{t("code.section")}</h2>
          <p className="text-sm text-text-muted">{t("code.intro")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {status.configured ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircleIcon size={16} weight="fill" />
            {t("code.configured")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <WarningCircleIcon size={16} weight="fill" />
            {t("code.notConfigured")}
          </span>
        )}
        {status.resetEnabled && (
          <span className="ml-auto rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs px-2 py-0.5">
            {t("code.resetEnabled")}
          </span>
        )}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {requireOld && (
          <CodeField
            label={t("code.oldCode")}
            value={oldCode}
            onChange={setOldCode}
            autoComplete="current-password"
          />
        )}
        <CodeField
          label={t("code.newCode")}
          value={newCode}
          onChange={setNewCode}
          autoComplete="new-password"
        />
        <CodeField
          label={t("code.confirmCode")}
          value={confirmCode}
          onChange={setConfirmCode}
          autoComplete="new-password"
        />

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        {savedAt && !error && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {t("code.saved")}
          </div>
        )}

        <button
          type="submit"
          disabled={setMutation.isPending}
          className="self-start rounded-lg bg-accent text-white font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50"
        >
          {status.configured ? t("code.change") : t("code.setUp")}
        </button>
      </form>
    </section>
  );
}

interface CodeFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}

function CodeField({ label, value, onChange, autoComplete }: CodeFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-text-muted">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        pattern="\d*"
        maxLength={8}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-text font-mono tracking-[0.4em] text-lg focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
    </label>
  );
}
