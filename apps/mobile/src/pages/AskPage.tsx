import { ArrowSquareOutIcon, ChatsTeardropIcon, SparkleIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { useT } from "../lib/useT";

const CLAUDE_URL = "https://claude.ai/new";

/**
 * "Chiedi" — pagina di ingresso a Claude dal pannello di casa.
 *
 * Scelta progettuale: NON incorporare Claude in un iframe. Anthropic
 * configura `X-Frame-Options: DENY` su claude.ai e Chrome NON scatena
 * `onerror` in quel caso — si vedrebbe un rettangolo bianco con l'icona
 * "pagina non disponibile", la peggior esperienza possibile.
 *
 * Qui invece presentiamo un hero caldo con CTA esplicito: un tap apre
 * Claude in una nuova scheda, con la sessione autenticata dell'utente.
 * L'esperienza è onesta, leggibile a 3 metri, e lascia intravedere lo
 * scopo (pensare insieme) prima ancora di aprire davvero l'assistente.
 */
export function AskPage() {
  const { t } = useT("ask");

  const suggestions = t("suggestions.items", {
    returnObjects: true,
  }) as unknown as string[];

  const openClaude = () => {
    window.open(CLAUDE_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <PageContainer maxWidth="default">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Hero tile — invito caldo ad aprire Claude */}
      <motion.button
        type="button"
        onClick={openClaude}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        className="group relative w-full overflow-hidden rounded-tile text-left p-8 md:p-12 border border-accent/30 transition-shadow hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 10%, color-mix(in oklch, var(--color-accent) 28%, transparent), transparent 55%), radial-gradient(circle at 92% 90%, color-mix(in oklch, var(--color-ochre) 22%, transparent), transparent 60%), linear-gradient(135deg, var(--tile-terracotta-a), var(--tile-ochre-a))",
        }}
      >
        <span
          aria-hidden
          className="absolute -top-10 -right-10 w-56 h-56 rounded-full blur-3xl opacity-70"
          style={{
            backgroundColor: "color-mix(in oklch, var(--color-accent) 30%, transparent)",
          }}
        />

        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
          <span
            className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center rounded-2xl shrink-0 transition-transform group-hover:scale-105"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-accent) 22%, var(--color-surface-elevated))",
              color: "var(--color-accent)",
            }}
          >
            <ChatsTeardropIcon size={56} weight="duotone" />
          </span>

          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-medium leading-[1.05] text-text">
              {t("hero.headline")}
            </h2>
            <p className="text-base md:text-lg text-text-muted max-w-2xl">{t("hero.body")}</p>
            <div className="flex items-center gap-2 mt-2 text-accent font-medium">
              <ArrowSquareOutIcon size={20} weight="bold" />
              <span>{t("actions.open")}</span>
            </div>
          </div>
        </div>
      </motion.button>

      {/* Suggestions — invitation to think out loud */}
      {Array.isArray(suggestions) && suggestions.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.2, 0, 0, 1] }}
          className="flex flex-col gap-4"
        >
          <h3 className="font-display text-xl text-text flex items-center gap-2">
            <SparkleIcon size={20} weight="duotone" className="text-accent" />
            {t("suggestions.title")}
          </h3>
          <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {suggestions.map((s, i) => (
              <motion.li
                key={`${i}-${s.slice(0, 12)}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.2 + i * 0.04, ease: [0.2, 0, 0, 1] }}
                className="px-5 py-4 rounded-md bg-surface border border-border text-text label-italic hover:border-accent/40 transition-colors cursor-pointer"
                onClick={openClaude}
              >
                <span className="opacity-60 mr-2">{"»"}</span>
                {s}
              </motion.li>
            ))}
          </ul>
          <p className="label-italic text-sm text-text-subtle mt-2">{t("fallback.note")}</p>
        </motion.section>
      )}
    </PageContainer>
  );
}
