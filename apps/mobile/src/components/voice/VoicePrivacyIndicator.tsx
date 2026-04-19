import type { VoiceStatus } from "@home-panel/shared";
import { Microphone } from "@phosphor-icons/react";
import { useT } from "../../lib/useT";

interface VoicePrivacyIndicatorProps {
  status: VoiceStatus;
  onToggle?: () => void;
}

function getIndicatorStyle(status: VoiceStatus) {
  switch (status) {
    case "listening":
    case "processing":
    case "speaking":
    case "idle":
      return "text-success";
    case "error":
      return "text-danger";
    default:
      return "text-text-muted";
  }
}

export function VoicePrivacyIndicator({ status, onToggle }: VoicePrivacyIndicatorProps) {
  const { t } = useT("voice");

  const colorClass = getIndicatorStyle(status);
  const label =
    status === "disabled"
      ? t("privacy.disabled")
      : status === "idle" ||
          status === "listening" ||
          status === "processing" ||
          status === "speaking"
        ? t("privacy.active")
        : t("privacy.paused");

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${colorClass}`}
      title={label}
      aria-label={label}
    >
      <Microphone size={18} weight="duotone" />
    </button>
  );
}
