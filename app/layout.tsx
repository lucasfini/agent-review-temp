import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/lib/auth/context";
import CompactFooter from "@/components/site/CompactFooter";
import RouteThemeControl from "@/components/site/RouteThemeControl";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeAwareToaster } from "@/components/theme-aware-toaster";
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/site-config";
import "./globals.css";

const sansFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-sans-brand",
  fallback: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
});

const displayFont = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
  variable: "--font-display",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const monoFont = Geist_Mono({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-mono-brand",
  fallback: ["SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: `${SITE_NAME} - Transcript, Analysis, and Content in One Workflow`,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/audio-wave-logo.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/audio-wave-logo.svg"],
    apple: ["/audio-wave-logo.svg"],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} - Transcript, Analysis, and Content in One Workflow`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/launch/product-overview-light.png",
        width: 1200,
        height: 630,
        alt: "AudioRepurpose dashboard showing transcript analysis and content generation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - Transcript, Analysis, and Content in One Workflow`,
    description: SITE_DESCRIPTION,
    images: ["/launch/product-overview-light.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sansFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="audiorepurpose-theme"
          disableTransitionOnChange
        >
          <AuthProvider>
            {children}
            <RouteThemeControl />
            <CompactFooter />
            <ThemeAwareToaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
