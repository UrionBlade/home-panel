import type { SpotifyPlaylist, SpotifyTrack } from "@home-panel/shared";
import {
  ArrowsClockwiseIcon,
  DevicesIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  MusicNoteIcon,
  MusicNotesIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  SpeakerLowIcon,
  SpinnerIcon,
  VinylRecordIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import {
  useSpotifyAuthUrl,
  useSpotifyCallback,
  useSpotifyDevices,
  useSpotifyLogout,
  useSpotifyNext,
  useSpotifyPause,
  useSpotifyPlay,
  useSpotifyPlayback,
  useSpotifyPlaylists,
  useSpotifyPrevious,
  useSpotifyRepeat,
  useSpotifySearch,
  useSpotifyShuffle,
  useSpotifyStatus,
  useSpotifyTransfer,
  useSpotifyVolume,
} from "../lib/hooks/useSpotify";
import { useT } from "../lib/useT";

/** Format milliseconds to m:ss */
function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function MusicPage() {
  const { data: status, isLoading: statusLoading } = useSpotifyStatus();

  if (statusLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-32 text-text-muted">
          <SpinnerIcon size={24} className="animate-spin" />
        </div>
      </PageContainer>
    );
  }

  if (!status?.configured) {
    return <SpotifyLoginView />;
  }

  return <SpotifyPlayerView displayName={status.displayName} />;
}

/* ------------------------------------------------------------------ */
/* Login view                                                           */
/* ------------------------------------------------------------------ */

