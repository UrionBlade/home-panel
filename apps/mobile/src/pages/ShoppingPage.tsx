import { GroceryBagArt } from "../components/illustrations/TileArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { ShoppingForm } from "../components/shopping/ShoppingForm";
import { ShoppingList } from "../components/shopping/ShoppingList";
import { useT } from "../lib/useT";

export function ShoppingPage() {
  const { t } = useT("shopping");

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        artwork={<GroceryBagArt size={96} />}
      />
      <ShoppingForm />
      <ShoppingList />
    </PageContainer>
  );
}
