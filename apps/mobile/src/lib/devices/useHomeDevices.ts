import { useMemo } from "react";
import { useAcCommand, useAcConfig, useAcDevices, useUpdateAcDevice } from "../hooks/useAc";
import { useCameras, useUpdateCameraRoom } from "../hooks/useBlink";
import { useIpCameras, useUpdateIpCamera } from "../hooks/useIpCameras";
import { useAssignDevices, useLaundryConfig, useLaundryStatus } from "../hooks/useLaundry";
import { useLightCommand, useLights, useUpdateLight } from "../hooks/useLights";
import { useRooms } from "../hooks/useRooms";
import { useTvAssign, useTvConfig, useTvPower, useTvStatus } from "../hooks/useTv";
import type { DeviceEntity } from "./model";
import {
  groupDevicesByRoom,
  projectAc,
  projectCamera,
  projectDryer,
  projectIpCamera,
  projectLight,
  projectTv,
  projectWasher,
} from "./model";

/**
 * Aggregate every known device type into one RoomWithDevices[] shape
 * plus a flat `devices` list. Single source of truth for CasaPage and
 * anything else that needs a provider-agnostic home map.
 */
export function useHomeDevices() {
  const roomsQ = useRooms();
  const lightsQ = useLights();
  const camerasQ = useCameras();
  const ipCamerasQ = useIpCameras();
  const acConfigQ = useAcConfig();
  const acDevicesQ = useAcDevices(acConfigQ.data?.configured ?? false);
  const tvConfigQ = useTvConfig();
  const tvStatusQ = useTvStatus();
  const laundryConfigQ = useLaundryConfig();
  const laundryStatusQ = useLaundryStatus();

  const devices: DeviceEntity[] = useMemo(() => {
    const out: DeviceEntity[] = [];
    for (const l of lightsQ.data ?? []) out.push(projectLight(l));
    for (const a of acDevicesQ.data ?? []) out.push(projectAc(a));
    for (const c of camerasQ.data ?? []) out.push(projectCamera(c));
    for (const c of ipCamerasQ.data ?? []) out.push(projectIpCamera(c));

    const tv = projectTv(tvConfigQ.data, tvStatusQ.data);
    if (tv) out.push(tv);

    const laundryCfg = laundryConfigQ.data;
    const appliances = laundryStatusQ.data?.appliances ?? [];
    const washerAppliance = appliances.find((a) => a.id === laundryCfg?.washerDeviceId);
    const dryerAppliance = appliances.find((a) => a.id === laundryCfg?.dryerDeviceId);
    const washer = projectWasher(laundryCfg, washerAppliance);
    if (washer) out.push(washer);
    const dryer = projectDryer(laundryCfg, dryerAppliance);
    if (dryer) out.push(dryer);

    return out;
  }, [
    lightsQ.data,
    acDevicesQ.data,
    camerasQ.data,
    ipCamerasQ.data,
    tvConfigQ.data,
    tvStatusQ.data,
    laundryConfigQ.data,
    laundryStatusQ.data,
  ]);

  const grouped = useMemo(
    () => groupDevicesByRoom(roomsQ.data ?? [], devices),
    [roomsQ.data, devices],
  );

  return {
    rooms: roomsQ.data ?? [],
    devices,
    grouped,
    isLoading: roomsQ.isLoading || lightsQ.isLoading || camerasQ.isLoading,
  };
}

/**
 * Action dispatcher — centralised so components never have to know
 * which hook handles which kind. The return shape mirrors the tile's
 * action surface: toggle (primary), rename, moveTo (assignment).
 *
 * All actions are fire-and-forget; mutations surface errors via toasts
 * inside their respective query hooks. Returning the promise lets
 * callers `await` where they need to (e.g. to close a sheet on success).
 */
/**
 * Le IP camera ricevono un id prefissato `ip:<uuid>` per evitare
 * collisioni con altri kind. Prima di chiamare l'API strippiamo il
 * prefisso.
 */
function stripIpPrefix(id: string): string {
  return id.startsWith("ip:") ? id.slice(3) : id;
}

export function useDeviceActions() {
  const lightCommand = useLightCommand();
  const lightUpdate = useUpdateLight();
  const acCommand = useAcCommand();
  const acUpdate = useUpdateAcDevice();
  const cameraRoomUpdate = useUpdateCameraRoom();
  const ipCameraUpdate = useUpdateIpCamera();
  const tvPower = useTvPower();
  const tvAssign = useTvAssign();
  const laundryAssign = useAssignDevices();

  return useMemo(
    () => ({
      /** Primary one-tap action. Lights/AC/TV toggle power; other kinds no-op. */
      toggle(entity: DeviceEntity): Promise<unknown> {
        switch (entity.kind) {
          case "light":
            return lightCommand.mutateAsync({ id: entity.id, toggle: true });
          case "ac": {
            const current = entity.status === "on";
            return acCommand.mutateAsync({ id: entity.id, power: !current });
          }
          case "tv": {
            const isOn = entity.status === "on";
            return tvPower.mutateAsync({ on: !isOn });
          }
          default:
            return Promise.resolve();
        }
      },

      /** Rename where supported. No-op (rejected) for provider-owned names. */
      rename(entity: DeviceEntity, newName: string): Promise<unknown> {
        if (!entity.renameable) {
          return Promise.reject(new Error("Non rinominabile da qui"));
        }
        switch (entity.kind) {
          case "light":
            return lightUpdate.mutateAsync({ id: entity.id, input: { name: newName } });
          case "ac":
            return acUpdate.mutateAsync({ id: entity.id, nickname: newName });
          case "ip_camera":
            return ipCameraUpdate.mutateAsync({
              id: stripIpPrefix(entity.id),
              input: { name: newName },
            });
          default:
            return Promise.reject(new Error("Rinomina non supportata per questo tipo"));
        }
      },

      /** Move the device to a different room (or unassign when roomId=null). */
      moveTo(entity: DeviceEntity, roomId: string | null): Promise<unknown> {
        switch (entity.kind) {
          case "light":
            return lightUpdate.mutateAsync({ id: entity.id, input: { roomId } });
          case "ac":
            return acUpdate.mutateAsync({ id: entity.id, roomId });
          case "camera":
            return cameraRoomUpdate.mutateAsync({ id: entity.id, roomId });
          case "ip_camera":
            return ipCameraUpdate.mutateAsync({
              id: stripIpPrefix(entity.id),
              input: { roomId },
            });
          case "tv":
            return tvAssign.mutateAsync({ tvRoomId: roomId });
          case "washer":
            return laundryAssign.mutateAsync({ washerRoomId: roomId });
          case "dryer":
            return laundryAssign.mutateAsync({ dryerRoomId: roomId });
          default:
            return Promise.reject(new Error("Assegnazione non supportata"));
        }
      },
    }),
    [
      lightCommand,
      lightUpdate,
      acCommand,
      acUpdate,
      cameraRoomUpdate,
      ipCameraUpdate,
      tvPower,
      tvAssign,
      laundryAssign,
    ],
  );
}
