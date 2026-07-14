import ProductMarketingPage from "@/components/site/ProductMarketingPage";
import { getProductRouteMetadata } from "@/components/site/productContent";

export const metadata = getProductRouteMetadata("library");

export default function ProductLibraryPage() {
  return <ProductMarketingPage page="library" />;
}
