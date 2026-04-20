import type {
  ParsedCommand,
  ShoppingItem,
  VoiceEventsResponse,
  VoiceWasteResponse,
  VoiceWeatherResponse,
} from "@home-panel/shared";
import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { i18next } from "../i18n";
import { primeAudio } from "../timers/alertSound";
import { dismissActiveAlert, hasActiveAlert } from "../timers/alertStore";
import { nativeVoiceClient } from "./nativeVoiceClient";
import { voiceClient } from "./voiceClient";

type VoiceVars = Record<string, string | number>;

function vt(key: string, vars?: VoiceVars): string {
  return i18next.t(`voice:responses.${key}` as never, (vars ?? {}) as never) as unknown as string;
}

function vtArray(key: string): string[] {
  const out = i18next.t(`voice:responses.${key}` as never, { returnObjects: true } as never);
  return Array.isArray(out) ? (out as string[]) : [];
}

let _queryClient: QueryClient | null = null;

export function setVoiceQueryClient(qc: QueryClient) {
  _queryClient = qc;
}

function invalidate(...keys: string[][]) {
  for (const key of keys) {
    _queryClient?.invalidateQueries({ queryKey: key });
  }
}

/** Mappa parole italiane → numero */
const WORD_TO_NUM: Record<string, number> = {
  zero: 0,
  un: 1,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
  undici: 11,
  dodici: 12,
  tredici: 13,
  quattordici: 14,
  quindici: 15,
  sedici: 16,
  diciassette: 17,
  diciotto: 18,
  diciannove: 19,
  venti: 20,
  ventuno: 21,
  ventidue: 22,
  ventitre: 23,
  ventiquattro: 24,
  venticinque: 25,
  ventisei: 26,
  ventisette: 27,
  ventotto: 28,
  ventinove: 29,
  trenta: 30,
  trentuno: 31,
  trentadue: 32,
  trentacinque: 35,
  quaranta: 40,
  quarantacinque: 45,
  cinquanta: 50,
  cinquantacinque: 55,
  sessanta: 60,
};

/** Finds a number (digit or word) in the text preceding a unit */
function findNumberBefore(text: string, unitPattern: RegExp): number | null {
  // First try digits: "20 minuti", "3 ore"
  const digitMatch = text.match(new RegExp(`(\\d+)\\s*${unitPattern.source}`));
  if (digitMatch) return parseInt(digitMatch[1], 10);

  // Then try words: "tre minuti", "venti ore"
  for (const [word, val] of Object.entries(WORD_TO_NUM)) {
    if (new RegExp(`\\b${word}\\s+${unitPattern.source}`).test(text)) return val;
  }
  return null;
}

function parseDuration(text: string): number | null {
  const s = text
    .toLowerCase()
    .trim()
    .replace(/['ʼ'`´]/g, "'");

  // Special cases
  if (/\bun'?\s*ora\s+e\s+mezz[ao]?\b/.test(s)) return 5400;
  if (/\bmezz'?\s*ora\b/.test(s)) return 1800;
  if (/\bun\s+quarto\s+d'?\s*ora\b/.test(s)) return 900;
  if (/\btre\s+quarti\s+d'?\s*ora\b/.test(s)) return 2700;

  let total = 0;
  let matched = false;

  // Hours
  const ore = findNumberBefore(s, /or[ae]/);
  if (ore !== null) {
    total += ore * 3600;
    matched = true;
  } else if (/\bun'?\s*ora\b/.test(s)) {
    total += 3600;
    matched = true;
  }

  // Minutes
  const min = findNumberBefore(s, /minut[oi]/);
  if (min !== null) {
    total += min * 60;
    matched = true;
  } else if (/\bun\s+minuto\b/.test(s)) {
    total += 60;
    matched = true;
  }

  // Seconds
  const sec = findNumberBefore(s, /second[oi]/);
  if (sec !== null) {
    total += sec;
    matched = true;
  }

  if (matched && total > 0) return total;

  // Bare number → interpret as minutes
  const numOnly = s.match(/(\d+)/);
  if (numOnly) {
    const n = parseInt(numOnly[1], 10);
    if (n > 0) return n * 60;
  }

  // Bare number word without a unit → minutes
  for (const [word, val] of Object.entries(WORD_TO_NUM)) {
    if (s.includes(word) && val > 0) return val * 60;
  }

  return null;
}

function stripArticle(text: string): string {
  return text
    .replace(/^(?:l|un|dell|all|sull|nell)[''ʼ`´]/i, "")
    .replace(/^(?:il|lo|la|i|gli|le|un|uno|una|del|dello|della|dei|degli|delle)\s+/i, "")
    .trim();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function randomPick(arr: string[]): string {
  if (arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)] ?? "";
}

