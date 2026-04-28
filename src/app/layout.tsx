import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@mantine/core/styles.css";
import "./globals.css";
import { ClientNav } from "./client-nav";
import { Footer } from "./footer";
import { ThemeProvider } from "@/lib/theme-provider";
import { CookieBanner } from "@/lib/cookie-consent";
import { MantineProvider, createTheme } from "@mantine/core";

export const metadata: Metadata = {
  title: "checklist",
  description: "AI-powered marketing operating system",
};

const fontBody = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const fontDisplay = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
});

const theme = createTheme({
  primaryColor: "orange", // To match the Amber theme
  fontFamily: "Inter, sans-serif",
  headings: {
    fontFamily: "Plus Jakarta Sans, sans-serif",
  },
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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,600,1,0"
        />
      </head>
      <body className={`${fontBody.variable} ${fontDisplay.variable} h-screen flex font-body overflow-hidden`}>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <ThemeProvider>
            <ClientNav />
            <div className="flex-1 flex flex-col h-full overflow-y-auto min-w-0 bg-background relative">
              <main className="flex-1 shrink-0">{children}</main>
              <Footer />
            </div>
            <CookieBanner />
          </ThemeProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
