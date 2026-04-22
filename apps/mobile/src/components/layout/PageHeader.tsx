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
 * Layout:
 * - Mobile (< sm): titolo e sottotitolo in alto, actions sotto a piena
 *   larghezza così il pulsante non si stringe né va a capo sopra il titolo.
 * - sm e oltre: titolo + actions fianco a fianco con justify-between.
 * - Su iPad portrait (~720-940px) il titolo arriva a 3.5rem, su mobile 2.5rem.
 */
export function PageHeader({ title, subtitle, artwork, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div className="flex items-start gap-3 sm:gap-4 min-w-0 sm:flex-1">
        {artwork && <div className="shrink-0">{artwork}</div>}
        <div className="min-w-0 flex flex-col gap-1">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-[-0.02em] text-text leading-[0.95]">
            {title}
          </h1>
          {subtitle && (
            <p className="label-italic text-base sm:text-lg text-text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-3 sm:shrink-0 [&>*]:flex-1 sm:[&>*]:flex-initial">
          {actions}
        </div>
      )}
    </header>
  );
}
