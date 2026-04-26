import clsx from "clsx";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FamilyManager } from "../components/family/FamilyManager";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { AcSettings } from "../components/settings/AcSettings";
import { CalendarSourcesSettings } from "../components/settings/CalendarSourcesSettings";
import { CameraSettings } from "../components/settings/CameraSettings";
import { KioskSettings } from "../components/settings/KioskSettings";
import { LaundrySettings } from "../components/settings/LaundrySettings";
import { LightsSettings } from "../components/settings/LightsSettings";
import { TvSettings } from "../components/settings/TvSettings";
import { VoiceSettings } from "../components/settings/VoiceSettings";
import { WasteSettings } from "../components/settings/WasteSettings";
import { WeatherSettings } from "../components/settings/WeatherSettings";
import { ZigbeeSettings } from "../components/settings/ZigbeeSettings";
import { useT } from "../lib/useT";
import { type ThemeMode, useThemeStore } from "../store/theme-store";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
];

const APP_VERSION = "0.1.0";

type SettingsTab = "home" | "services" | "devices" | "waste" | "appearance";

function srgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function checkColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = srgb(parseInt(h.slice(0, 2), 16) / 255);
  const g = srgb(parseInt(h.slice(2, 4), 16) / 255);
  const b = srgb(parseInt(h.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? "#1a1a1a" : "#ffffff";
}

// Palette is intentionally constrained to warm tones to preserve the system's
// identity ("stanza calda italiana"). See tokens.css header.
const PRESET_COLORS: { hex: string; key: "terracotta" | "ochre" | "rust" | "sage" | "amber" }[] = [
  { hex: "#c25838", key: "terracotta" },
  { hex: "#c89b3c", key: "ochre" },
  { hex: "#9c4221", key: "rust" },
  { hex: "#7a8c5a", key: "sage" },
  { hex: "#b45309", key: "amber" },
];

export function SettingsPage() {
  const { t } = useT("settings");
  const { i18n } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>(() => {
    if (typeof window !== "undefined") {
      if (window.location.hash === "#tv") return "devices";
      if (window.location.hash === "#lights") return "devices";
      if (window.location.hash === "#waste") return "waste";
    }
    return "appearance";
  });

  /* Keep the active tab in sync with hash changes (e.g. tile tap). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onHashChange() {
      if (window.location.hash === "#tv") setTab("devices");
      else if (window.location.hash === "#lights") setTab("devices");
      else if (window.location.hash === "#waste") setTab("waste");
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const accentColor = useThemeStore((s) => s.accentColor);
  const setAccentColor = useThemeStore((s) => s.setAccentColor);

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "appearance", label: t("tabs.appearance") },
    { key: "home", label: t("tabs.home") },
    { key: "services", label: t("tabs.services") },
    { key: "devices", label: t("tabs.devices") },
    { key: "waste", label: t("tabs.waste") },
  ];

  return (
    <PageContainer maxWidth="narrow">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div
        role="tablist"
        aria-label={t("title")}
        className="flex gap-1 p-1 bg-surface border border-border rounded-lg self-start overflow-x-auto"
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx(
              "relative px-4 py-2.5 rounded-md text-sm font-medium whitespace-nowrap min-h-[2.75rem] transition-colors duration-200",
              tab === key ? "text-accent-foreground" : "text-text-muted hover:text-text",
            )}
          >
            {tab === key && (
              <motion.span
                layoutId="settings-tab-bg"
                className="absolute inset-0 rounded-md"
                style={{ backgroundColor: "var(--color-accent)" }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span
              className="relative z-10"
              style={{ color: tab === key ? "var(--color-accent-foreground)" : undefined }}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      {tab === "home" && (
        <>
          <FamilyManager />
          <KioskSettings />
        </>
      )}

      {tab === "services" && (
        <>
          <WeatherSettings />
          <CalendarSourcesSettings />
          <VoiceSettings />
        </>
      )}

      {tab === "devices" && (
        <>
          <CameraSettings />
          <LaundrySettings />
          <AcSettings />
          <TvSettings />
          <LightsSettings />
          <ZigbeeSettings />
        </>
      )}

      {tab === "waste" && <WasteSettings />}

      {tab === "appearance" && (
        <>
          <section>
            <h2 className="font-display text-3xl mb-5">{t("appearance.language")}</h2>
            <div className="flex gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  type="button"
                  key={lang.code}
                  onClick={() => void i18n.changeLanguage(lang.code)}
                  className={clsx(
                    "px-5 py-3 rounded-md border font-medium transition-colors",
                    i18n.language === lang.code || i18n.language.startsWith(lang.code)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface text-text-muted hover:border-accent",
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-3xl mb-5">{t("appearance.theme")}</h2>
            <div className="flex flex-col gap-3">
              {(["auto", "light", "dark"] as ThemeMode[]).map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-3 p-4 rounded-md bg-surface border border-border cursor-pointer hover:border-accent"
                >
                  <input
                    type="radio"
                    name="theme"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="w-5 h-5 accent-accent"
                  />
                  <span className="font-medium">
                    {m === "auto"
                      ? t("appearance.themeAuto")
                      : m === "light"
                        ? t("appearance.themeLight")
                        : t("appearance.themeDark")}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-3xl mb-5">{t("appearance.accentColor")}</h2>
            <div className="flex flex-wrap items-center gap-3">
              {PRESET_COLORS.map((c) => {
                const isActive =
                  c.key === "terracotta"
                    ? accentColor === null || accentColor === c.hex
                    : accentColor === c.hex;
                const handleClick = () =>
                  c.key === "terracotta" ? setAccentColor(null) : setAccentColor(c.hex);
                return (
                  <button
                    type="button"
                    key={c.hex}
                    onClick={handleClick}
                    className={clsx(
                      "w-11 h-11 rounded-full border-2 transition-all flex items-center justify-center",
                      isActive ? "border-text scale-110" : "border-border hover:border-text-muted",
                    )}
                    style={{ backgroundColor: c.hex }}
                    title={t(`appearance.presets.${c.key}`)}
                  >
                    {isActive && (
                      <span style={{ color: checkColor(c.hex) }} className="text-xs font-bold">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
              {/* Free hex picker — for users who want bright accents
                outside the warm-tone preset palette. Sets accentColor to
                the chosen hex; "reset" returns to the system default
                (terracotta). */}
              <label
                className={clsx(
                  "w-11 h-11 rounded-full border-2 transition-all flex items-center justify-center cursor-pointer relative overflow-hidden",
                  accentColor !== null && !PRESET_COLORS.some((c) => c.hex === accentColor)
                    ? "border-text scale-110"
                    : "border-border hover:border-text-muted",
                )}
                style={{
                  background:
                    "conic-gradient(from 90deg at 50% 50%, #ff5252, #ffd542, #57e389, #5dd6ff, #b069ff, #ff5252)",
                }}
                title={t("appearance.customColor", { defaultValue: "Colore personalizzato" })}
              >
                <input
                  type="color"
                  value={
                    accentColor !== null && !PRESET_COLORS.some((c) => c.hex === accentColor)
                      ? accentColor
                      : "#c25838"
                  }
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label={t("appearance.customColor", {
                    defaultValue: "Colore personalizzato",
                  })}
                />
                <span className="text-text font-display font-black text-base drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]">
                  +
                </span>
              </label>
              {accentColor !== null && (
                <button
                  type="button"
                  onClick={() => setAccentColor(null)}
                  className="text-sm text-text-muted hover:text-text underline-offset-2 hover:underline"
                >
                  {t("appearance.resetColor", { defaultValue: "Reset" })}
                </button>
              )}
            </div>
          </section>

          <section>
            <h2 className="font-display text-3xl mb-5">{t("sections.info")}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
              <dt className="text-text-muted">{t("info.version")}</dt>
              <dd className="font-display">{APP_VERSION}</dd>
            </dl>
          </section>
        </>
      )}
    </PageContainer>
  );
}
