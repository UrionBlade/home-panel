import {
  ALARM_SSE_EVENTS,
  type AlarmEvent,
  type AlarmState,
  type AlarmStateResponse,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "../api-client";
import { sseClient } from "../sse-client";

const ALARM_STATE_KEY = ["alarm", "state"] as const;

export function useAlarmState() {
  return useQuery({
    queryKey: ALARM_STATE_KEY,
    queryFn: () => apiClient.get<AlarmStateResponse>("/api/v1/alarm/state"),
    refetchInterval: 60_000,
  });
}

interface AlarmStatePush {
  state: AlarmState;
  unreadCount: number;
}

export function useAlarmLiveSync(onTriggered?: (event: AlarmEvent) => void) {
  const qc = useQueryClient();

  useEffect(() => {
    const handleState = (raw: unknown) => {
      const update = raw as AlarmStatePush | null;
      if (!update) return;
      qc.setQueryData<AlarmStateResponse>(ALARM_STATE_KEY, (prev) =>
        prev
          ? { ...prev, state: update.state, unreadCount: update.unreadCount }
          : { state: update.state, unreadCount: update.unreadCount, events: [] },
      );
    };

    const handleTriggered = (raw: unknown) => {
      const event = raw as AlarmEvent | null;
      if (!event) return;
      qc.setQueryData<AlarmStateResponse>(ALARM_STATE_KEY, (prev) =>
        prev
          ? {
              ...prev,
              events: [event, ...prev.events].slice(0, 50),
              unreadCount: prev.unreadCount + 1,
            }
          : prev,
      );
      onTriggered?.(event);
    };

    const handleAck = () => {
      void qc.invalidateQueries({ queryKey: ALARM_STATE_KEY });
    };

    const off1 = sseClient.subscribe(ALARM_SSE_EVENTS.state, handleState);
    const off2 = sseClient.subscribe(ALARM_SSE_EVENTS.triggered, handleTriggered);
    const off3 = sseClient.subscribe(ALARM_SSE_EVENTS.acknowledged, handleAck);
    return () => {
      off1();
      off2();
      off3();
    };
  }, [qc, onTriggered]);
}

export function useAlarmArm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode?: string) =>
      apiClient.post<{ state: AlarmState }>("/api/v1/alarm/arm", { mode }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ALARM_STATE_KEY });
    },
  });
}

export function useAlarmDisarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ state: AlarmState }>("/api/v1/alarm/disarm"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ALARM_STATE_KEY });
    },
  });
}

export function useAlarmAcknowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<AlarmEvent>(`/api/v1/alarm/events/${encodeURIComponent(id)}/ack`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ALARM_STATE_KEY });
    },
  });
}

export function useAlarmAckAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ updated: number }>("/api/v1/alarm/events/ack-all"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ALARM_STATE_KEY });
    },
  });
}
