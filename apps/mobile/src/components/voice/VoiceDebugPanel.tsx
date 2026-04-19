import { useEffect, useRef, useState } from "react";

/**
 * Pannello di debug visibile sullo schermo dell'iPad.
 * Mostra i log vocali Swift in tempo reale.
 * DA RIMUOVERE dopo il debug.
 */
/** Apre il pannello debug vocale dall'esterno */
export function showVoiceDebug() {
  window.dispatchEvent(new CustomEvent("voice-debug-show"));
}

export function VoiceDebugPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Listen for external event to show the panel
  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener("voice-debug-show", handler);
    return () => window.removeEventListener("voice-debug-show", handler);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function listen() {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        const u1 = await listen("voice:log", (e) => {
          if (!mounted) return;
          const msg = e.payload as string;
          setLogs((prev) => [...prev.slice(-50), `[SW] ${msg}`]);
        });

        const u2 = await listen("voice:status", (e) => {
          if (!mounted) return;
          setLogs((prev) => [...prev.slice(-50), `[ST] ${e.payload}`]);
        });

        const u3 = await listen("voice:command", (e) => {
          if (!mounted) return;
          setLogs((prev) => [...prev.slice(-50), `[CMD] ${e.payload}`]);
        });

        const u4 = await listen("voice:error", (e) => {
          if (!mounted) return;
          setLogs((prev) => [...prev.slice(-50), `[ERR] ${e.payload}`]);
        });

        return () => {
          u1();
          u2();
          u3();
          u4();
        };
      } catch {
        setLogs((prev) => [...prev, "[DEBUG] Tauri events non disponibili"]);
        return () => {};
      }
    }

    let cleanup: (() => void) | undefined;
    listen().then((fn) => {
      cleanup = fn;
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  const count = logs.length;
  useEffect(() => {
    if (count >= 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [count]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[999] bg-black/90 text-green-400 font-mono text-[11px] leading-tight max-h-[40vh] overflow-y-auto p-3 border-t border-green-800">
      <div className="flex justify-between items-center mb-2">
        <span className="text-green-300 font-bold">Voice Debug ({logs.length})</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLogs([])}
            className="text-yellow-400 text-[10px] px-2 py-0.5 border border-yellow-800 rounded"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-red-400 text-[10px] px-2 py-0.5 border border-red-800 rounded"
          >
            Hide
          </button>
        </div>
      </div>
      {logs.length === 0 ? (
        <div className="text-green-800">Waiting for voice events...</div>
      ) : (
        logs.map((log, i) => (
          <div
            key={i}
            className={
              log.startsWith("[CMD]")
                ? "text-yellow-300 font-bold"
                : log.startsWith("[ERR]")
                  ? "text-red-400"
                  : ""
            }
          >
            {log}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
