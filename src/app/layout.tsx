import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@mantine/core/styles.css";
import "./globals.css";
import { ClientNav } from "./client-nav";
import { CookieBanner } from "@/lib/cookie-consent";
import { AppShell, AppShellMain, ColorSchemeScript } from "@mantine/core";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "checklist",
  description: "AI-powered strategic intelligence system",
};

const fontBody = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const fontDisplay = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body className={`${fontBody.variable} ${fontDisplay.variable} font-body`}>
        <Providers>
          <AppShell
            padding="0"
            navbar={{ width: 280, breakpoint: 'sm' }}
            styles={{
              main: { background: 'var(--mantine-color-body)' }
            }}
          >
            <ClientNav />
            <AppShellMain>
              {children}
            </AppShellMain>
            <CookieBanner />
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
