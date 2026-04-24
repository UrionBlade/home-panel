import { useTranslation } from "react-i18next";

type Namespace =
  | "ac"
  | "board"
  | "cameras"
  | "common"
  | "family"
  | "kiosk"
  | "laundry"
  | "lights"
  | "music"
  | "recipes"
  | "rooms"
  | "routines"
  | "settings"
  | "errors"
  | "shopping"
  | "timers"
  | "calendar"
  | "tv"
  | "voice"
  | "waste"
  | "weather";

/**
 * Wrapper di useTranslation con namespace bound.
 * Usato come `const { t } = useT('family')`.
 *
 * Generic over the literal namespace so `t` narrows to that namespace's
 * keys only — without this, TypeScript falls back to the union of keys
 * across every registered namespace, which makes `t("empty")` ambiguous
 * whenever two files happen to share the same key with different shapes.
 */
export function useT<N extends Namespace>(namespace: N) {
  return useTranslation(namespace);
}