// ---- Formattazione ora e data ----

function formatTime(): string {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (m === 0) return vt("datetime.timeExact", { hour: h });
  return vt("datetime.timeWithMinutes", { hour: h, minutes: m });
}

function formatDate(): string {
  const now = new Date();
  const weekdays = vtArray("datetime.weekdays");
  const months = vtArray("datetime.months");
  const weekday = weekdays[now.getDay()] ?? "";
  const month = months[now.getMonth()] ?? "";
  return vt("datetime.dateFull", {
    weekday,
    day: now.getDate(),
    month,
    year: now.getFullYear(),
  });
}

function formatTimerDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(vt("timer.hours", { count: h }));
  if (m > 0) parts.push(vt("timer.minutes", { count: m }));
  if (s > 0 && h === 0) parts.push(vt("timer.seconds", { count: s }));
  return parts.join(" e ") || vt("timer.zero");
}

// ---- Comandi vocali stop speaking (nativo o web) ----

function stopSpeaking() {
  if (nativeVoiceClient.supported) {
    void nativeVoiceClient.stopSpeaking();
  } else {
    void voiceClient.stopSpeaking();
  }
}

/**
 * Gestisce un comando vocale parsato chiamando le API appropriate
 * e restituisce una risposta vocale localizzata.
 */
