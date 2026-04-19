import { NoteIcon } from "@phosphor-icons/react";
import { useT } from "../../lib/useT";

export function EmptyBoardState() {
  const { t } = useT("board");

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-60">
      <NoteIcon size={64} weight="duotone" className="text-text-muted" />
      <div className="text-center">
        <p className="text-xl font-display">{t("empty.title")}</p>
        <p className="text-sm text-text-muted mt-1">{t("empty.body")}</p>
      </div>
    </div>
  );
}
