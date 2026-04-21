import { ArrowSquareOutIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useT } from "../../lib/useT";

const CONFERENCE_HOSTS: Array<{ host: RegExp; label: string }> = [
  { host: /meet\.google\.com/i, label: "Meet" },
  { host: /zoom\.us/i, label: "Zoom" },
  { host: /teams\.microsoft\.com/i, label: "Teams" },
  { host: /webex\.com/i, label: "Webex" },
  { host: /whereby\.com/i, label: "Whereby" },
];

interface ParsedDescription {
  conference: { url: string; label: string } | null;
  sanitized: string;
  /** True when the original description contained sensitive details (PIN, phone) we hid. */
  hadPrivate: boolean;
  original: string;
}

/**
 * Pulls a conference URL out of a raw calendar description and strips the
 * usual baggage (PIN codes, dial-in phone numbers, "Oppure componi:" lines,
 * Google's support URL). Keeps the remaining prose readable on a wall panel
 * without leaking meeting credentials to anyone walking past.
 */
function parseDescription(raw: string): ParsedDescription {
  const original = raw.trim();
  if (!original) {
    return { conference: null, sanitized: "", hadPrivate: false, original };
  }

  let conference: ParsedDescription["conference"] = null;
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  const urls = original.match(urlRegex) ?? [];
  for (const url of urls) {
    const trimmed = url.replace(/[,.;)\]]+$/, "");
    for (const { host, label } of CONFERENCE_HOSTS) {
      if (host.test(trimmed)) {
        conference = { url: trimmed, label };
        break;
      }
    }
    if (conference) break;
  }

  let hadPrivate = false;
  let out = original;

  if (conference) out = out.split(conference.url).join(" ");

  /* Google's boilerplate support URLs. */
  const supportPatterns = [
    /https?:\/\/support\.google\.com\/[^\s]*/gi,
    /https?:\/\/tel\.meet\/\S+/gi,
  ];
  for (const re of supportPatterns) out = out.replace(re, "");

  /* Phone numbers with +country prefix (7+ chars). */
  const phoneRe = /\+\d[\d\s\-().]{6,}/g;
  if (phoneRe.test(out)) hadPrivate = true;
  out = out.replace(phoneRe, "");

  /* PIN strings. */
  const pinRe = /PIN\s*:?\s*\d+#?/gi;
  if (pinRe.test(out)) hadPrivate = true;
  out = out.replace(pinRe, "");

  /* Italian/English boilerplate phrasing. */
  out = out.replace(/oppure componi[^\n.]*/gi, "");
  out = out.replace(/altri numeri di telefono[^\n.]*/gi, "");
  out = out.replace(/scopri di più su [^\n.]*/gi, "");
  out = out.replace(/more phone numbers[^\n.]*/gi, "");
  out = out.replace(/learn more about [^\n.]*/gi, "");

  /* Collapse leftover whitespace. */
  out = out.replace(/[\s ]+/g, " ").trim();

  return { conference, sanitized: out, hadPrivate, original };
}

const SHORT_LIMIT = 180;

export function EventDescription({ description }: { description: string }) {
  const { t } = useT("calendar");
  const parsed = useMemo(() => parseDescription(description), [description]);
  const [expanded, setExpanded] = useState(false);

  if (!parsed.conference && !parsed.sanitized) return null;

  const sanitized = parsed.sanitized;
  const needsTruncation = sanitized.length > SHORT_LIMIT;
  const visible =
    expanded || !needsTruncation ? sanitized : `${sanitized.slice(0, SHORT_LIMIT).trimEnd()}…`;

  return (
    <div className="mt-3 flex flex-col items-start gap-2.5">
      {parsed.conference ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (parsed.conference) window.open(parsed.conference.url, "_blank", "noopener");
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/60 bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
        >
          <ArrowSquareOutIcon size={14} weight="bold" />
          {t("actions.openConference", { service: parsed.conference.label })}
        </button>
      ) : null}

      {visible ? (
        <p className="text-text leading-snug whitespace-pre-wrap break-words">{visible}</p>
      ) : null}

      {needsTruncation ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-accent transition-colors"
        >
          <CaretDownIcon
            size={12}
            weight="bold"
            className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
          />
          {expanded ? t("actions.hideDetails") : t("actions.showDetails")}
        </button>
      ) : null}

      {parsed.hadPrivate ? (
        <span className="text-[11px] text-text-subtle italic">{t("privacy.detailsHidden")}</span>
      ) : null}
    </div>
  );
}
