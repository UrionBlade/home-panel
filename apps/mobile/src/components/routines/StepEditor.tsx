/**
 * Single-step editor inside the routine editor.
 *
 * Renders an action picker (grouped dropdown) + a contextual parameter form
 * that adapts to the currently-selected action type. The parent owns the
 * step array — we only emit `onChange(newStep)` / `onRemove()` / `onMove()`.
 */

import type { LightSummary, Room, RoutineActionType, RoutineStep } from "@home-panel/shared";
import { DotsSixVerticalIcon, XIcon } from "@phosphor-icons/react";
import { useT } from "../../lib/useT";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";
import { Input } from "../ui/Input";

interface StepEditorProps {
  step: RoutineStep;
  index: number;
  onChange: (step: RoutineStep) => void;
  onRemove: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isDragTarget: boolean;
  devices: EditorDeviceCatalog;
}

/** Everything the editor needs to render dropdowns for device ids. Collected
 * once by the parent so we don't trigger N queries per step. */
export interface EditorDeviceCatalog {
  lights: LightSummary[];
  rooms: Room[];
  acDevices: { id: string; nickname: string | null }[];
  cameras: { id: string; name: string }[];
}

/* Grouped action catalogue. Order within a group is the order shown in the
 * dropdown popover. */
const ACTION_GROUPS: { key: string; actions: RoutineActionType[] }[] = [
  {
    key: "lights",
    actions: ["light.set", "light.toggle", "lights.room", "lights.all"],
  },
  { key: "ac", actions: ["ac.power", "ac.set_mode", "ac.set_temp", "ac.set_fan"] },
  { key: "cameras", actions: ["blink.arm", "blink.disarm", "blink.arm_all", "blink.disarm_all"] },
  {
    key: "spotify",
    actions: [
      "spotify.play",
      "spotify.pause",
      "spotify.next",
      "spotify.previous",
      "spotify.volume",
      "spotify.play_uri",
    ],
  },
  { key: "tv", actions: ["tv.power", "tv.volume", "tv.mute", "tv.launch_app"] },
  { key: "alarm", actions: ["alarm.arm", "alarm.disarm"] },
  { key: "shopping", actions: ["shopping.add"] },
  { key: "timer", actions: ["timer.start", "timer.stop_all"] },
  { key: "meta", actions: ["voice.speak", "delay"] },
];

export function StepEditor({
  step,
  index,
  onChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDragTarget,
  devices,
}: StepEditorProps) {
  const { t } = useT("routines");

  const options: DropdownOption[] = ACTION_GROUPS.flatMap((group) =>
    group.actions.map((action) => ({
      value: action,
      label: t(`actionLabels.${action}` as never),
      hint: t(`groupLabels.${group.key}` as never),
    })),
  );

  const switchAction = (next: string) => {
    onChange(defaultStepForAction(next as RoutineActionType));
  };

  return (
    <div
      role="group"
      aria-label={`Step ${index + 1}`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`flex flex-col gap-3 rounded-lg border bg-surface p-4 transition-all ${
        isDragging ? "opacity-40" : ""
      } ${isDragTarget ? "border-accent ring-2 ring-accent/30" : "border-border"}`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle: the only draggable region. Making the whole card
         * draggable would hijack every touch/click on inputs, which is
         * especially bad on tablets where we lack a secondary pointer. */}
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            /* Firefox requires some data on the drag event. */
            e.dataTransfer.setData("text/plain", String(index));
            onDragStart(index);
          }}
          onDragEnd={onDragEnd}
          aria-label={t("editor.steps.drag")}
          className="mt-3 p-1 rounded text-text-subtle hover:text-text cursor-grab active:cursor-grabbing touch-none"
        >
          <DotsSixVerticalIcon size={20} weight="bold" />
        </button>
        <span className="mt-4 font-display font-bold tabular-nums text-text-muted text-lg shrink-0 w-5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <Dropdown
            label={undefined}
            options={options}
            value={step.action}
            onChange={switchAction}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("editor.steps.remove")}
          className="mt-2 p-2 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 shrink-0"
        >
          <XIcon size={18} weight="bold" />
        </button>
      </div>

      <StepParamsEditor step={step} onChange={onChange} devices={devices} />

      <label className="flex items-center gap-2 text-sm text-text-subtle">
        <input
          type="checkbox"
          checked={step.continueOnError === true}
          onChange={(e) => onChange({ ...step, continueOnError: e.target.checked })}
          className="h-4 w-4 rounded accent-accent"
        />
        {t("editor.steps.continueOnError")}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Params form                                                              */
