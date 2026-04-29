import type { VoiceStatus } from "@home-panel/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useLights } from "../hooks/useLights";
import { useRooms } from "../hooks/useRooms";
import { useRoutineVoiceTriggers } from "../hooks/useRoutines";
import { useVoice } from "../hooks/useVoice";
import { useSyncVoiceSensitivity, useVoiceSettings } from "../hooks/useVoiceSettings";
import { setVoiceQueryClient } from "./intentHandlers";
import { setRoutineTriggers } from "./routineTriggerRegistry";

interface VoiceContextValue {
  status: VoiceStatus;
  transcript: string | null;
  response: string | null;
  supported: boolean;
  pushToTalk: () => void;
  toggle: () => void;
  /** Close the current listening / speaking overlay without disabling
   * the wake-word loop — see useVoice.dismiss for the rationale. */
  dismiss: () => void;
}

const VoiceContext = createContext<VoiceContextValue>({
  status: "disabled",
  transcript: null,
  response: null,
  supported: false,
  pushToTalk: () => {},
  toggle: () => {},
  dismiss: () => {},
});

export function VoiceProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: settings } = useVoiceSettings();
  const enabled = settings?.enabled ?? false;
  const voice = useVoice(enabled);

  /* Keep the Swift VAD threshold aligned with the user-configured slider so
   * the gate updates without a relaunch when they nudge the sensitivity. */
  useSyncVoiceSensitivity();

  /* Keep the parser's routine-phrase registry in sync with the backend so
   * freshly-edited voice triggers start matching without a page reload. */
  const { data: triggers } = useRoutineVoiceTriggers();

  /* Warm up the rooms + lights caches so the voice matcher can resolve
   * `roomId` → room name on the very first command, even if the user
   * hasn't visited Settings/Lights/Rooms yet this session. Without this
   * the fuzzy scorer in lightIntents runs with an empty rooms cache and
   * "accendi luci giardino" scores zero against a light whose only link
   * to the room is the FK. */
  useLights();
  useRooms();

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
