import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "@mantine/core/styles.css";
import "./globals.css";
import { ColorSchemeScript } from "@mantine/core";
import { Providers } from "@/components/providers";
import { RootShell } from "@/components/root-shell";
import { getShellInitialSession } from "@/lib/server-shell-data";

const colorSchemeStorageKey = "checklist-color-scheme";
const uiLanguageStorageKey = "checklist-ui-language";
const uiLanguageBootstrapScript = `
(() => {
  try {
    const stored = window.localStorage.getItem(${JSON.stringify(uiLanguageStorageKey)});
    const valid = new Set(["en", "hu", "es", "ar", "he"]);
    const language = valid.has(stored) ? stored : "en";
    const dir = language === "ar" || language === "he" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  } catch (_error) {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  }
})();
`;

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialSession = await getShellInitialSession();
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
        <Script id="ui-language-bootstrap" strategy="beforeInteractive">
          {uiLanguageBootstrapScript}
        </Script>
        <ColorSchemeScript defaultColorScheme="auto" localStorageKey={colorSchemeStorageKey} />
      </head>
      <body className={`${fontBody.variable} ${fontDisplay.variable} font-body`}>
        <Providers>
          <RootShell initialSession={initialSession}>{children}</RootShell>
        </Providers>
      </body>
    </html>
  );
}
