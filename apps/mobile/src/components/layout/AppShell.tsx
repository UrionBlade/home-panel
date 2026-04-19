import { QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { type ReactNode, useEffect, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { useKioskPhotos, useKioskSettings } from "../../lib/hooks/useKioskSettings";
import { i18next } from "../../lib/i18n";
import { useKioskMode } from "../../lib/kiosk";
import { NightModeProvider } from "../../lib/kiosk/NightModeProvider";
import { useIdleDetection } from "../../lib/kiosk/useIdleDetection";
import { queryClient } from "../../lib/query-client";
import { sseClient } from "../../lib/sse-client";
import { ThemeProvider } from "../../lib/theme/ThemeProvider";
import { VoiceProvider } from "../../lib/voice/VoiceProvider";
import { ScreensaverOverlay } from "../kiosk/ScreensaverOverlay";
import { TimerOverlay } from "../timers/TimerOverlay";
import { ToastContainer } from "../ui/Toast";
import { VoiceDebugPanel } from "../voice/VoiceDebugPanel";
import { VoiceListeningOverlay } from "../voice/VoiceListeningOverlay";
import { AppHeader } from "./AppHeader";
import { ErrorBoundary } from "./ErrorBoundary";

import { SideNav } from "./SideNav";

interface AppShellProps {
  children: ReactNode;
  /** True on the home page: hides the compact header clock (the home already has a hero clock) */
  hideClock?: boolean;
  /** titolo opzionale mostrato nell'header */
  title?: string;
}

function KioskActivator() {
  useKioskMode({ keepScreenOn: true });
  return null;
}

const SSE_URL = `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"}/api/v1/sse?token=${import.meta.env.VITE_API_TOKEN ?? ""}`;

function SSEConnector() {
  useEffect(() => {
    sseClient.connect(SSE_URL);
    return () => sseClient.disconnect();
  }, []);
  return null;
}

const DEFAULT_IDLE_MS = 5 * 60 * 1000;

function ScreensaverManager() {
  const { data: settings } = useKioskSettings();
  const { data: photos } = useKioskPhotos();

  const idleMs = settings ? settings.screensaverIdleMinutes * 60 * 1000 : DEFAULT_IDLE_MS;
  const { isIdle, resetIdle } = useIdleDetection(idleMs);

  const showScreensaver = isIdle && (settings?.screensaverEnabled ?? false);

  const photoUrls = useMemo(() => (photos ?? []).map((p) => p.url), [photos]);

  return (
    <AnimatePresence>
      {showScreensaver && <ScreensaverOverlay photoUrls={photoUrls} onDismiss={resetIdle} />}
    </AnimatePresence>
  );
}

export function AppShell({ children, hideClock, title }: AppShellProps) {
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18next}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <NightModeProvider>
              <VoiceProvider>
                <KioskActivator />
                <SSEConnector />
                <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
                  <SideNav />
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <AppHeader hideClock={hideClock} title={title} />
                    <main className="flex-1 overflow-auto">{children}</main>
                  </div>
                  <ToastContainer />
                </div>
                <TimerOverlay />
                <VoiceListeningOverlay />
                <VoiceDebugPanel />
                <ScreensaverManager />
              </VoiceProvider>
            </NightModeProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
}
