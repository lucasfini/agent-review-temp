import PublicPricingPage from "@/components/site/PublicPricingPage";
import {
  buildFallbackPublicPricingPlans,
  buildPublicPricingComparisonGroups,
  buildPublicPricingPlans,
} from "@/lib/billing/public-pricing";
import { getActivePlans } from "@/lib/billing/plans";

export const metadata = {
  title: "Pricing | AudioRepurpose",
  description:
    "Compare AudioRepurpose plans for monthly credits, seats, upload limits, generated content, recording outputs, integrations, and team workflows.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PricingPage() {
  let plans = buildFallbackPublicPricingPlans();
  let pricingDataSource: "active-plans" | "fallback" = "fallback";

  try {
    const activePlans = await getActivePlans();
    const publicPlans = buildPublicPricingPlans(activePlans);
    if (publicPlans.length > 0) {
      plans = publicPlans;
      pricingDataSource = "active-plans";
    }
  } catch (error) {
    console.error("[PUBLIC PRICING] Failed to load active plans; using public fallback data.", error);
  }

  return (
    <PublicPricingPage
      plans={plans}
      comparisonGroups={buildPublicPricingComparisonGroups(plans)}
      pricingDataSource={pricingDataSource}
    />
  );
}
