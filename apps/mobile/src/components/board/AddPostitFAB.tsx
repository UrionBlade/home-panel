import { PlusIcon } from "@phosphor-icons/react";
import { useT } from "../../lib/useT";

interface AddPostitFABProps {
  onClick: () => void;
}

export function AddPostitFAB({ onClick }: AddPostitFABProps) {
  const { t } = useT("board");

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("actions.add")}
      className="fixed bottom-8 right-8 z-50 w-16 h-16 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:scale-105 hover:shadow-xl active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <PlusIcon size={28} weight="bold" />
    </button>
  );
}
