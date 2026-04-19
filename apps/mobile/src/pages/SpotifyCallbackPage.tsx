import { SpinnerIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSpotifyCallback } from "../lib/hooks/useSpotify";
import { useT } from "../lib/useT";

/**
 * Handles the OAuth redirect from Spotify.
 * Reads the `?code=` query param, exchanges it via the backend,
 * then navigates to /music.
 */
export function SpotifyCallbackPage() {
  const navigate = useNavigate();
  const { t } = useT("music");
  const callback = useSpotifyCallback();
  const calledRef = useRef(false);

  useEffect(() => {
    // Guard against double-invocation in React Strict Mode
    if (calledRef.current) return;
    calledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      void navigate("/music", { replace: true });
      return;
    }

    callback.mutate(code, {
      onSettled: () => {
        void navigate("/music", { replace: true });
      },
    });
  }, [callback.mutate, navigate]);

  return (
    <main
      className="flex flex-col items-center justify-center h-screen gap-4 text-text-muted"
      aria-live="polite"
      aria-label={t("callback.aria")}
    >
      <SpinnerIcon size={32} className="animate-spin text-accent" />
      <p className="text-sm">{t("callback.connecting")}</p>
      {callback.isError && (
        <p role="alert" className="text-sm text-danger">
          {t("callback.error")}
        </p>
      )}
    </main>
  );
}
