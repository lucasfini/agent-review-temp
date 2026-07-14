import type { Metadata } from "next";

import { BuiltForIndexPage } from "@/components/site/BuiltForMarketingPage";
import { SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Built For | ${SITE_NAME}`,
  description:
    "Explore how marketing teams, founders, sales teams, customer success teams, product marketers, consultants, and creators use AudioRepurpose.",
  alternates: {
    canonical: "/built-for",
  },
  openGraph: {
    type: "website",
    url: "/built-for",
    siteName: SITE_NAME,
    title: `Built For | ${SITE_NAME}`,
    description:
      "Explore how marketing teams, founders, sales teams, customer success teams, product marketers, consultants, and creators use AudioRepurpose.",
    images: [
      {
        url: "/launch/product-overview-light.png",
        width: 1200,
        height: 630,
        alt: "AudioRepurpose source-backed content workflow",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Built For | ${SITE_NAME}`,
    description:
      "Explore how marketing teams, founders, sales teams, customer success teams, product marketers, consultants, and creators use AudioRepurpose.",
    images: ["/launch/product-overview-light.png"],
  },
};

export default function BuiltForPage() {
  return <BuiltForIndexPage />;
}
