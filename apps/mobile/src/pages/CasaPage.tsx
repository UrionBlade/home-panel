import type { Room } from "@home-panel/shared";
import { HouseLineIcon, PlusIcon, SpinnerIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useState } from "react";
import { DeviceControlSheet } from "../components/casa/controls/DeviceControlSheet";
import { DeviceEditorSheet } from "../components/casa/DeviceEditorSheet";
import { RoomEditorSheet } from "../components/casa/RoomEditorSheet";
import { RoomSection } from "../components/casa/RoomSection";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/Button";
import type { DeviceEntity } from "../lib/devices/model";
import { useDeviceActions, useHomeDevices } from "../lib/devices/useHomeDevices";
import { useT } from "../lib/useT";

/**
 * La casa — vista unificata di tutte le stanze con i relativi device.
 *
 * Sostituisce la vecchia RoomsPage (che mischiava gestione stanze e un
 * DevicesSection tabellare). Qui la stanza è l'unità primaria: ogni
 * sezione editoriale mostra l'identità della stanza e i suoi device,
 * pronti per un singolo tap.
 *
 * Scalabile per nuovi device type senza toccare questa pagina: basta
 * aggiungere un proiettore in `lib/devices/model.ts` e cablarlo in
 * `useHomeDevices`. I sensori Zigbee porta/finestra, la sirena e le
 * prese smart sono già previsti nell'icon map e nella DeviceTile.
 */
export function CasaPage() {
  const { t } = useT("casa");
  const { rooms, devices, grouped, isLoading } = useHomeDevices();
  const actions = useDeviceActions();

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceEntity | null>(null);
  const [controlDevice, setControlDevice] = useState<DeviceEntity | null>(null);

  /* Tap sulla tile:
   *  - Luce → toggle on/off immediato (azione primaria diretta).
   *  - Tutti gli altri → apri il ControlSheet specifico per quel kind
   *    (AC, TV, Camera, Lavatrice/Asciugatrice), così l'utente accede
   *    ai comandi senza cambiare pagina.
   * Il menu ⋯ resta dedicato alla modifica del device (rinomina + sposta
   * stanza), chiaramente separato dall'azione principale. */
  const onPrimary = (device: DeviceEntity) => {
    if (device.kind === "light") {
      void actions.toggle(device);
      return;
    }
    /* Env sensors don't have actionable controls — tapping the tile
     * opens the same editor surface as the ⋯ menu, where rename + room
     * move + history charts live together. */
    if (device.kind === "sensor_air" || device.kind === "sensor_climate") {
      setEditingDevice(device);
      return;
    }
    setControlDevice(device);
  };

  const onMenu = (device: DeviceEntity) => {
    setEditingDevice(device);
  };

  const hasAnyDevice = devices.length > 0;
  const hasRooms = rooms.length > 0;

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<PlusIcon size={18} weight="bold" />}
            onClick={() => setCreatingRoom(true)}
          >
            {t("actions.addRoom")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <SpinnerIcon size={28} className="animate-spin text-text-muted" />
        </div>
      ) : !hasRooms && !hasAnyDevice ? (
        <FirstRunEmpty onAddRoom={() => setCreatingRoom(true)} />
      ) : (
        <motion.div
          className="flex flex-col gap-12"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.06 } },
          }}
        >
          {grouped.rooms.map(({ room, devices: roomDevices }) => (
            <RoomSection
              key={room?.id ?? "__no_room__"}
              room={room}
              devices={roomDevices}
              onPrimary={onPrimary}
              onMenu={onMenu}
              onEditRoom={setEditingRoom}
            />
          ))}

          {grouped.unassigned.length > 0 && (
            <RoomSection
              room={null}
              devices={grouped.unassigned}
              isUnassigned
              onPrimary={onPrimary}
              onMenu={onMenu}
            />
          )}

          {hasRooms && !hasAnyDevice && (
            <div className="rounded-lg border border-dashed border-border bg-surface-warm/60 px-6 py-8 text-center">
              <p className="text-text-muted max-w-md mx-auto">{t("noDevices")}</p>
            </div>
          )}
        </motion.div>
      )}

      <RoomEditorSheet
        open={creatingRoom || editingRoom !== null}
        room={editingRoom}
        onClose={() => {
          setCreatingRoom(false);
          setEditingRoom(null);
        }}
      />

      <DeviceEditorSheet
        open={editingDevice !== null}
        device={editingDevice}
        rooms={rooms}
        onClose={() => setEditingDevice(null)}
      />

      <DeviceControlSheet device={controlDevice} onClose={() => setControlDevice(null)} />
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  First-run: no rooms, no devices                                     */
/* ------------------------------------------------------------------ */

function FirstRunEmpty({ onAddRoom }: { onAddRoom: () => void }) {
  const { t } = useT("casa");
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
      className="max-w-xl mx-auto mt-10 flex flex-col items-center gap-5 text-center"
    >
      <span
        className="w-24 h-24 flex items-center justify-center rounded-2xl"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-accent) 14%, var(--color-surface-warm))",
          color: "var(--color-accent)",
        }}
      >
        <HouseLineIcon size={52} weight="duotone" />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl text-text">{t("firstRun.title")}</h2>
        <p className="label-italic text-text-muted">{t("firstRun.body")}</p>
      </div>
      <Button onClick={onAddRoom} iconLeft={<PlusIcon size={18} weight="bold" />}>
        {t("firstRun.cta")}
      </Button>
    </motion.div>
  );
}
