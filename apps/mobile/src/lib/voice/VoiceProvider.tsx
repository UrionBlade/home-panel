import type { VoiceStatus } from "@home-panel/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useVoice } from "../hooks/useVoice";
import { useVoiceSettings } from "../hooks/useVoiceSettings";
import { setVoiceQueryClient } from "./intentHandlers";

interface VoiceContextValue {
  status: VoiceStatus;
  transcript: string | null;
  response: string | null;
  supported: boolean;
  pushToTalk: () => void;
  toggle: () => void;
}

const VoiceContext = createContext<VoiceContextValue>({
  status: "disabled",
  transcript: null,
  response: null,
  supported: false,
  pushToTalk: () => {},
  toggle: () => {},
});

export function VoiceProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: settings } = useVoiceSettings();
  const enabled = settings?.enabled ?? false;
  const voice = useVoice(enabled);

  useEffect(() => {
    setVoiceQueryClient(qc);
  }, [qc]);

  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

export function useVoiceContext() {
  return useContext(VoiceContext);
}
