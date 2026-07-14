import ProductMarketingPage from "@/components/site/ProductMarketingPage";
import { getProductRouteMetadata } from "@/components/site/productContent";

export const metadata = getProductRouteMetadata("analysis");

export default function ProductAnalysisPage() {
  return <ProductMarketingPage page="analysis" />;
}