/* ------------------------------------------------------------------------ */

function StepParamsEditor({
  step,
  onChange,
  devices,
}: {
  step: RoutineStep;
  onChange: (s: RoutineStep) => void;
  devices: EditorDeviceCatalog;
}) {
  const { t } = useT("routines");

  /* Every branch narrows `step` + emits a typed mutation to keep the
   * discriminated union happy. The params editor is intentionally verbose —
   * a tidy `<ParamField name kind />` abstraction ends up fighting TS rather
   * than helping it. */
  switch (step.action) {
    case "light.set":
      return (
        <div className="flex gap-3 flex-col sm:flex-row">
          <DeviceDropdown
            label={t("params.lightId")}
            value={step.params.lightId}
            options={devices.lights.map((l) => ({
              value: l.id,
              label: l.name,
              hint: l.room ?? undefined,
            }))}
            onChange={(v) => onChange({ ...step, params: { ...step.params, lightId: v } })}
          />
          <OnOffDropdown
            value={step.params.state}
            onChange={(v) => onChange({ ...step, params: { ...step.params, state: v } })}
          />
        </div>
      );
    case "light.toggle":
      return (
        <DeviceDropdown
          label={t("params.lightId")}
          value={step.params.lightId}
          options={devices.lights.map((l) => ({
            value: l.id,
            label: l.name,
            hint: l.room ?? undefined,
          }))}
          onChange={(v) => onChange({ ...step, params: { lightId: v } })}
        />
      );
    case "lights.room":
      return (
        <div className="flex gap-3 flex-col sm:flex-row">
          <DeviceDropdown
            label={t("params.roomId")}
            value={step.params.roomId}
            options={devices.rooms.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(v) => onChange({ ...step, params: { ...step.params, roomId: v } })}
          />
          <OnOffDropdown
            value={step.params.state}
            onChange={(v) => onChange({ ...step, params: { ...step.params, state: v } })}
          />
        </div>
      );
    case "lights.all":
      return (
        <OnOffDropdown
          value={step.params.state}
          onChange={(v) => onChange({ ...step, params: { state: v } })}
        />
      );
    case "ac.power":
      return (
        <div className="flex gap-3 flex-col sm:flex-row">
          <DeviceDropdown
            label={t("params.deviceId")}
            value={step.params.deviceId}
            options={devices.acDevices.map((d) => ({
              value: d.id,
              label: d.nickname ?? d.id,
            }))}
            onChange={(v) => onChange({ ...step, params: { ...step.params, deviceId: v } })}
          />
          <Dropdown
            label={t("params.power")}
            value={step.params.power ? "on" : "off"}
            options={[
              { value: "on", label: t("params.powerOn") },
              { value: "off", label: t("params.powerOff") },
            ]}
            onChange={(v) => onChange({ ...step, params: { ...step.params, power: v === "on" } })}
          />
        </div>
      );
    case "ac.set_mode":
      return (
        <div className="flex gap-3 flex-col sm:flex-row">
          <DeviceDropdown
            label={t("params.deviceId")}
            value={step.params.deviceId}
            options={devices.acDevices.map((d) => ({ value: d.id, label: d.nickname ?? d.id }))}
            onChange={(v) => onChange({ ...step, params: { ...step.params, deviceId: v } })}
          />
          <Dropdown
            label={t("params.mode")}
            value={step.params.mode}
            options={[
              { value: "cool", label: t("params.modeCool") },
              { value: "heat", label: t("params.modeHeat") },
              { value: "dry", label: t("params.modeDry") },
              { value: "fan", label: t("params.modeFan") },
              { value: "auto", label: t("params.modeAuto") },
            ]}
            onChange={(v) =>
              onChange({
                ...step,
                params: { ...step.params, mode: v as typeof step.params.mode },
              })
            }
          />
        </div>
      );
    case "ac.set_temp":
      return (
        <div className="flex gap-3 flex-col sm:flex-row">
          <DeviceDropdown
            label={t("params.deviceId")}
            value={step.params.deviceId}
            options={devices.acDevices.map((d) => ({ value: d.id, label: d.nickname ?? d.id }))}
            onChange={(v) => onChange({ ...step, params: { ...step.params, deviceId: v } })}
          />
          <Input
            type="number"
            label={t("params.targetTemp")}
            value={step.params.targetTemp}
            min={16}
            max={32}
            onChange={(e) =>
              onChange({
                ...step,
                params: { ...step.params, targetTemp: Number(e.target.value) || 24 },
              })
            }
          />
        </div>
      );
    case "ac.set_fan":
      return (
        <div className="flex gap-3 flex-col sm:flex-row">
          <DeviceDropdown
            label={t("params.deviceId")}
            value={step.params.deviceId}
            options={devices.acDevices.map((d) => ({ value: d.id, label: d.nickname ?? d.id }))}
            onChange={(v) => onChange({ ...step, params: { ...step.params, deviceId: v } })}
          />
          <Dropdown
            label={t("params.fanSpeed")}
            value={step.params.fanSpeed}
            options={[
              { value: "auto", label: t("params.fanAuto") },
              { value: "low", label: t("params.fanLow") },
              { value: "mid", label: t("params.fanMid") },
              { value: "high", label: t("params.fanHigh") },
            ]}
            onChange={(v) =>
              onChange({
                ...step,
                params: { ...step.params, fanSpeed: v as typeof step.params.fanSpeed },
              })
            }
          />
        </div>
      );
    case "blink.arm":
    case "blink.disarm":
      return (
        <DeviceDropdown
          label={t("params.cameraId")}
          value={step.params.cameraId}
          options={devices.cameras.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => onChange({ ...step, params: { cameraId: v } })}
        />
      );
    case "blink.arm_all":
    case "blink.disarm_all":
    case "spotify.play":
    case "spotify.pause":
    case "spotify.next":
    case "spotify.previous":
    case "alarm.disarm":
    case "timer.stop_all":
      return null;
    case "alarm.arm":
      return (
        <Dropdown
          label={t("params.alarmMode")}
          value={step.params?.mode ?? ""}
          options={[
            { value: "", label: t("params.alarmModeDefault") },
            { value: "home", label: t("params.alarmModeHome") },
            { value: "away", label: t("params.alarmModeAway") },
            { value: "night", label: t("params.alarmModeNight") },
          ]}
          onChange={(v) => onChange({ ...step, params: v ? { mode: v } : { mode: null } })}
        />
      );
    case "spotify.volume":
      return (
        <Input
          type="number"
          label={t("params.volumePercent")}
          value={step.params.volumePercent}
          min={0}
          max={100}
          onChange={(e) =>
            onChange({ ...step, params: { volumePercent: Number(e.target.value) || 0 } })
          }
        />
      );
    case "spotify.play_uri":
      return (
        <Input
          label={t("params.contextUri")}
          value={step.params.contextUri}
          placeholder={t("params.contextUriPlaceholder")}
          onChange={(e) => onChange({ ...step, params: { contextUri: e.target.value } })}
        />
      );
    case "tv.power":
      return (
        <Dropdown
          label={t("params.on")}
          value={step.params.on ? "on" : "off"}
          options={[
            { value: "on", label: t("params.powerOn") },
            { value: "off", label: t("params.powerOff") },
          ]}
          onChange={(v) => onChange({ ...step, params: { on: v === "on" } })}
        />
      );
    case "tv.volume":
      return (
        <Input
          type="number"
          label={t("params.level")}
          value={step.params.level}
          min={0}
          max={100}
          onChange={(e) => onChange({ ...step, params: { level: Number(e.target.value) || 0 } })}
        />
      );
    case "tv.mute":
      return (
        <Dropdown
          label={t("params.muted")}
          value={step.params.muted ? "on" : "off"}
          options={[
            { value: "on", label: t("params.stateOn") },
            { value: "off", label: t("params.stateOff") },
          ]}
          onChange={(v) => onChange({ ...step, params: { muted: v === "on" } })}
        />
      );
    case "tv.launch_app":
      return (
        <Input
          label={t("params.appId")}
          value={step.params.appId}
          placeholder={t("params.appIdPlaceholder")}
          onChange={(e) => onChange({ ...step, params: { appId: e.target.value } })}
        />
      );
    case "shopping.add":
      return (
        <Input
          label={t("params.name")}
          value={step.params.name}
          onChange={(e) => onChange({ ...step, params: { name: e.target.value } })}
        />
      );
    case "timer.start":
      return (
        <div className="flex gap-3 flex-col sm:flex-row">
          <Input
            type="number"
            label={t("params.durationSeconds")}
            value={step.params.durationSeconds}
            min={1}
            onChange={(e) =>
              onChange({
                ...step,
                params: { ...step.params, durationSeconds: Number(e.target.value) || 60 },
              })
            }
          />
          <Input
            label={t("params.label")}
            value={step.params.label ?? ""}
            onChange={(e) =>
              onChange({ ...step, params: { ...step.params, label: e.target.value || null } })
            }
          />
        </div>
      );
    case "delay":
      return (
        <Input
          type="number"
          label={t("params.ms")}
          value={step.params.ms}
          min={0}
          max={60_000}
          onChange={(e) => onChange({ ...step, params: { ms: Number(e.target.value) || 0 } })}
        />
      );
    case "voice.speak":
      return (
        <Input
          label={t("params.text")}
          value={step.params.text}
          onChange={(e) => onChange({ ...step, params: { text: e.target.value } })}
        />
      );
  }
}

