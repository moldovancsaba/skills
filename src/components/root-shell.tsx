'use client';

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell, AppShellMain } from "@mantine/core";
import { ClientNav } from "@/app/client-nav";
import { CookieBanner } from "@/lib/cookie-consent";

type RootShellProps = {
  children: ReactNode;
};

export function RootShell({ children }: RootShellProps) {
  const pathname = usePathname();
  const isStandaloneCard = pathname?.startsWith("/card/");

  if (isStandaloneCard) {
    return (
      <>
        {children}
        <CookieBanner />
      </>
    );
  }

  return (
    <AppShell
      padding="0"
      navbar={{ width: 280, breakpoint: "sm" }}
      styles={{
        main: { background: "var(--mantine-color-body)" },
      }}
    >
      <ClientNav />
      <AppShellMain>{children}</AppShellMain>
      <CookieBanner />
    </AppShell>
  );
}
