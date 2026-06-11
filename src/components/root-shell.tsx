'use client';

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell, AppShellMain } from "@/components/gds/primitives";
import { ClientNav } from "@/app/client-nav";
import { CookieBanner } from "@/lib/cookie-consent";

type RootShellProps = {
  children: ReactNode;
  initialSession?: {
    authenticated: boolean;
    id: string;
    email: string;
    name: string;
    picture?: string;
    user: {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };
  } | null;
};

export function RootShell({ children, initialSession = null }: RootShellProps) {
  const pathname = usePathname();
  const isStandaloneCard = pathname?.startsWith("/card/");
  const isStandaloneOperatorSurface = pathname?.startsWith("/local-ai");

  if (isStandaloneCard || isStandaloneOperatorSurface) {
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
        main: { background: "var(--app-bg)" },
      }}
    >
      <ClientNav initialSession={initialSession} />
      <AppShellMain>{children}</AppShellMain>
      <CookieBanner />
    </AppShell>
  );
}
