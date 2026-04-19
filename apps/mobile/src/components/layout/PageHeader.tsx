import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Titolo principale (Fraunces big) */
  title: string;
  /** Sottotitolo in italic poetico */
  subtitle?: string;
  /** Illustrazione 3D o icona opzionale mostrata a destra del titolo */
  artwork?: ReactNode;
  /** Slot azioni a destra (es. pulsante "Nuovo") */
  actions?: ReactNode;
}

/**
 * Header pagina consistente.
 * Layout: titolo grande Fraunces + sottotitolo italic + slot azioni.
 * Su iPad portrait (~720-940px) il titolo arriva a 3.5rem, su mobile 2.5rem.
 */
export function PageHeader({ title, subtitle, artwork, actions }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        {artwork && <div className="shrink-0">{artwork}</div>}
        <div className="min-w-0 flex flex-col gap-1">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-[-0.02em] text-text leading-[0.95]">
            {title}
          </h1>
          {subtitle && <p className="label-italic text-lg text-text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </header>
  );
}
