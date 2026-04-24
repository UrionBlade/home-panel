import type { VoiceStatus } from "@home-panel/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useRoutineVoiceTriggers } from "../hooks/useRoutines";
import { useVoice } from "../hooks/useVoice";
import { useVoiceSettings } from "../hooks/useVoiceSettings";
import { setVoiceQueryClient } from "./intentHandlers";
import { setRoutineTriggers } from "./routineTriggerRegistry";

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

  /* Keep the parser's routine-phrase registry in sync with the backend so
   * freshly-edited voice triggers start matching without a page reload. */
  const { data: triggers } = useRoutineVoiceTriggers();

  useEffect(() => {
    setVoiceQueryClient(qc);
  }, [qc]);

  useEffect(() => {
    setRoutineTriggers(triggers ?? []);
  }, [triggers]);

  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

export function useVoiceContext() {
  return useContext(VoiceContext);
}
