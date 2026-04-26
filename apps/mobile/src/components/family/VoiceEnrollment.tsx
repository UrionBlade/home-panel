/**
 * Voice enrollment modal — captures speaker embeddings for a family member.
 *
 * Flow:
 *  1. User taps "Registra questa frase".
 *  2. We call `voice_capture_speaker_embedding`, the iOS plugin records
 *     2.5 s of audio and runs ECAPA-TDNN to produce a 192-d vector.
 *  3. The vector is POSTed to /api/v1/family/:id/voice/enroll, appended
 *     to the member's sample set, and the centroid is recomputed.
 *
 * Five samples is enough for a stable centroid. We show all five phrases
 * in a checklist so the user can see exactly which ones they've covered;
 * the next phrase to read is highlighted. The user can re-record the
 * profile by wiping it (no per-sample delete — the centroid is opaque).
 */

import type { FamilyMember } from "@home-panel/shared";
import { CheckCircleIcon, MicrophoneIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useDeleteVoice, useEnrollVoice } from "../../lib/hooks/useFamily";
import { useT } from "../../lib/useT";
import { nativeVoiceClient } from "../../lib/voice/nativeVoiceClient";
import { useUiStore } from "../../store/ui-store";
import { Button } from "../ui/Button";

interface VoiceEnrollmentProps {
  member: FamilyMember;
}

const kRecommendedSamples = 5;

/* Frasi che l'utente legge ad alta voce. Cinque frasi diverse forzano una
 * varietà fonetica nel centroide — meglio per la robustezza del match. */
const kPhrases = [
  "Ok casa, accendi le luci del salotto.",
  "Ok casa, che tempo fa oggi?",
  "Ok casa, metti la sveglia alle sette di domani.",
  "Ok casa, spegni la televisione.",
  "Ok casa, apri il calendario di oggi.",
];

export function VoiceEnrollment({ member }: VoiceEnrollmentProps) {
  const { t } = useT("family");
  const enroll = useEnrollVoice();
  const remove = useDeleteVoice();
  const pushToast = useUiStore((s) => s.pushToast);
  const [recording, setRecording] = useState(false);

  /* Defensive default: cached payloads from before the schema change can
   * arrive without `voiceSampleCount`, and `Math.min(undefined, …)` is
   * NaN — which used to bleed straight into the UI. */
  const sampleCount = member.voiceSampleCount ?? 0;
  const currentIndex = Math.min(sampleCount, kPhrases.length - 1);
  const isComplete = sampleCount >= kRecommendedSamples;

  const handleRecord = async () => {
    if (!nativeVoiceClient.supported) {
      pushToast({ tone: "danger", text: t("voice.errors.nativeOnly") });
      return;
    }
    setRecording(true);
    try {
      const embedding = await nativeVoiceClient.captureSpeakerEmbedding();
      await enroll.mutateAsync({ id: member.id, embedding });
      pushToast({
        tone: "success",
        text: t("voice.toasts.sampleSaved", { count: sampleCount + 1 }),
      });
    } catch (err) {
      pushToast({
        tone: "danger",
        text: err instanceof Error ? err.message : t("voice.errors.captureFailed"),
      });
    } finally {
      setRecording(false);
    }
  };

  const handleDelete = async () => {
    if (sampleCount === 0) return;
    try {
      await remove.mutateAsync(member.id);
      pushToast({ tone: "success", text: t("voice.toasts.deleted") });
    } catch (err) {
      pushToast({
        tone: "danger",
        text: err instanceof Error ? err.message : t("voice.errors.deleteFailed"),
      });
    }
  };

  return (
    <section className="flex flex-col gap-5">
      <p className="text-sm text-text-muted">{t("voice.intro", { name: member.displayName })}</p>

      {/* Progress + status pill */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {t("voice.sampleProgress", {
            current: Math.min(sampleCount, kRecommendedSamples),
            total: kRecommendedSamples,
          })}
        </span>
        {isComplete && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <CheckCircleIcon size={16} weight="fill" />
            {t("voice.ready")}
          </span>
        )}
      </div>

      {/* Lista delle 5 frasi: già fatte (✓), corrente (highlight), future (grigie) */}
      <ol className="flex flex-col gap-2">
        {kPhrases.map((phrase, idx) => {
          const done = idx < sampleCount;
          const current = idx === currentIndex && !isComplete;
          return (
            <li
              key={phrase}
              className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
                current
                  ? "border-accent bg-accent/5"
                  : done
                    ? "border-border bg-surface-muted/40"
                    : "border-border bg-surface"
              }`}
            >
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-success text-white"
                    : current
                      ? "bg-accent text-white"
                      : "bg-surface-muted text-text-muted"
                }`}
                aria-hidden
              >
                {done ? "✓" : idx + 1}
              </span>
              <p
                className={`text-base leading-snug ${
                  done
                    ? "text-text-muted line-through"
                    : current
                      ? "text-text font-medium"
                      : "text-text"
                }`}
              >
                {phrase}
              </p>
            </li>
          );
        })}
      </ol>

      {/* CTA + hint */}
      <div className="flex flex-col gap-2">
        <Button
          onClick={handleRecord}
          isLoading={recording || enroll.isPending}
          iconLeft={<MicrophoneIcon size={18} weight="fill" />}
        >
          {recording
            ? t("voice.recording")
            : isComplete
              ? t("voice.recordExtraCta")
              : t("voice.recordCta", { number: currentIndex + 1 })}
        </Button>
        <p className="text-xs text-text-muted">{t("voice.recordHint")}</p>
      </div>

      {sampleCount > 0 && (
        <Button
          variant="ghost"
          onClick={handleDelete}
          isLoading={remove.isPending}
          iconLeft={<TrashIcon size={16} weight="bold" />}
        >
          {t("voice.deleteAll")}
        </Button>
      )}
    </section>
  );
}
