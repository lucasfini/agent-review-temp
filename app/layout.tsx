import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth/context";
import CompactFooter from "@/components/site/CompactFooter";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeAwareToaster } from "@/components/theme-aware-toaster";
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
  title: "AudioRepurpose - Transcript, Analysis, and Content in One Workflow",
  description: "Turn audio into transcript, insights, and publish-ready content from one workflow built for interviews, podcasts, and recorded conversations.",
  icons: {
    icon: [
      { url: "/brand-icon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/brand-icon.svg"],
    apple: ["/brand-icon.svg"],
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
