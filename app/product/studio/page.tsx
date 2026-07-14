import ProductMarketingPage from "@/components/site/ProductMarketingPage";
import { getProductRouteMetadata } from "@/components/site/productContent";

export const metadata = getProductRouteMetadata("studio");

export default function ProductStudioPage() {
  return <ProductMarketingPage page="studio" />;
}
