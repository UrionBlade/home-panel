import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useT } from "../../lib/useT";

interface Category {
  title: string;
  items: string[];
}

interface VoiceCommandsListProps {
  /** Render as a collapsible block with a header toggle (Settings view). */
  collapsible?: boolean;
  /** When collapsible, whether it's expanded. */
  open?: boolean;
  /** When collapsible, called on header click. */
  onToggle?: () => void;
}

/**
 * Grouped "what you can say" catalog. Used both inside the Settings page
 * (collapsible) and in the VoiceCommandsModal (always expanded).
 */
export function VoiceCommandsList({
  collapsible = false,
  open = true,
  onToggle,
}: VoiceCommandsListProps) {
  const { t } = useT("voice");
  const categories = t("commands.categories", { returnObjects: true }) as Record<string, Category>;
  const hint = t("commands.hint");

  const body = (
    <div className="px-4 pb-4 flex flex-col gap-5">
      {collapsible && <p className="text-xs text-text-muted leading-snug">{hint}</p>}
      {Object.entries(categories).map(([key, cat]) => (
        <div key={key} className="flex flex-col gap-1.5">
          <h3 className="label-mono text-accent" style={{ fontWeight: 900 }}>
            {cat.title}
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {cat.items.map((item) => (
              <li key={item} className="text-text-muted leading-snug">
                <span className="text-text">“{item}”</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  if (!collapsible) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted leading-snug">{hint}</p>
        {body}
      </div>
    );
  }

  return (
    <div className="rounded-md bg-surface border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full p-4 text-left"
        aria-expanded={open}
      >
        <span className="font-medium">{t("commands.title")}</span>
        {open ? <CaretUp size={20} weight="duotone" /> : <CaretDown size={20} weight="duotone" />}
      </button>
      {open && body}
    </div>
  );
}
