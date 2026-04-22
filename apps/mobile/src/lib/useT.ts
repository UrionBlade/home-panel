import { useTranslation } from "react-i18next";

type Namespace =
  | "board"
  | "cameras"
  | "common"
  | "family"
  | "kiosk"
  | "laundry"
  | "lights"
  | "music"
  | "recipes"
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
 */
export function useT(namespace: Namespace) {
  return useTranslation(namespace);
}
