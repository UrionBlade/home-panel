import { ArrowSquareOutIcon, BroadcastIcon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useZigbeeState } from "../../lib/hooks/useZigbee";
import { useT } from "../../lib/useT";

export function ZigbeeSettings() {
  const { t } = useT("zigbee");
  const { data } = useZigbeeState();
  const bridge = data?.bridge;
  const deviceCount = bridge?.deviceCount ?? data?.devices.length ?? 0;
  const online = (bridge?.mqttConnected ?? false) && (bridge?.z2mOnline ?? false);

  return (
    <section className="flex flex-col gap-4" id="zigbee">
      <h2 className="font-display text-3xl">{t("title")}</h2>

      <div className="flex flex-col gap-4 rounded-md bg-surface border border-border p-5">
        <div className="flex items-center gap-3">
          <BroadcastIcon size={24} weight="duotone" className="text-accent" />
          <h3 className="font-display text-xl">Zigbee2MQTT</h3>
          <span
            className={`ml-auto text-xs ${online ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
          >
            {online ? t("bridge.online") : t("bridge.offline")}
          </span>
        </div>

        <p className="text-sm text-text-muted leading-relaxed">{t("subtitle")}</p>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-text-muted">
            {t("bridge.deviceCount", { count: deviceCount })}
          </span>
          <Link
            to="/zigbee"
            className="inline-flex items-center gap-2 rounded-lg bg-text text-bg px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            {t("permitJoin.open")}
            <ArrowSquareOutIcon size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
