import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ClientNav } from "./client-nav";
import { Footer } from "./footer";
import { ThemeProvider } from "@/lib/theme-provider";
import { CookieBanner } from "@/lib/cookie-consent";

export const metadata: Metadata = {
  title: "Checklist Marketing OS",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontBody.variable} ${fontDisplay.variable} min-h-screen flex flex-col font-body`}>
        <ThemeProvider>
          <ClientNav />
          <main className="flex-1">{children}</main>
          <Footer />
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
