import type { EnvSensor } from "@home-panel/shared";
import type { DeviceEntity } from "../../../lib/devices/model";
import { AcControlSheet } from "./AcControlSheet";
import { CameraControlSheet } from "./CameraControlSheet";
import { EnvSensorControlSheet } from "./EnvSensorControlSheet";
import { IpCameraControlSheet } from "./IpCameraControlSheet";
import { LaundryControlSheet } from "./LaundryControlSheet";
import { TvControlSheet } from "./TvControlSheet";

interface DeviceControlSheetProps {
  /** Device corrente (null = nessuno sheet aperto). */
  device: DeviceEntity | null;
  onClose: () => void;
}

/**
 * Dispatcher che, dato un DeviceEntity, renderizza il ControlSheet
 * giusto per il suo `kind`. Le luci NON passano di qui: l'azione
 * primaria (toggle) viene gestita direttamente da CasaPage.
 *
 * Aggiungere un nuovo device type = un nuovo case qui + un nuovo
 * *ControlSheet in `controls/`. I sensori porta/finestra, la sirena
 * e le prese smart arriveranno così, senza tocchi a CasaPage né a
 * DeviceTile.
 */
export function DeviceControlSheet({ device, onClose }: DeviceControlSheetProps) {
  const open = device !== null;
  if (!device) return null;

  switch (device.kind) {
    case "ac":
      return <AcControlSheet open={open} device={device} onClose={onClose} />;
    case "tv":
      return <TvControlSheet open={open} device={device} onClose={onClose} />;
    case "camera":
      return <CameraControlSheet open={open} device={device} onClose={onClose} />;
    case "ip_camera":
      return <IpCameraControlSheet open={open} device={device} onClose={onClose} />;
    case "washer":
    case "dryer":
      return <LaundryControlSheet open={open} device={device} onClose={onClose} />;
    case "sensor_air":
    case "sensor_climate":
      /* The DeviceEntity carries the EnvSensor row in `raw` (see
       * projectEnvSensor in lib/devices/model.ts). The detail sheet is
       * read-only — sensors don't expose actions, just a richer view of
       * their last reading + 7-day history. */
      return (
        <EnvSensorControlSheet open={open} sensor={device.raw as EnvSensor} onClose={onClose} />
      );
    default:
      /* Lights and future sensor/siren/plug kinds don't open a control
       * sheet — they toggle directly or, when not supported, go straight
       * to the edit sheet via ⋯. */
      return null;
  }
}
