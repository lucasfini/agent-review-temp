import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BuiltForMarketingPage } from "@/components/site/BuiltForMarketingPage";
import {
  BUILT_FOR_ROUTE_PAGE_LIST,
  BUILT_FOR_ROUTE_PAGES,
  isBuiltForRouteSlug,
} from "@/components/site/builtForRouteData";
import { SITE_NAME } from "@/lib/site-config";

type BuiltForRouteProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return BUILT_FOR_ROUTE_PAGE_LIST.map((page) => ({
    slug: page.slug,
  }));
}

export async function generateMetadata({ params }: BuiltForRouteProps): Promise<Metadata> {
  const { slug } = await params;

  if (!isBuiltForRouteSlug(slug)) {
    return {
      title: `Built For | ${SITE_NAME}`,
    };
  }

  const page = BUILT_FOR_ROUTE_PAGES[slug];

  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: {
      canonical: page.canonicalPath,
    },
    openGraph: {
      type: "website",
      url: page.canonicalPath,
      siteName: SITE_NAME,
      title: page.metaTitle,
      description: page.metaDescription,
      images: [
        {
          url: "/launch/product-overview-light.png",
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} source-backed content workflow`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.metaTitle,
      description: page.metaDescription,
      images: ["/launch/product-overview-light.png"],
    },
  };
}

export default async function BuiltForDetailPage({ params }: BuiltForRouteProps) {
  const { slug } = await params;

  if (!isBuiltForRouteSlug(slug)) {
    notFound();
  }

  return <BuiltForMarketingPage slug={slug} />;
}
