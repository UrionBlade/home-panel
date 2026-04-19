import { useTranslation } from "react-i18next";

interface PlaceholderPageProps {
  titleKey: string;
  bodyKey: string;
}

export function PlaceholderPage({ titleKey, bodyKey }: PlaceholderPageProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center h-full p-10 text-center gap-5">
      <h1 className="font-display text-5xl text-text">{t(titleKey as never)}</h1>
      <p className="text-text-muted max-w-md">{t(bodyKey as never)}</p>
    </div>
  );
}
