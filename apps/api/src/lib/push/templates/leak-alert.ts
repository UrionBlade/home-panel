/**
 * APNs payload builder for water-leak alerts.
 *
 * Single responsibility so the message copy and the iOS-side
 * categorisation (`kind: "leak"`, collapse id) live in one place and
 * are testable without spinning up the rest of the DIRIGERA pipeline.
 */

import type { LeakAlertPayload } from "@home-panel/shared";
import type { ApnsAlertPayload } from "../apns.js";

/** Build an `ApnsAlertPayload` from a leak event. The body is
 * intentionally short (banner real estate is tiny) and prefers the
 * room name when available, falling back to a generic location string. */
export function buildLeakAlertPayload(event: LeakAlertPayload): ApnsAlertPayload {
  const location = event.roomName?.trim() ? event.roomName.trim() : "posizione sconosciuta";
  /* Trim sensor name defensively — DIRIGERA sometimes hands back names
   * with trailing whitespace from the user's app input. */
  const sensorLabel = event.friendlyName.trim() || "Sensore perdita";
  return {
    title: "Perdita rilevata",
    body: `${sensorLabel} in ${location}`,
    sound: "default",
    timeSensitive: true,
    /* All triggers from the same sensor collapse into a single banner
     * so a flap-y device doesn't spam the user. */
    collapseId: `leak-${event.sensorId}`,
    data: {
      kind: "leak",
      sensorId: event.sensorId,
      triggeredAt: event.triggeredAt,
    },
  };
}