export async function handleIntent(command: ParsedCommand): Promise<string> {
  switch (command.intent) {
    // ==== SPESA ====
    case "add_to_shopping": {
      const raw = command.entities.product;
      if (!raw) return vt("shopping.dontUnderstandAdd");
      const name = capitalize(stripArticle(raw));
      await apiClient.post("/api/v1/shopping/items/by-name", { name });
      invalidate(["shopping"]);
      return vt("shopping.added", { name });
    }

    case "remove_from_shopping": {
      const raw = command.entities.product;
      if (!raw) return vt("shopping.dontUnderstandRemove");
      const name = capitalize(stripArticle(raw));
      try {
        await apiClient.delete(`/api/v1/shopping/items/by-name?name=${encodeURIComponent(name)}`);
        invalidate(["shopping"]);
        return vt("shopping.removed", { name });
      } catch (err) {
        console.warn("[voice] remove_from_shopping:", err);
        return vt("shopping.notFound", { name });
      }
    }

    case "read_shopping": {
      const items = await apiClient.get<ShoppingItem[]>("/api/v1/shopping/items");
      const active = items.filter((i) => !i.completed);
      if (active.length === 0) return vt("shopping.empty");
      if (active.length === 1) return vt("shopping.single", { name: active[0].name });
      const names = active.map((i) => i.name);
      const last = names.pop() ?? "";
      return vt("shopping.multiple", { names: names.join(", "), last });
    }

    // ==== CALENDARIO ====
    case "add_event": {
      const text = command.entities.text;
      if (!text) return vt("calendar.dontUnderstandEvent");
      await apiClient.post("/api/v1/calendar/events/by-natural-language", { text });
      invalidate(["calendar"], ["events"]);
      return vt("calendar.eventAdded");
    }

    case "read_today_events": {
      const data = await apiClient.get<VoiceEventsResponse>("/api/v1/calendar/today");
      if (data.events.length === 0) return vt("calendar.todayEmpty");
      const list = data.events
        .map((e) => {
          if (e.allDay) return e.title;
          const time = e.startsAt.slice(11, 16);
          return vt("calendar.eventAtTime", { title: e.title, time });
        })
        .join(", ");
      return vt("calendar.todayList", { list });
    }

    case "read_tomorrow_events": {
      const data = await apiClient.get<VoiceEventsResponse>("/api/v1/calendar/tomorrow");
      if (data.events.length === 0) return vt("calendar.tomorrowEmpty");
      const list = data.events
        .map((e) => {
          if (e.allDay) return e.title;
          const time = e.startsAt.slice(11, 16);
          return vt("calendar.eventAtTime", { title: e.title, time });
        })
        .join(", ");
      return vt("calendar.tomorrowList", { list });
    }

    // ==== RIFIUTI ====
    case "read_waste_today": {
      const data = await apiClient.get<VoiceWasteResponse>("/api/v1/waste/today");
      return data.voiceText;
    }

    case "read_waste_tomorrow": {
      const data = await apiClient.get<VoiceWasteResponse>("/api/v1/waste/tomorrow");
      return data.voiceText;
    }

    // ==== METEO ====
    case "read_weather": {
      const data = await apiClient.get<VoiceWeatherResponse>("/api/v1/weather/voice?when=now");
      return data.voiceText;
    }

    case "read_weather_tomorrow": {
      const data = await apiClient.get<VoiceWeatherResponse>("/api/v1/weather/voice?when=tomorrow");
      return data.voiceText;
    }

    // ==== TIMER ====
    case "set_timer": {
      const duration = command.entities.duration;
      if (!duration) return vt("timer.noDuration");
      const seconds = parseDuration(duration);
      if (!seconds) return vt("timer.dontUnderstandDuration");
      primeAudio();
      await apiClient.post("/api/v1/timers/timers", {
        durationSeconds: seconds,
        label: null,
      });
      invalidate(["timers"]);
      return vt("timer.started", { duration: formatTimerDuration(seconds) });
    }

    case "stop_timer": {
      // If there is an active alert (expired timer ringing), stop that first
      if (hasActiveAlert()) {
        dismissActiveAlert();
        invalidate(["timers"]);
        return vt("timer.stopped");
      }

      try {
        const timers =
          await apiClient.get<
            Array<{ id: string; label: string | null; remainingSeconds: number }>
          >("/api/v1/timers/timers");
        if (timers.length === 0) return vt("timer.noActive");

        // Only one timer — cancel it directly
        if (timers.length === 1) {
          await apiClient.delete(`/api/v1/timers/timers/${timers[0].id}`);
          invalidate(["timers"]);
          return vt("timer.cancelled");
        }

        // User specified which one (primo, secondo, terzo...)
        const raw = command.raw.toLowerCase();
        const ordinals: Record<string, number> = {
          primo: 0,
          prima: 0,
          "1°": 0,
          secondo: 1,
          seconda: 1,
          "2°": 1,
          terzo: 2,
          terza: 2,
          "3°": 2,
          quarto: 3,
          quarta: 3,
          "4°": 3,
          quinto: 4,
          quinta: 4,
          "5°": 4,
          ultimo: timers.length - 1,
          ultima: timers.length - 1,
        };
        // Also check for "tutti" (all)
        if (raw.includes("tutti") || raw.includes("tutto")) {
          for (const t of timers) {
            await apiClient.delete(`/api/v1/timers/timers/${t.id}`);
          }
          invalidate(["timers"]);
          return vt("timer.cancelledAll", { count: timers.length });
        }

        for (const [word, idx] of Object.entries(ordinals)) {
          if (raw.includes(word) && idx < timers.length) {
            await apiClient.delete(`/api/v1/timers/timers/${timers[idx].id}`);
            invalidate(["timers"]);
            const remaining = formatTimerDuration(timers[idx].remainingSeconds);
            return vt("timer.cancelledOne", { remaining });
          }
        }

        // Multiple timers but none specified → list them and ask
        const ordLabels = vtArray("timer.ordinals");
        const list = timers
          .map((t, i) => {
            const ord = ordLabels[i] ?? `${i + 1}°`;
            return `${ord}: ${formatTimerDuration(t.remainingSeconds)}`;
          })
          .join(", ");
        return vt("timer.multipleList", { count: timers.length, list });
      } catch (err) {
        console.warn("[voice] stop_timer:", err);
        return vt("timer.stopFailed");
      }
    }

    // ==== POST-IT / PROMEMORIA ====
    case "add_postit": {
      const text = command.entities.text;
      if (!text) return vt("postit.dontUnderstand");
      await apiClient.post("/api/v1/postits/by-natural-language", { text });
      invalidate(["postits"]);
      return vt("postit.written", { text });
    }

    // ==== RICETTE ====
    case "search_recipe": {
      const query = command.entities.query;
      if (!query) return vt("recipe.askWhat");
      return vt("recipe.searchHint", { query });
    }

    // ==== ORA E DATA ====
    case "what_time":
      return formatTime();

    case "what_date":
      return formatDate();

    // ==== ROUTINE ====
    case "routine_morning": {
      const [weather, events, waste] = await Promise.all([
        apiClient.get<VoiceWeatherResponse>("/api/v1/weather/voice?when=today").catch(() => null),
        apiClient.get<VoiceEventsResponse>("/api/v1/calendar/today").catch(() => null),
        apiClient.get<VoiceWasteResponse>("/api/v1/waste/today").catch(() => null),
      ]);

      const parts: string[] = [vt("routine.morningGreeting")];
      if (weather) parts.push(weather.voiceText);
      if (events && events.events.length > 0) {
        const list = events.events
          .map((e) => {
            if (e.allDay) return e.title;
            return vt("calendar.eventAtTime", { title: e.title, time: e.startsAt.slice(11, 16) });
          })
          .join(", ");
        parts.push(vt("routine.todayList", { list }));
      } else if (events) {
        parts.push(vt("routine.todayEmpty"));
      }
      if (waste && waste.wasteTypes.length > 0) parts.push(waste.voiceText);
      return parts.join(" ");
    }

    case "routine_night": {
      const waste = await apiClient
        .get<VoiceWasteResponse>("/api/v1/waste/tomorrow")
        .catch(() => null);
      const parts: string[] = [];
      if (waste && waste.wasteTypes.length > 0) parts.push(waste.voiceText);
      parts.push(vt("routine.nightGreeting"));
      return parts.join(" ");
    }

    // ==== CONVERSAZIONE ====
    case "greeting":
      return randomPick(vtArray("conversation.greetings"));

    case "how_are_you":
      return randomPick(vtArray("conversation.howAreYou"));

    case "thank_you":
      return randomPick(vtArray("conversation.thankYou"));

    case "joke":
      return `🥁${randomPick(vtArray("conversation.jokes"))}`;

    case "compliment":
      return randomPick(vtArray("conversation.compliments"));

    case "who_are_you":
      return randomPick(vtArray("conversation.whoAreYou"));

    case "help":
      return vt("help");

    // ==== MUSICA ====
    case "music_play": {
      try {
        await apiClient.put("/api/v1/spotify/playback/play", {});
        return vt("music.played");
      } catch (err) {
        console.warn("[voice] music_play:", err);
        return vt("music.playFailed");
      }
    }

    case "music_pause": {
      try {
        await apiClient.put("/api/v1/spotify/playback/pause");
        return vt("music.paused");
      } catch (err) {
        console.warn("[voice] music_pause:", err);
        return vt("music.pauseFailed");
      }
    }

    case "music_next": {
      try {
        await apiClient.post("/api/v1/spotify/playback/next");
        return vt("music.next");
      } catch (err) {
        console.warn("[voice] music_next:", err);
        return vt("music.nextFailed");
      }
    }

    case "music_previous": {
      try {
        await apiClient.post("/api/v1/spotify/playback/previous");
        return vt("music.previous");
      } catch (err) {
        console.warn("[voice] music_previous:", err);
        return vt("music.previousFailed");
      }
    }

    case "music_volume": {
      const vol = command.entities.volume;
      if (!vol) return vt("music.noVolume");
      try {
        let volumePercent: number;
        if (vol === "up") {
          const state = await apiClient.get<{ device?: { volumePercent?: number | null } }>(
            "/api/v1/spotify/playback",
          );
          volumePercent = Math.min(100, (state.device?.volumePercent ?? 50) + 20);
        } else if (vol === "down") {
          const state = await apiClient.get<{ device?: { volumePercent?: number | null } }>(
            "/api/v1/spotify/playback",
          );
          volumePercent = Math.max(0, (state.device?.volumePercent ?? 50) - 20);
        } else {
          volumePercent = Math.min(100, Math.max(0, parseInt(vol, 10)));
        }
        await apiClient.put("/api/v1/spotify/playback/volume", { volumePercent });
        return vt("music.volumeAt", { percent: volumePercent });
      } catch (err) {
        console.warn("[voice] music_volume:", err);
        return vt("music.volumeFailed");
      }
    }

    // ==== ANNULLA ====
    case "cancel":
      if (hasActiveAlert()) {
        dismissActiveAlert();
        invalidate(["timers"]);
        return vt("cancel.stoppedAlert");
      }
      stopSpeaking();
      return vt("cancel.cancelled");
  }
}
