import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import acEn from "../locales/en/ac.json";
import askEn from "../locales/en/ask.json";
import boardEn from "../locales/en/board.json";
import calendarEn from "../locales/en/calendar.json";
import camerasEn from "../locales/en/cameras.json";
import casaEn from "../locales/en/casa.json";
import commonEn from "../locales/en/common.json";
import errorsEn from "../locales/en/errors.json";
import familyEn from "../locales/en/family.json";
import kioskEn from "../locales/en/kiosk.json";
import laundryEn from "../locales/en/laundry.json";
import lightsEn from "../locales/en/lights.json";
import musicEn from "../locales/en/music.json";
import recipesEn from "../locales/en/recipes.json";
import roomsEn from "../locales/en/rooms.json";
import routinesEn from "../locales/en/routines.json";
import settingsEn from "../locales/en/settings.json";
import shoppingEn from "../locales/en/shopping.json";
import timersEn from "../locales/en/timers.json";
import tvEn from "../locales/en/tv.json";
import voiceEn from "../locales/en/voice.json";
import wasteEn from "../locales/en/waste.json";
import weatherEn from "../locales/en/weather.json";
import acIt from "../locales/it/ac.json";
import askIt from "../locales/it/ask.json";
import boardIt from "../locales/it/board.json";
import calendarIt from "../locales/it/calendar.json";
import camerasIt from "../locales/it/cameras.json";
import casaIt from "../locales/it/casa.json";
import commonIt from "../locales/it/common.json";
import errorsIt from "../locales/it/errors.json";
import familyIt from "../locales/it/family.json";
import kioskIt from "../locales/it/kiosk.json";
import laundryIt from "../locales/it/laundry.json";
import lightsIt from "../locales/it/lights.json";
import musicIt from "../locales/it/music.json";
import recipesIt from "../locales/it/recipes.json";
import roomsIt from "../locales/it/rooms.json";
import routinesIt from "../locales/it/routines.json";
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
      "lights",
      "music",
      "voice",
      "timers",
      "cameras",
      "recipes",
      "rooms",
      "routines",
      "waste",
      "tv",
      "ac",
      "casa",
      "ask",
    ],
    resources: {
      it: {
        ac: acIt,
        ask: askIt,
        board: boardIt,
        cameras: camerasIt,
        casa: casaIt,
        common: commonIt,
        family: familyIt,
        kiosk: kioskIt,
        laundry: laundryIt,
        lights: lightsIt,
        music: musicIt,
        recipes: recipesIt,
        rooms: roomsIt,
        routines: routinesIt,
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
        ac: acEn,
        ask: askEn,
        board: boardEn,
        cameras: camerasEn,
        casa: casaEn,
        common: commonEn,
        family: familyEn,
        kiosk: kioskEn,
        laundry: laundryEn,
        lights: lightsEn,
        music: musicEn,
        recipes: recipesEn,
        rooms: roomsEn,
        routines: routinesEn,
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
