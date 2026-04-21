import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import boardEn from "../locales/en/board.json";
import calendarEn from "../locales/en/calendar.json";
import camerasEn from "../locales/en/cameras.json";
import commonEn from "../locales/en/common.json";
import errorsEn from "../locales/en/errors.json";
import familyEn from "../locales/en/family.json";
import kioskEn from "../locales/en/kiosk.json";
import laundryEn from "../locales/en/laundry.json";
import musicEn from "../locales/en/music.json";
import recipesEn from "../locales/en/recipes.json";
import settingsEn from "../locales/en/settings.json";
import shoppingEn from "../locales/en/shopping.json";
import timersEn from "../locales/en/timers.json";
import tvEn from "../locales/en/tv.json";
import voiceEn from "../locales/en/voice.json";
import wasteEn from "../locales/en/waste.json";
import weatherEn from "../locales/en/weather.json";
import boardIt from "../locales/it/board.json";
import calendarIt from "../locales/it/calendar.json";
import camerasIt from "../locales/it/cameras.json";
import commonIt from "../locales/it/common.json";
import errorsIt from "../locales/it/errors.json";
import familyIt from "../locales/it/family.json";
import kioskIt from "../locales/it/kiosk.json";
import laundryIt from "../locales/it/laundry.json";
import musicIt from "../locales/it/music.json";
import recipesIt from "../locales/it/recipes.json";
import settingsIt from "../locales/it/settings.json";
import shoppingIt from "../locales/it/shopping.json";
import timersIt from "../locales/it/timers.json";
import tvIt from "../locales/it/tv.json";
import voiceIt from "../locales/it/voice.json";
import wasteIt from "../locales/it/waste.json";
import weatherIt from "../locales/it/weather.json";

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "it",
    defaultNS: "common",
    ns: [
      "common",
      "family",
      "settings",
      "errors",
      "shopping",
      "calendar",
      "weather",
      "board",
      "kiosk",
      "laundry",
      "music",
      "voice",
      "timers",
      "cameras",
      "recipes",
      "waste",
      "tv",
    ],
    resources: {
      it: {
        board: boardIt,
        cameras: camerasIt,
        common: commonIt,
        family: familyIt,
        kiosk: kioskIt,
        laundry: laundryIt,
        music: musicIt,
        recipes: recipesIt,
        settings: settingsIt,
        errors: errorsIt,
        shopping: shoppingIt,
        timers: timersIt,
        calendar: calendarIt,
        voice: voiceIt,
        waste: wasteIt,
        weather: weatherIt,
        tv: tvIt,
      },
      en: {
        board: boardEn,
        cameras: camerasEn,
        common: commonEn,
        family: familyEn,
        kiosk: kioskEn,
        laundry: laundryEn,
        music: musicEn,
        recipes: recipesEn,
        settings: settingsEn,
        errors: errorsEn,
        shopping: shoppingEn,
        timers: timersEn,
        calendar: calendarEn,
        voice: voiceEn,
        waste: wasteEn,
        weather: weatherEn,
        tv: tvEn,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "home-panel:lang",
      caches: ["localStorage"],
    },
  });

export { i18next };
