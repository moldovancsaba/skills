'use client';

import Link from "next/link";
import type { ReactNode } from "react";
import {
  PublicBrandFooter,
  PublicFlowShell,
  PublicNav,
  PublicShell,
  type PublicFlowStage,
  type PublicNavItem,
} from "@doneisbetter/gds/client";
import { Badge, Group, Stack } from "@/components/gds/primitives";
import { BodyText, MetaText } from "@/components/ui/typography";

export type MiniappShellNavItem = PublicNavItem;

type MiniappPublicShellProps = {
  brandTitle: string;
  brandDescription: string;
  activeNavId?: string;
  navItems: MiniappShellNavItem[];
  actions?: ReactNode;
  footerActions?: ReactNode;
  children: ReactNode;
};

export function MiniappPublicShell({
  brandTitle,
  brandDescription,
  activeNavId = "overview",
  navItems,
  actions,
  footerActions,
  children,
}: MiniappPublicShellProps) {
  return (
    <PublicShell
      brand={(
        <Stack gap={2}>
          <Group gap="xs">
            <BodyText>{brandTitle}</BodyText>
            <Badge size="xs" variant="light" color="review">Miniapp</Badge>
          </Group>
          <MetaText>{brandDescription}</MetaText>
        </Stack>
      )}
      navItems={navItems}
      activeNavId={activeNavId}
      navigation={(
        <PublicNav
          items={navItems}
          activeId={activeNavId}
          renderLink={(item, active) => (
            <Link
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          )}
        />
      )}
      actions={actions}
      footer={(
        <PublicBrandFooter
          brandTitle={brandTitle}
          description={brandDescription}
          actions={footerActions}
          legal={(
            <Group gap="sm">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </Group>
          )}
          compact
        />
      )}
      headerBordered
      maxContentWidth={1440}
      mobileNavigationMode="sheet"
    >
      {children}
    </PublicShell>
  );
}

type MiniappPublicFlowProps = {
  stage: PublicFlowStage;
  eyebrow?: ReactNode;
  exitAction?: ReactNode;
  children?: never;
};

export function MiniappPublicFlow({ stage, eyebrow, exitAction }: MiniappPublicFlowProps) {
  return (
    <PublicFlowShell
      stage={stage}
      eyebrow={eyebrow}
      exitAction={exitAction}
    />
  );
}
