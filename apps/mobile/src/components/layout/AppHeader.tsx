import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-client";
import { useT } from "../../lib/useT";
import { useVoiceContext } from "../../lib/voice/VoiceProvider";
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
}

export function AppHeader({ hideClock, title }: AppHeaderProps) {
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
    <header className="flex items-center justify-between gap-4 px-6 md:px-8 py-4 bg-surface/70 backdrop-blur-sm sticky top-0 z-20">
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="font-display text-2xl md:text-3xl tracking-tight truncate">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <HeaderWeather />
        {!hideClock && <Clock variant="compact" />}
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
