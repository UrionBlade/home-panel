import type { UpdateVoiceSettingsInput, VoiceSettings } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const VOICE_SETTINGS_KEY = ["voice", "settings"] as const;

export function useVoiceSettings() {
  return useQuery({
    queryKey: VOICE_SETTINGS_KEY,
    queryFn: () => apiClient.get<VoiceSettings>("/api/v1/voice/settings"),
  });
}

export function useUpdateVoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateVoiceSettingsInput) =>
      apiClient.patch<VoiceSettings>("/api/v1/voice/settings", input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: VOICE_SETTINGS_KEY });
      const prev = qc.getQueryData<VoiceSettings>(VOICE_SETTINGS_KEY);
      qc.setQueryData<VoiceSettings>(VOICE_SETTINGS_KEY, (old) =>
        old ? { ...old, ...input } : old,
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(VOICE_SETTINGS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: VOICE_SETTINGS_KEY }),
  });
}
