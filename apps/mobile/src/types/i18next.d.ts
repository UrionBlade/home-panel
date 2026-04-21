import type boardIt from "../locales/it/board.json";
import type calendarIt from "../locales/it/calendar.json";
import type camerasIt from "../locales/it/cameras.json";
import type commonIt from "../locales/it/common.json";
import type errorsIt from "../locales/it/errors.json";
import type familyIt from "../locales/it/family.json";
import type kioskIt from "../locales/it/kiosk.json";
import type laundryIt from "../locales/it/laundry.json";
import type musicIt from "../locales/it/music.json";
import type recipesIt from "../locales/it/recipes.json";
import type settingsIt from "../locales/it/settings.json";
import type shoppingIt from "../locales/it/shopping.json";
import type timersIt from "../locales/it/timers.json";
import type tvIt from "../locales/it/tv.json";
import type voiceIt from "../locales/it/voice.json";
import type wasteIt from "../locales/it/waste.json";
import type weatherIt from "../locales/it/weather.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      board: typeof boardIt;
      cameras: typeof camerasIt;
      common: typeof commonIt;
      family: typeof familyIt;
      kiosk: typeof kioskIt;
      laundry: typeof laundryIt;
      music: typeof musicIt;
      recipes: typeof recipesIt;
      settings: typeof settingsIt;
      errors: typeof errorsIt;
      shopping: typeof shoppingIt;
      timers: typeof timersIt;
      calendar: typeof calendarIt;
      voice: typeof voiceIt;
      waste: typeof wasteIt;
      weather: typeof weatherIt;
      tv: typeof tvIt;
    };
  }
}
