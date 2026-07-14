import ProductMarketingPage from "@/components/site/ProductMarketingPage";
import { getProductRouteMetadata } from "@/components/site/productContent";

export const metadata = getProductRouteMetadata("teams");

export default function ProductTeamsPage() {
  return <ProductMarketingPage page="teams" />;
}

