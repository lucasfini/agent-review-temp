import ProductMarketingPage from "@/components/site/ProductMarketingPage";
import { getProductRouteMetadata } from "@/components/site/productContent";

export const metadata = getProductRouteMetadata("integrations");

export default function ProductIntegrationsPage() {
  return <ProductMarketingPage page="integrations" />;
}

