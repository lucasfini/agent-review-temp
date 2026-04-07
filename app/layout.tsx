import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth/context";
import CompactFooter from "@/components/site/CompactFooter";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeAwareToaster } from "@/components/theme-aware-toaster";
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/site-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      { url: "/brand-icon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/brand-icon.svg"],
    apple: ["/brand-icon.svg"],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} - Transcript, Analysis, and Content in One Workflow`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/launch/hub-real.png",
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
    images: ["/launch/hub-real.png"],
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            {children}
            <CompactFooter />
            <ThemeAwareToaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
