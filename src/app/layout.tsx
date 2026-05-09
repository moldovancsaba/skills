import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@mantine/core/styles.css";
import "./globals.css";
import { ColorSchemeScript } from "@mantine/core";
import { Providers } from "@/components/providers";
import { RootShell } from "@/components/root-shell";

const colorSchemeStorageKey = "checklist-color-scheme";

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
        <ColorSchemeScript defaultColorScheme="auto" localStorageKey={colorSchemeStorageKey} />
      </head>
      <body className={`${fontBody.variable} ${fontDisplay.variable} font-body`}>
        <Providers>
          <RootShell>{children}</RootShell>
        </Providers>
      </body>
    </html>
  );
}
