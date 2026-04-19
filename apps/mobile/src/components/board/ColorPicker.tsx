import type { PostitColor } from "@home-panel/shared";
import { POSTIT_COLORS } from "@home-panel/shared";
import clsx from "clsx";
import { useT } from "../../lib/useT";
import { POSTIT_COLOR_MAP } from "./PostitCard";

interface ColorPickerProps {
  value: PostitColor;
  onChange: (color: PostitColor) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { t } = useT("board");

  return (
    <div className="flex items-center gap-3" role="radiogroup" aria-label={t("fields.color")}>
      {POSTIT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={t(`colors.${color}`)}
          onClick={() => onChange(color)}
          className={clsx(
            "w-9 h-9 rounded-full transition-all duration-150 shrink-0",
            value === color
              ? "ring-2 ring-offset-2 ring-accent scale-110"
              : "hover:scale-105 opacity-80 hover:opacity-100",
          )}
          style={{ backgroundColor: POSTIT_COLOR_MAP[color] }}
        />
      ))}
    </div>
  );
}
