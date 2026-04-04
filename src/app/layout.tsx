import type { Metadata } from "next";
import "./globals.css";
import { ClientNav } from "./client-nav";

export const metadata: Metadata = {
  title: "Checklist Marketing OS",
  description: "AI-powered marketing operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ClientNav />
        {children}
      </body>
    </html>
  );
}