import { ListIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-client";
import { useT } from "../../lib/useT";
import { useVoiceContext } from "../../lib/voice/VoiceProvider";
import { VoiceInvitePill } from "../voice/VoiceInvitePill";
import { VoicePrivacyIndicator } from "../voice/VoicePrivacyIndicator";
import { VoiceWaveIndicator } from "../voice/VoiceWaveIndicator";
import { Clock } from "./Clock";
import { HeaderWeather } from "./HeaderWeather";

interface HealthBeat {
  status: string;
  uptime: number;
}

interface AppHeaderProps {
  hideClock?: boolean;
  title?: string;
  /** Opens the mobile navigation drawer (shown only below md breakpoint). */
  onOpenNav?: () => void;
}

export function AppHeader({ hideClock, title, onOpenNav }: AppHeaderProps) {
  const { t } = useT("common");
  const { isError } = useQuery<HealthBeat>({
    queryKey: ["health"],
    queryFn: () => apiClient.get<HealthBeat>("/health"),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const voice = useVoiceContext();

  const status: "ok" | "error" = isError ? "error" : "ok";
  const dotClass = status === "ok" ? "bg-success" : "bg-danger";
  const dotLabel = status === "ok" ? t("backend.connected") : t("backend.disconnected");

  return (
    <header className="flex items-center justify-between gap-3 md:gap-4 px-4 sm:px-6 md:px-8 py-3 md:py-4 bg-surface/70 backdrop-blur-sm sticky top-0 z-20">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {onOpenNav && (
          <button
            type="button"
            onClick={onOpenNav}
            aria-label={t("aria.openNav")}
            className="md:hidden p-2 -ml-2 rounded-md text-text-muted hover:text-text hover:bg-surface-warm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ListIcon size={24} weight="bold" />
          </button>
        )}
        {title && (
          <h1 className="font-display text-2xl md:text-3xl tracking-tight truncate">{title}</h1>
        )}
        {/* Voice invite pill is too wide for phones — hide on < md; voice is still
         * reachable via the privacy indicator (mic button) on the right. */}
        {!title && (
          <div className="hidden md:flex min-w-0">
            <VoiceInvitePill />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <HeaderWeather />
        {/* Clock hidden on phones: iPhone status bar already shows the time. */}
        {!hideClock && (
          <div className="hidden md:flex">
            <Clock variant="compact" />
          </div>
        )}
        {voice.supported && (
          <>
            <VoiceWaveIndicator status={voice.status} />
            <VoicePrivacyIndicator status={voice.status} onToggle={voice.toggle} />
          </>
        )}
        <span
          role="img"
          className={`inline-flex w-2 h-2 rounded-full ${dotClass}`}
          aria-label={dotLabel}
          title={dotLabel}
        />
      </div>
    </header>
  );
}
