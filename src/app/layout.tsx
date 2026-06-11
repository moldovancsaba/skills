import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "@doneisbetter/gds-theme/styles.css";
import "./globals.css";
import { ColorSchemeScript } from "@/components/gds/primitives";
import { Providers } from "@/components/providers";
import { RootShell } from "@/components/root-shell";
import { GDS_LOCALE_DIRECTION_MAP } from "@/lib/gds-locale-bootstrap.generated";
import { getShellInitialSession } from "@/lib/server-shell-data";
import { UI_LANGUAGE_STORAGE_KEY } from "@/lib/ui-language-config";

const uiLanguageBootstrapScript = `
(() => {
  try {
    const directions = ${JSON.stringify(GDS_LOCALE_DIRECTION_MAP)};
    const stored = window.localStorage.getItem(${JSON.stringify(UI_LANGUAGE_STORAGE_KEY)});
    const language = Object.prototype.hasOwnProperty.call(directions, stored) ? stored : "en";
    const dir = directions[language] || "ltr";
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
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body className={`${fontBody.variable} ${fontDisplay.variable} font-body`}>
        <Providers>
          <RootShell initialSession={initialSession}>{children}</RootShell>
        </Providers>
      </body>
    </html>
  );
}
