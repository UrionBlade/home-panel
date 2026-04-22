/** Tipo di elettrodomestico */
export type LaundryApplianceType = "washer" | "dryer";

/** Stato macchina (comune a lavatrice e asciugatrice) */
export type MachineState = "stop" | "run" | "pause";

/** Fase del ciclo lavatrice */
export type WasherJobState =
  | "none"
  | "weightSensing"
  | "wash"
  | "rinse"
  | "spin"
  | "wrinklePrevent"
  | "finish"
  | "airWash";

/** Fase del ciclo asciugatrice */
export type DryerJobState =
  | "none"
  | "weightSensing"
  | "drying"
  | "cooling"
  | "wrinklePrevent"
  | "finish";

/** Stato di un singolo elettrodomestico */
export interface LaundryAppliance {
  id: string;
  name: string;
  type: LaundryApplianceType;
  machineState: MachineState;
  jobState: WasherJobState | DryerJobState;
  /** ISO 8601 timestamp di fine ciclo stimato (null se fermo) */
  completionTime: string | null;
  /** Acceso/spento */
  power: boolean;
  /** Controllo remoto abilitato dal pannello fisico */
  remoteControlEnabled: boolean;
  /** Programma selezionato (es. "cotone", "sintetici") */
  mode: string | null;
  /** Temperatura acqua (solo lavatrice) */
  waterTemperature: string | null;
  /** Livello centrifuga (solo lavatrice) */
  spinLevel: string | null;
  /** Numero risciacqui (solo lavatrice) */
  rinseCycles: number | null;
  /** Consumo energetico in Wh (cumulativo) */
  energyWh: number | null;
  /** Ultimo aggiornamento dal cloud SmartThings */
  updatedAt: string;
}

/** Comando da inviare a un elettrodomestico */
export type LaundryCommand = "start" | "stop" | "pause";

/** Input per inviare un comando */
export interface LaundryCommandInput {
  deviceId: string;
  command: LaundryCommand;
}

/** Stato complessivo lavanderia */
export interface LaundryStatus {
  configured: boolean;
  appliances: LaundryAppliance[];
}

/** Config SmartThings (per settings) */
export interface SmartThingsConfig {
  configured: boolean;
  /** Device IDs selezionati */
  washerDeviceId: string | null;
  dryerDeviceId: string | null;
  /** Room assignments, nullable — same semantics as other device roomId
   * fields (null = "Senza stanza", stale ids silently orphaned). */
  washerRoomId: string | null;
  dryerRoomId: string | null;
}

/** Input per setup SmartThings */
export interface SmartThingsSetupInput {
  pat: string;
}

/** Device scoperto da SmartThings (per selezione) */
export interface SmartThingsDevice {
  deviceId: string;
  name: string;
  label: string;
  type: LaundryApplianceType | "unknown";
}

/** Input per assegnare device */
export interface SmartThingsAssignInput {
  washerDeviceId?: string | null;
  dryerDeviceId?: string | null;
  washerRoomId?: string | null;
  dryerRoomId?: string | null;
}
