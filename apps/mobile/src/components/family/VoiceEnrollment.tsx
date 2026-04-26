/**
 * Voice enrollment modal — captures speaker embeddings for a family member.
 *
 * Flow:
 *  1. User taps "Registra campione".
 *  2. We call the native `voice_capture_speaker_embedding` Tauri command,
 *     which blocks for up to 4 s while the iOS plugin gathers 2.5 s of
 *     audio and runs ECAPA-TDNN to produce a 192-d vector.
 *  3. The vector is POSTed to /api/v1/family/:id/voice/enroll, which
 *     appends it to the member's sample set and recomputes the centroid.
 *
 * Five samples (the kRecommended count) is enough for a stable centroid;
 * the user can add more later or wipe the profile entirely. We don't have
 * a "delete single sample" UX — the centroid is opaque to the user.
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

const kPhrases = [
  "Ok casa, accendi le luci del salotto",
  "Ok casa, che tempo fa oggi",
  "Ok casa, metti la sveglia alle sette",
  "Ok casa, spegni la TV",
  "Ok casa, apri il calendario di oggi",
];

export function VoiceEnrollment({ member }: VoiceEnrollmentProps) {
  const { t } = useT("family");
  const enroll = useEnrollVoice();
  const remove = useDeleteVoice();
  const pushToast = useUiStore((s) => s.pushToast);
  const [recording, setRecording] = useState(false);

  const sampleCount = member.voiceSampleCount;
  const nextPhrase = kPhrases[Math.min(sampleCount, kPhrases.length - 1)];
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
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-text-muted">{t("voice.intro", { name: member.displayName })}</p>
      </header>

      <div className="rounded-md border border-border bg-surface-muted/40 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">
            {t("voice.sampleProgress", {
              current: Math.min(sampleCount, kRecommendedSamples),
              total: kRecommendedSamples,
            })}
          </span>
          {isComplete && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <CheckCircleIcon size={16} weight="fill" />
              {t("voice.ready")}
            </span>
          )}
        </div>

        <div className="rounded bg-bg p-3 text-sm">
          <p className="text-text-muted mb-1">{t("voice.sayThis")}</p>
          <p className="font-display text-lg">{nextPhrase}</p>
        </div>

        <Button
          onClick={handleRecord}
          isLoading={recording || enroll.isPending}
          iconLeft={<MicrophoneIcon size={18} weight="fill" />}
        >
          {recording ? t("voice.recording") : t("voice.recordCta")}
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