// ---------- small helpers ----------

function DeviceDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <Dropdown label={label} value={value} options={options} onChange={onChange} />
    </div>
  );
}

function OnOffDropdown({
  value,
  onChange,
}: {
  value: "on" | "off";
  onChange: (v: "on" | "off") => void;
}) {
  const { t } = useT("routines");
  return (
    <div className="flex-1 min-w-0">
      <Dropdown
        label={t("params.state")}
        value={value}
        options={[
          { value: "on", label: t("params.stateOn") },
          { value: "off", label: t("params.stateOff") },
        ]}
        onChange={(v) => onChange(v as "on" | "off")}
      />
    </div>
  );
}

/** Returns a freshly-minted, minimally-valid step for a given action. Used
 * when the user switches the action type in the dropdown so `params` always
 * matches the new discriminator. */
function defaultStepForAction(action: RoutineActionType): RoutineStep {
  switch (action) {
    case "light.set":
      return { action, params: { lightId: "", state: "on" } };
    case "light.toggle":
      return { action, params: { lightId: "" } };
    case "lights.room":
      return { action, params: { roomId: "", state: "on" } };
    case "lights.all":
      return { action, params: { state: "on" } };
    case "ac.power":
      return { action, params: { deviceId: "", power: true } };
    case "ac.set_mode":
      return { action, params: { deviceId: "", mode: "cool" } };
    case "ac.set_temp":
      return { action, params: { deviceId: "", targetTemp: 24 } };
    case "ac.set_fan":
      return { action, params: { deviceId: "", fanSpeed: "auto" } };
    case "blink.arm":
    case "blink.disarm":
      return { action, params: { cameraId: "" } };
    case "blink.arm_all":
    case "blink.disarm_all":
    case "spotify.play":
    case "spotify.pause":
    case "spotify.next":
    case "spotify.previous":
    case "alarm.disarm":
    case "timer.stop_all":
      return { action };
    case "alarm.arm":
      return { action, params: { mode: null } };
    case "spotify.volume":
      return { action, params: { volumePercent: 50 } };
    case "spotify.play_uri":
      return { action, params: { contextUri: "" } };
    case "tv.power":
      return { action, params: { on: true } };
    case "tv.volume":
      return { action, params: { level: 20 } };
    case "tv.mute":
      return { action, params: { muted: true } };
    case "tv.launch_app":
      return { action, params: { appId: "" } };
    case "shopping.add":
      return { action, params: { name: "" } };
    case "timer.start":
      return { action, params: { durationSeconds: 300 } };
    case "delay":
      return { action, params: { ms: 1000 } };
    case "voice.speak":
      return { action, params: { text: "" } };
  }
}