function SpotifyLoginView() {
  const { t } = useT("music");
  const authUrl = useSpotifyAuthUrl();
  const callback = useSpotifyCallback();
  const [step, setStep] = useState<"idle" | "waiting-code">("idle");
  const [code, setCode] = useState("");

  async function handleOpenSpotify() {
    const result = await authUrl.mutateAsync();
    window.open(result.url, "_blank");
    setStep("waiting-code");
  }

  async function handleSubmitCode() {
    const trimmed = code.trim();
    // Accept either the raw code or the full redirect URL with ?code=
    let codeValue = trimmed;
    if (trimmed.includes("code=")) {
      const match = trimmed.match(/[?&]code=([^&]+)/);
      if (match?.[1]) codeValue = match[1];
    }
    if (!codeValue) return;
    callback.mutate(codeValue);
  }

  return (
    <PageContainer maxWidth="narrow">
      <PageHeader
        title={t("title")}
        subtitle={t("login.subtitle")}
        artwork={<MusicNoteIcon size={72} weight="duotone" className="text-accent" />}
      />
      <div className="flex flex-col items-center gap-6 py-12 rounded-lg bg-surface-warm/50 border border-border/60 px-6">
        {step === "idle" ? (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="font-display text-xl text-text">{t("login.title")}</h2>
              <p className="text-sm text-text-muted max-w-sm">{t("login.instructionsOpen")}</p>
            </div>
            <Button
              onClick={() => void handleOpenSpotify()}
              isLoading={authUrl.isPending}
              iconLeft={<MusicNoteIcon size={18} weight="bold" />}
            >
              {t("login.openSpotify")}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="font-display text-xl text-text">{t("login.pasteTitle")}</h2>
              <p className="text-sm text-text-muted max-w-sm">{t("login.pasteBody")}</p>
            </div>
            <div className="w-full max-w-md flex flex-col gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("login.pastePlaceholder")}
                className="w-full min-h-[52px] rounded-md bg-surface px-4 text-base text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent placeholder:text-text-subtle"
              />
              <Button
                onClick={() => void handleSubmitCode()}
                isLoading={callback.isPending}
                disabled={!code.trim()}
              >
                {t("login.connect")}
              </Button>
              {callback.isError && (
                <p className="text-sm text-danger text-center">{t("login.error")}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="text-sm text-text-muted hover:text-text transition-colors"
            >
              {t("login.restart")}
            </button>
          </>
        )}
      </div>
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Full player view                                                     */
/* ------------------------------------------------------------------ */

function SpotifyPlayerView({ displayName }: { displayName: string | null }) {
  const { t } = useT("music");
  const qc = useQueryClient();
  const { data: playback } = useSpotifyPlayback();
  const { data: devices = [] } = useSpotifyDevices();
  const { data: playlists = [] } = useSpotifyPlaylists();

  const play = useSpotifyPlay();
  const pause = useSpotifyPause();
  const next = useSpotifyNext();
  const previous = useSpotifyPrevious();
  const volume = useSpotifyVolume();
  const transfer = useSpotifyTransfer();
  const shuffle = useSpotifyShuffle();
  const repeat = useSpotifyRepeat();
  const logout = useSpotifyLogout();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [localProgress, setLocalProgress] = useState(0);
  const [optimisticPlaying, setOptimisticPlaying] = useState<boolean | null>(null);
  const [optimisticVolume, setOptimisticVolume] = useState<number | null>(null);
  const [devicesHowToOpen, setDevicesHowToOpen] = useState(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search by 400ms
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(id);
  }, [search]);

  // Clear optimistic state when real data arrives
  const serverIsPlaying = playback?.isPlaying;
  useEffect(() => {
    if (serverIsPlaying !== undefined) setOptimisticPlaying(null);
  }, [serverIsPlaying]);

  const serverVolume = playback?.device?.volumePercent;
  useEffect(() => {
    if (serverVolume !== undefined) setOptimisticVolume(null);
  }, [serverVolume]);

  // Sync progress from server
  const serverProgressMs = playback?.progressMs;
  useEffect(() => {
    if (serverProgressMs !== undefined) setLocalProgress(serverProgressMs);
  }, [serverProgressMs]);

  // Tick local progress every second while playing
  useEffect(() => {
    if (playback?.isPlaying) {
      progressIntervalRef.current = setInterval(() => {
        setLocalProgress((p) => p + 1000);
      }, 1000);
    }
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [playback?.isPlaying]);

  const track = playback?.track ?? null;
  const durationMs = track?.durationMs ?? 1;
  const progressPct = Math.min((localProgress / durationMs) * 100, 100);
  const isPlaying = optimisticPlaying ?? playback?.isPlaying ?? false;
  const currentVolume = optimisticVolume ?? playback?.device?.volumePercent ?? 50;
  const shuffleActive = playback?.shuffleState ?? false;
  const repeatState = playback?.repeatState ?? "off";

  // "Nothing playing" = no track in the playback state
  const isPlayingNothing = track === null;

  const { data: searchResults } = useSpotifySearch(debouncedSearch);

  function handlePlayPause() {
    if (isPlaying) {
      setOptimisticPlaying(false);
      pause.mutate();
    } else {
      setOptimisticPlaying(true);
      play.mutate({});
    }
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setOptimisticVolume(val);
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(() => volume.mutate(val), 300);
  }

  function handlePlayTrack(uri: string) {
    // uri can be "spotify:track:ID" or just the bare "ID"
    const spotifyUri = uri.startsWith("spotify:") ? uri : `spotify:track:${uri}`;
    play.mutate({ uris: [spotifyUri] });
  }

  function handlePlayPlaylist(playlistId: string) {
    play.mutate({ contextUri: `spotify:playlist:${playlistId}` });
  }

  function handleTransfer(deviceId: string) {
    transfer.mutate({ deviceId, play: true });
  }

  function handleRepeatCycle() {
    const nextState =
      repeatState === "off" ? "context" : repeatState === "context" ? "track" : "off";
    repeat.mutate(nextState);
  }

  function handleShuffleSuggestion(query: string) {
    setSearch(query);
    setDebouncedSearch(query);
  }

  const repeatAriaLabel =
    repeatState === "track"
      ? t("player.repeatTrack")
      : repeatState === "context"
        ? t("player.repeatContext")
        : t("player.repeatOff");

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={t("title")}
        subtitle={displayName ? t("connectedAs", { name: displayName }) : undefined}
        artwork={<MusicNoteIcon size={48} weight="duotone" className="text-accent" />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            isLoading={logout.isPending}
          >
            {t("disconnect")}
          </Button>
        }
      />

      {/* ---- EMPTY STATE: search-first layout ---- */}
      {isPlayingNothing && (
        <>
          {/* Hero search bar */}
          <section aria-label={t("search.label")} className="flex flex-col gap-4">
            <div className="relative">
              <MagnifyingGlassIcon
                size={22}
                weight="duotone"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder={t("searchHero.placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t("search.ariaLabel")}
                className="w-full min-h-[3.25rem] rounded-xl bg-surface pl-12 pr-4 text-lg text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent placeholder:text-text-subtle shadow-sm"
              />
            </div>

            {/* Suggestion chips — shown only when search is empty */}
            {search.length === 0 && (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={t("searchHero.suggestionsLabel")}
              >
                {(
                  [
                    { key: "relax" as const, icon: "relax" },
                    { key: "cooking" as const, icon: "cooking" },
                    { key: "family" as const, icon: "family" },
                    { key: "energy" as const, icon: "energy" },
                  ] as const
                ).map(({ key }) => (
                  <SuggestionChip
                    key={key}
                    label={t(`searchHero.suggestions.${key}`)}
                    onClick={() => handleShuffleSuggestion(t(`searchHero.suggestions.${key}`))}
                  />
                ))}
              </div>
            )}

            {debouncedSearch.length >= 2 && searchResults && (
              <SearchResults tracks={searchResults.tracks} onPlay={handlePlayTrack} />
            )}
          </section>

          {/* Playlists when available */}
          {playlists.length > 0 && (
            <section aria-label={t("playlists.yours")} className="flex flex-col gap-3">
              <h2 className="font-display text-lg text-text">{t("playlists.title")}</h2>
              <div
                className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin"
                role="list"
              >
                {playlists.map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    onPlay={() => handlePlayPlaylist(playlist.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Devices section */}
          <DevicesSection
            devices={devices}
            onTransfer={handleTransfer}
            onRefresh={() => void qc.invalidateQueries({ queryKey: ["spotify", "devices"] })}
            howToOpen={devicesHowToOpen}
            onHowToOpen={() => setDevicesHowToOpen(true)}
            onHowToClose={() => setDevicesHowToOpen(false)}
          />

          {/* Minimal "nothing playing" stripe at the bottom */}
          <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-surface-warm/60 border border-border/60">
            <VinylRecordIcon size={20} weight="duotone" className="text-text-subtle shrink-0" />
            <p className="text-sm text-text-muted flex-1">{t("player.noTrackHint")}</p>
            <button
              type="button"
              onClick={handlePlayPause}
              disabled={play.isPending}
              aria-label={t("player.play")}
              className={clsx(
                "flex items-center justify-center w-9 h-9 rounded-full bg-accent text-accent-foreground shrink-0",
                "hover:bg-accent-hover active:scale-95 transition-[background-color,transform] duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <PlayIcon size={18} weight="fill" />
            </button>
          </div>
        </>
      )}

      {/* ---- PLAYING STATE: album art + controls ---- */}
      {!isPlayingNothing && (
        <>
          <section
            aria-label={t("player.nowPlaying")}
            className="flex flex-col sm:flex-row gap-6 items-start sm:items-center"
          >
            {/* Album art */}
            <div
              className="shrink-0 w-40 h-40 sm:w-48 sm:h-48 rounded-lg overflow-hidden shadow-lg"
              aria-hidden="true"
            >
              {track?.albumArt ? (
                <img
                  src={track.albumArt}
                  alt={t("player.albumCover", { album: track.album })}
                  className="w-full h-full object-cover"
                />
              ) : (
                /* Edge case: playing but no art — use VinylRecord duotone on tile-mauve-a */
                <div className="w-full h-full flex items-center justify-center bg-[var(--tile-mauve-a)]">
                  <VinylRecordIcon
                    size={96}
                    weight="duotone"
                    className="text-text-muted opacity-70"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 flex-1 min-w-0">
              {/* Track info */}
              <div className="min-w-0">
                <p className="font-display text-3xl text-text truncate leading-tight">
                  {track?.name}
                </p>
                <p className="text-base text-text-muted truncate mt-1">
                  {track?.artists.join(", ")}
                </p>
                <p className="text-sm text-text-subtle truncate">{track?.album}</p>
              </div>

              {/* Progress bar */}
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPct)}
                aria-label={t("player.progress")}
                className="flex flex-col gap-1"
              >
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-1000"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-text-subtle">
                  <span>{formatMs(localProgress)}</span>
                  <span>{formatMs(durationMs)}</span>
                </div>
              </div>

              {/* Playback controls */}
              <div
                className="flex items-center gap-3"
                role="group"
                aria-label={t("player.controls")}
              >
                {/* Shuffle toggle */}
                <button
                  type="button"
                  onClick={() => shuffle.mutate(!shuffleActive)}
                  disabled={shuffle.isPending}
                  aria-label={shuffleActive ? t("player.shuffleOn") : t("player.shuffleOff")}
                  aria-pressed={shuffleActive}
                  className={clsx(
                    "relative flex items-center justify-center w-11 h-11 rounded-full transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    "disabled:opacity-50",
                    shuffleActive
                      ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                      : "border border-border text-text-subtle hover:text-text hover:border-border-strong",
                  )}
                >
                  <ShuffleIcon size={18} weight={shuffleActive ? "fill" : "regular"} />
                </button>

                {/* Previous — secondary */}
                <button
                  type="button"
                  onClick={() => previous.mutate()}
                  disabled={previous.isPending}
                  aria-label={t("player.previous")}
                  className={clsx(
                    "flex items-center justify-center w-12 h-12 rounded-full border border-border transition-colors duration-150",
                    "hover:bg-surface-warm active:scale-95",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <SkipBackIcon size={22} weight="fill" />
                </button>

                {/* Play/Pause — primary, larger */}
                <button
                  type="button"
                  onClick={handlePlayPause}
                  disabled={play.isPending || pause.isPending}
                  aria-label={isPlaying ? t("player.pause") : t("player.play")}
                  className={clsx(
                    "flex items-center justify-center w-16 h-16 rounded-full bg-accent text-accent-foreground shadow-md transition-[background-color,transform] duration-150",
                    "hover:bg-accent-hover active:scale-95",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {isPlaying ? (
                    <PauseIcon size={30} weight="fill" />
                  ) : (
                    <PlayIcon size={30} weight="fill" />
                  )}
                </button>

                {/* Next — secondary */}
                <button
                  type="button"
                  onClick={() => next.mutate()}
                  disabled={next.isPending}
                  aria-label={t("player.next")}
                  className={clsx(
                    "flex items-center justify-center w-12 h-12 rounded-full border border-border transition-colors duration-150",
                    "hover:bg-surface-warm active:scale-95",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <SkipForwardIcon size={22} weight="fill" />
                </button>

                {/* Repeat toggle — 3 states */}
                <button
                  type="button"
                  onClick={handleRepeatCycle}
                  disabled={repeat.isPending}
                  aria-label={repeatAriaLabel}
                  aria-pressed={repeatState !== "off"}
                  className={clsx(
                    "relative flex items-center justify-center w-11 h-11 rounded-full transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    "disabled:opacity-50",
                    repeatState !== "off"
                      ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                      : "border border-border text-text-subtle hover:text-text hover:border-border-strong",
                  )}
                >
                  <RepeatIcon size={18} weight={repeatState !== "off" ? "fill" : "regular"} />
                  {repeatState === "track" && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-accent text-accent-foreground text-[8px] font-bold flex items-center justify-center"
                    >
                      1
                    </span>
                  )}
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-3" role="group" aria-label={t("player.volume")}>
                <SpeakerLowIcon
                  size={18}
                  weight="duotone"
                  className="shrink-0 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={currentVolume}
                  onChange={handleVolumeChange}
                  aria-label={t("player.volume")}
                  className="flex-1 h-1.5 accent-accent cursor-pointer"
                />
                <SpeakerHighIcon
                  size={18}
                  weight="duotone"
                  className="shrink-0 text-text-muted"
                  aria-hidden="true"
                />
                <span className="text-xs text-text-subtle w-8 text-right tabular-nums">
                  {currentVolume}%
                </span>
              </div>
            </div>
          </section>

          {/* Devices section */}
          <DevicesSection
            devices={devices}
            onTransfer={handleTransfer}
            onRefresh={() => void qc.invalidateQueries({ queryKey: ["spotify", "devices"] })}
            howToOpen={devicesHowToOpen}
            onHowToOpen={() => setDevicesHowToOpen(true)}
            onHowToClose={() => setDevicesHowToOpen(false)}
          />

          {/* Playlists */}
          {playlists.length > 0 && (
            <section aria-label={t("playlists.yours")} className="flex flex-col gap-3">
              <h2 className="font-display text-lg text-text">{t("playlists.title")}</h2>
              <div
                className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin"
                role="list"
              >
                {playlists.map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    onPlay={() => handlePlayPlaylist(playlist.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Search bar — below controls when something is playing */}
          <section aria-label={t("search.label")} className="flex flex-col gap-4">
            <h2 className="font-display text-lg text-text">{t("search.title")}</h2>
            <div className="relative">
              <MagnifyingGlassIcon
                size={20}
                weight="duotone"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder={t("search.placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t("search.ariaLabel")}
                className="w-full min-h-[3.25rem] rounded-xl bg-surface pl-12 pr-4 text-base text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent placeholder:text-text-subtle"
              />
            </div>
            {debouncedSearch.length >= 2 && searchResults && (
              <SearchResults tracks={searchResults.tracks} onPlay={handlePlayTrack} />
            )}
          </section>
        </>
      )}
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Devices section with "How to?" modal                                */
/* ------------------------------------------------------------------ */

interface DevicesSectionProps {
  devices: Array<{ id: string; name: string; type: string; isActive: boolean }>;
  onTransfer: (deviceId: string) => void;
  onRefresh: () => void;
  howToOpen: boolean;
  onHowToOpen: () => void;
  onHowToClose: () => void;
}

function DevicesSection({
  devices,
  onTransfer,
  onRefresh,
  howToOpen,
  onHowToOpen,
  onHowToClose,
}: DevicesSectionProps) {
  const { t } = useT("music");

  return (
    <section aria-label={t("devices.title")} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DevicesIcon size={18} weight="duotone" className="text-text-muted" aria-hidden="true" />
          <h2 className="font-display text-lg text-text">{t("devices.title")}</h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-text-muted hover:text-text hover:bg-surface transition-colors"
          aria-label={t("devices.refreshLabel")}
        >
          <ArrowsClockwiseIcon size={14} weight="bold" />
          {t("devices.refresh")}
        </button>
      </div>

      {devices.length > 0 ? (
        <div className="flex gap-2 flex-wrap" role="group" aria-label={t("devices.select")}>
          {devices.map((device) => (
            <button
              type="button"
              key={device.id}
              onClick={() => onTransfer(device.id)}
              aria-pressed={device.isActive}
              className={clsx(
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                device.isActive
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface border border-border text-text-muted hover:border-accent hover:text-text",
              )}
            >
              <span>{device.name}</span>
              <span
                className={clsx("text-xs", device.isActive ? "opacity-80" : "text-text-subtle")}
              >
                {device.type}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2">
          <p className="text-sm text-text-muted">{t("devices.empty")}</p>
          <button
            type="button"
            onClick={onHowToOpen}
            className="text-sm text-accent underline underline-offset-2 hover:text-accent-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
          >
            <span className="inline-flex items-center gap-1">
              <InfoIcon size={13} weight="fill" aria-hidden="true" />
              {t("devices.howTo")}
            </span>
          </button>
        </div>
      )}

      {/* "How to?" modal */}
      <Modal
        open={howToOpen}
        onClose={onHowToClose}
        title={t("devices.title")}
        footer={
          <Button variant="ghost" size="sm" onClick={onHowToClose}>
            OK
          </Button>
        }
      >
        <p className="text-sm text-text-muted leading-relaxed">{t("devices.howToBody")}</p>
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Suggestion chip                                                      */
/* ------------------------------------------------------------------ */

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-full",
        "bg-surface border border-border text-sm text-text-muted",
        "hover:border-accent hover:text-text transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "font-display italic",
      )}
    >
      <MusicNotesIcon size={14} weight="duotone" aria-hidden="true" />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

function PlaylistCard({ playlist, onPlay }: { playlist: SpotifyPlaylist; onPlay: () => void }) {
  const { t } = useT("music");
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={t("playlists.play", { name: playlist.name })}
      className={clsx(
        "shrink-0 flex flex-col gap-2 w-36 text-left",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-md",
        "group",
      )}
    >
      <div className="w-36 h-36 rounded-md bg-surface-warm overflow-hidden relative shadow-sm">
        {playlist.imageUrl ? (
          <img
            src={playlist.imageUrl}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MusicNoteIcon size={36} weight="duotone" className="text-text-subtle opacity-40" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-200">
          <PlayIcon
            size={32}
            weight="fill"
            className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            aria-hidden="true"
          />
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <p className="text-sm font-medium text-text truncate">{playlist.name}</p>
        <p className="text-xs text-text-subtle">
          {t("playlists.trackCount", {
            count: playlist.trackCount,
            owner: playlist.owner,
          })}
        </p>
      </div>
    </button>
  );
}

function SearchResults({
  tracks,
  onPlay,
}: {
  tracks: SpotifyTrack[];
  onPlay: (uri: string) => void;
}) {
  const { t } = useT("music");
  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center rounded-lg bg-surface-warm/50 border border-border/60">
        <MagnifyingGlassIcon size={32} weight="duotone" className="text-text-subtle opacity-50" />
        <p className="text-sm text-text-muted">{t("search.noResults")}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {tracks.map((track) => (
        <li key={track.id} className="flex items-center gap-4 py-3 group">
          <div
            className="shrink-0 w-12 h-12 rounded-sm bg-surface-warm overflow-hidden"
            aria-hidden="true"
          >
            {track.albumArt ? (
              <img src={track.albumArt} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <MusicNoteIcon size={20} weight="duotone" className="text-text-subtle opacity-40" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">{track.name}</p>
            <p className="text-xs text-text-muted truncate">
              {track.artists.join(", ")} &middot; {track.album}
            </p>
          </div>

          <span className="text-xs text-text-subtle shrink-0 tabular-nums">
            {formatMs(track.durationMs)}
          </span>

          <button
            type="button"
            onClick={() => onPlay(`spotify:track:${track.id}`)}
            aria-label={t("player.playTrack", {
              name: track.name,
              artists: track.artists.join(", "),
            })}
            className={clsx(
              "shrink-0 flex items-center justify-center w-9 h-9 rounded-full",
              "bg-transparent text-text-muted",
              "hover:bg-surface hover:text-accent",
              "transition-[opacity,background-color,color] duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            )}
          >
            <PlayIcon size={18} weight="fill" />
          </button>
        </li>
      ))}
    </ul>
  );
}
