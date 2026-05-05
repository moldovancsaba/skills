import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@mantine/core/styles.css";
import "./globals.css";
import { ClientNav } from "./client-nav";
import { Footer } from "./footer";
import { ThemeProvider } from "@/lib/theme-provider";
import { CookieBanner } from "@/lib/cookie-consent";
import { AppShell, AppShellMain, MantineProvider, createTheme } from "@mantine/core";

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

const theme = createTheme({
  primaryColor: "orange",
  fontFamily: "var(--font-body), sans-serif",
  fontFamilyMonospace: "Monaco, Courier, monospace",
  headings: {
    fontFamily: "var(--font-display), sans-serif",
    fontWeight: "800",
  },
  defaultRadius: "md",
  white: "#fff",
  black: "#0a0a0a",
  colors: {
    // Semantic colors mapping to our design system
    brand: [
      "#fff8e1", "#ffecb3", "#ffe082", "#ffd54f", "#ffca28",
      "#ffc107", "#ffb300", "#ffa000", "#ff8f00", "#ff6f00"
    ],
    strategy: [
      "#f3e5f5", "#e1bee7", "#ce93d8", "#ba68c8", "#ab47bc",
      "#9c27b0", "#8e24aa", "#7b1fa2", "#6a1b9a", "#4a148c"
    ],
    knowledge: [
      "#e8f5e9", "#c8e6c9", "#a5d6a7", "#81c784", "#66bb6a",
      "#4caf50", "#43a047", "#388e3c", "#2e7d32", "#1b5e20"
    ],
    execution: [
      "#e3f2fd", "#bbdefb", "#90caf9", "#64b5f6", "#42a5f5",
      "#2196f3", "#1e88e5", "#1976d2", "#1565c0", "#0d47a1"
    ],
  },
  components: {
    Button: {
      defaultProps: {
        radius: "md",
        fw: 700,
      },
    },
    Badge: {
      defaultProps: {
        radius: "sm",
        variant: "light",
      },
    },
    Card: {
      defaultProps: {
        radius: "lg",
        withBorder: true,
      },
    },
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
      <body className={`${fontBody.variable} ${fontDisplay.variable} font-body`}>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <ThemeProvider>
            <AppShell
              padding="0"
              navbar={{ width: 280, breakpoint: 'sm' }}
              styles={{
                main: { background: 'var(--mantine-color-dark-9)' }
              }}
            >
              <ClientNav />
              <AppShellMain>
                <div className="h-screen flex flex-col overflow-y-auto">
                  <main className="flex-1 shrink-0">{children}</main>
                  <Footer />
                </div>
              </AppShellMain>
            </AppShell>
            <CookieBanner />
          </ThemeProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
