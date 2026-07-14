import ProductMarketingPage from "@/components/site/ProductMarketingPage";
import { getProductRouteMetadata } from "@/components/site/productContent";

export const metadata = getProductRouteMetadata("upload");

export default function ProductUploadPage() {
  return <ProductMarketingPage page="upload" />;
}

