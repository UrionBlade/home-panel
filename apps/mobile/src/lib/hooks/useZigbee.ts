import {
  ZIGBEE_SSE_EVENTS,
  type ZigbeeBridgeState,
  type ZigbeeDevice,
  type ZigbeePermitJoinResponse,
  type ZigbeeStateResponse,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "../api-client";
import { sseClient } from "../sse-client";

const ZIGBEE_STATE_KEY = ["zigbee", "state"] as const;

export function useZigbeeState() {
  return useQuery({
    queryKey: ZIGBEE_STATE_KEY,
    queryFn: () => apiClient.get<ZigbeeStateResponse>("/api/v1/zigbee/state"),
    /* The SSE channel pushes deltas — fall back to a 60s poll only as a
     * safety net if the EventSource silently dies. */
    refetchInterval: 60_000,
  });
}

/** Subscribe to live bridge + device updates and merge them into the
 *  `zigbee:state` query cache. */
export function useZigbeeLiveSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const updateBridge = (raw: unknown) => {
      const next = raw as ZigbeeBridgeState;
      qc.setQueryData<ZigbeeStateResponse>(ZIGBEE_STATE_KEY, (prev) =>
        prev ? { ...prev, bridge: next } : prev,
      );
    };

    const updateDevices = (raw: unknown) => {
      const next = raw as ZigbeeDevice[];
      qc.setQueryData<ZigbeeStateResponse>(ZIGBEE_STATE_KEY, (prev) =>
        prev ? { ...prev, devices: next } : prev,
      );
    };

    const updateDevice = (raw: unknown) => {
      const next = raw as ZigbeeDevice;
      qc.setQueryData<ZigbeeStateResponse>(ZIGBEE_STATE_KEY, (prev) => {
        if (!prev) return prev;
        const found = prev.devices.some((d) => d.ieeeAddress === next.ieeeAddress);
        const devices = found
          ? prev.devices.map((d) => (d.ieeeAddress === next.ieeeAddress ? next : d))
          : [...prev.devices, next];
        return { ...prev, devices };
      });
    };

    const off1 = sseClient.subscribe(ZIGBEE_SSE_EVENTS.bridge, updateBridge);
    const off2 = sseClient.subscribe(ZIGBEE_SSE_EVENTS.devices, updateDevices);
    const off3 = sseClient.subscribe(ZIGBEE_SSE_EVENTS.device, updateDevice);
    return () => {
      off1();
      off2();
      off3();
    };
  }, [qc]);
}

export function useZigbeePermitJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (durationSeconds: number) =>
      apiClient.post<ZigbeePermitJoinResponse>("/api/v1/zigbee/permit-join", {
        durationSeconds,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ZIGBEE_STATE_KEY });
    },
  });
}

export function useZigbeeClosePermitJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ ok: true }>("/api/v1/zigbee/permit-join"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ZIGBEE_STATE_KEY });
    },
  });
}

export function useZigbeeRenameDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ieeeAddress, friendlyName }: { ieeeAddress: string; friendlyName: string }) =>
      apiClient.patch<{ ok: true }>(
        `/api/v1/zigbee/devices/${encodeURIComponent(ieeeAddress)}/name`,
        { friendlyName },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ZIGBEE_STATE_KEY });
    },
  });
}

export function useZigbeeRemoveDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ieeeAddress: string) =>
      apiClient.delete<{ ok: true }>(`/api/v1/zigbee/devices/${encodeURIComponent(ieeeAddress)}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ZIGBEE_STATE_KEY });
    },
  });
}

export function useZigbeeAssignRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ieeeAddress, roomId }: { ieeeAddress: string; roomId: string | null }) =>
      apiClient.patch<ZigbeeDevice>(
        `/api/v1/zigbee/devices/${encodeURIComponent(ieeeAddress)}/room`,
        { roomId },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ZIGBEE_STATE_KEY });
    },
  });
}
