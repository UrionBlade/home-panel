import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  /** max width personalizzato (default: nessuno, usa tutta la larghezza) */
  maxWidth?: "narrow" | "default" | "wide" | "full";
}

/**
 * Container standard per le pagine interne.
 * Padding responsive iPad-first: px-6 mobile, px-8 md, px-10 lg.
 * Default max-width is wide (5xl) for pages with moderate content.
 */
export function PageContainer({ children, maxWidth = "default" }: PageContainerProps) {
  const widthClass =
    maxWidth === "narrow"
      ? "max-w-3xl"
      : maxWidth === "default"
        ? "max-w-5xl"
        : maxWidth === "wide"
          ? "max-w-6xl"
          : "";

  return (
    <div className="h-full overflow-auto">
      <div
        className={`px-5 md:px-6 lg:px-8 pt-5 md:pt-6 lg:pt-8 pb-8 md:pb-10 flex flex-col gap-8 md:gap-10 ${widthClass} mx-auto`}
      >
        {children}
      </div>
    </div>
  );
}
