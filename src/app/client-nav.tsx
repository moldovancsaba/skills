'use client';

import { AppShellNavbar, AppShellSection, NavLink, Stack, Group, Box, Avatar, Menu, rem, UnstyledButton, ScrollArea, ThemeIcon, Badge, Divider, Button, Anchor } from "@mantine/core";
import { IconChevronRight as ChevronRight, IconSun as Sun, IconMoon as Moon, IconLogout as LogOut, IconUser as UserIcon, IconSettings as SettingsIcon, IconLayoutDashboard as LayoutDashboard, IconDatabase as Database, IconListCheck as ListCheck, IconTarget as Target, IconSparkles as Sparkles, IconChevronDown as ChevronDown, IconHelmet as HardHat, IconLayersIntersect as Layers, IconHistory as History } from "@tabler/icons-react";
import { Logo } from "@/components/ui/logo";
import { useState, useEffect } from "react";
import { usePathname, useRouter, useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme-provider";
import { APP_VERSION } from "@/lib/release";
import { logClientInteraction } from "@/lib/client-events";
import { getSidebarActiveStyle, getSidebarButtonStyle, getSidebarHoverStyle, getSidebarShellStyle, type ModuleTone } from "@/lib/semantic-theme";
import { LabelText, MetaText } from "@/components/ui/typography";
import { UiLanguageSelect } from "@/components/ui-language-select";
import { useI18n } from "@/lib/ui-i18n";

const pipelineItems = [
  {
    key: "data",
    href: (companyId: string) => `/${companyId}/data`,
    labelKey: "nav.data",
    icon: Database,
    color: "ingress",
    tone: "ingress",
  },
  {
    key: "topics",
    href: (companyId: string) => `/${companyId}/topics`,
    labelKey: "nav.topics",
    icon: Layers,
    color: "synthesis",
    tone: "synthesis",
  },
  {
    key: "goals",
    href: (companyId: string) => `/${companyId}/goals`,
    labelKey: "nav.goals",
    icon: Target,
    color: "strategy",
    tone: "strategy",
  },
  {
    key: "review",
    href: (companyId: string) => `/${companyId}/review`,
    labelKey: "nav.review",
    icon: History,
    color: "review",
    tone: "review",
  },
  {
    key: "knowmore",
    href: (companyId: string) => `/${companyId}/knowmore`,
    labelKey: "nav.knowmore",
    icon: Sparkles,
    color: "knowmore",
    tone: "knowmore",
  },
  {
    key: "tactical",
    href: (companyId: string) => `/${companyId}/tactical`,
    labelKey: "nav.tactical",
    icon: LayoutDashboard,
    color: "tactical",
    tone: "tactical",
  },
  {
    key: "checklist",
    href: (companyId: string) => `/${companyId}/checklist`,
    labelKey: "nav.checklist",
    icon: ListCheck,
    color: "checklist",
    tone: "checklist",
  },
  {
    key: "pipeline",
    href: (companyId: string) => `/${companyId}/pipeline`,
    labelKey: "nav.aiQueue",
    icon: HardHat,
    color: "gray",
    tone: "neutral",
  },
];

type ClientNavProps = {
  initialSession?: {
    authenticated: boolean;
    id: string;
    email: string;
    name: string;
    picture?: string;
    user?: {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };
  } | null;
};

export function ClientNav({ initialSession = null }: ClientNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { company, setCompany } = useStore();
  const { isDark, toggle } = useTheme();
  const { t } = useI18n();
  const [session, setSession] = useState<any>(initialSession);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [resolvedCompany, setResolvedCompany] = useState<any>(null);

  // Pure URL-driven company ID
  const companyIdFromUrl = params?.companyId as string;

  useEffect(() => {
    if (initialSession) return;
    fetch("/api/auth/session?scope=identity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSession(data));
  }, [initialSession]);

  useEffect(() => {
    const activeId = company?.id || companyIdFromUrl;
    if (!activeId) {
      const timer = window.setTimeout(() => {
        setCounts({});
        setResolvedCompany(null);
      }, 0);

      return () => window.clearTimeout(timer);
    }

    const fetchCounts = async () => {
      try {
        const res = await fetch(`/api/companies/${activeId}/nav`);
        if (res.ok) {
          const data = await res.json();
          if (data.company) {
            setResolvedCompany(data.company);
            if (!company || company.id !== data.company.id || company.name !== data.company.name) {
              setCompany(data.company);
            }
          }
          const checklistCount = Number(data.counts?.checklist || 0);
          const planningCount = Math.max(Number(data.counts?.tactical || 0), checklistCount);
          setCounts({
            data: data.counts?.data || 0,
            topics: data.counts?.topics || 0,
            knowmore: data.counts?.knowmore || 0,
            goals: data.counts?.goals || 0,
            checklist: checklistCount,
            tactical: planningCount,
            review: data.counts?.review || 0,
            pipeline: data.counts?.pipeline || 0,
          });
        }
      } catch (err) {
        console.error("Failed to fetch nav counts:", err);
      }
    };

    void (async () => {
      await fetchCounts();
    })();

    const interval = setInterval(() => {
      void fetchCounts();
    }, 30000);

    return () => clearInterval(interval);
  }, [company, company?.id, company?.name, companyIdFromUrl, setCompany]);

  const handleLogout = () => {
    window.location.href = "/api/auth/logout?returnTo=/login";
  };

  const navCompany = resolvedCompany?.id === companyIdFromUrl
    ? resolvedCompany
    : (company?.id === companyIdFromUrl ? company : resolvedCompany || company);
  const activeCompanyId = company?.id || companyIdFromUrl;

  useEffect(() => {
    if (!activeCompanyId || !pathname || pathname === "/") return;

    void logClientInteraction({
      companyId: activeCompanyId,
      surface: "global-navigation",
      interactionType: "PIPELINE_PAGE_OPEN",
      entityType: "ROUTE",
      entityId: pathname,
      payload: { pathname },
      teachingWeight: 30,
    });
  }, [activeCompanyId, pathname]);

  if (pathname === "/login" || pathname === "/auth" || pathname?.startsWith("/auth/") || pathname?.startsWith("/local-ai")) {
    return null;
  }

  return (
    <AppShellNavbar p="md" style={getSidebarShellStyle()}>
      <AppShellSection mb="xl">
        <Box px="xs" py="md">
          <Logo />
        </Box>
      </AppShellSection>

      <AppShellSection component={ScrollArea} grow mx="-md" px="md">
        <Stack gap="xs">
          {/* Global Portfolio and Intelligence Unit divider removed per user request */}

          {((company || companyIdFromUrl) && pathname !== '/' && !pathname.startsWith('/faq') && !pathname.startsWith('/manual')) ? (
            <Stack gap={4}>
              <NavLink
                label={navCompany?.name || t("nav.company")}
                description={(navCompany?.id || companyIdFromUrl) ? t("nav.companyDescription") : undefined}
                variant="light"
                active={pathname === `/${navCompany?.id || companyIdFromUrl}`}
                onClick={() => {
                  const targetCompanyId = navCompany?.id || companyIdFromUrl;
                  if (targetCompanyId) {
                    router.push(`/${targetCompanyId}`);
                  }
                }}
                styles={{
                  root: {
                    ...getSidebarActiveStyle("review"),
                  },
                  label: { color: "var(--nav-company-label)" },
                  description: { color: "var(--nav-company-description)" },
                }}
              />

              {pipelineItems.map((item) => {
                const companyId = company?.id || companyIdFromUrl;
                const itemHref = companyId ? item.href(companyId) : "";
                const isActive = Boolean(pathname && itemHref && (pathname === itemHref || pathname.startsWith(`${itemHref}/`)));
                const itemLabel = t(item.labelKey);

                return (
                  <NavLink
                    key={item.key}
                    label={itemLabel}
                    leftSection={
                      <ThemeIcon color={item.color}>
                        <item.icon size={14} />
                      </ThemeIcon>
                    }
                    rightSection={
                      <Group gap={4}>
                        {counts[item.key] !== undefined && (
                          <Badge
                            size="xs"
                            color={item.color}
                            px={6}
                            miw={30}
                            styles={{
                              label: {
                                fontVariantNumeric: "tabular-nums",
                              },
                            }}
                          >
                            {counts[item.key]}
                          </Badge>
                        )}
                      </Group>
                    }
                    onClick={() => {
                      if (!companyId) return;
                      void logClientInteraction({
                        companyId,
                        surface: "global-navigation",
                        interactionType: "PIPELINE_ROUTE_SELECT",
                        entityType: "ROUTE",
                        entityId: item.key,
                        payload: { href: itemHref, label: itemLabel },
                        teachingWeight: 30,
                      });
                      router.push(itemHref);
                    }}
                    active={isActive}
                    variant="subtle"
                    color={item.color}
                    styles={{
                      root: {
                        borderLeft: "2px solid transparent",
                        ...(isActive ? getSidebarActiveStyle(item.tone as ModuleTone) : {}),
                        ...(!isActive
                          ? {
                              "&:hover": getSidebarHoverStyle(item.tone as ModuleTone),
                            }
                          : {}),
                      },
                      label: {
                        color: isActive ? "var(--nav-link-active)" : "var(--nav-link-inactive)",
                        fontWeight: 500,
                      },
                    }}
                  />
                );
              })}
            </Stack>
          ) : (
            <Box px="md" py="xl">
              <MetaText ta="center">
                {t("nav.selectPortfolio")}
              </MetaText>
            </Box>
          )}
        </Stack>
      </AppShellSection>

      <AppShellSection pt="md">
        <Divider mb="md" />
        <Stack gap="xs">
          <UiLanguageSelect withDescription={false} size="xs" />

          <UnstyledButton
            onClick={() => {
              if (activeCompanyId) {
                void logClientInteraction({
                  companyId: activeCompanyId,
                  surface: "global-navigation",
                  interactionType: "THEME_TOGGLE",
                  entityType: "PREFERENCE",
                  entityId: "color-scheme",
                  payload: { nextMode: isDark ? "light" : "dark" },
                  teachingWeight: 30,
                });
              }
              toggle();
            }}
            p="xs"
            style={getSidebarButtonStyle()}
          >
              <Group justify="space-between">
                <Group gap="sm">
                  <ThemeIcon color={isDark ? "review" : "synthesis"} size="sm">
                    {isDark ? <Sun size={14} /> : <Moon size={14} />}
                  </ThemeIcon>
                <MetaText c="var(--text-secondary)">{isDark ? t("nav.themeLight") : t("nav.themeDark")}</MetaText>
              </Group>
            </Group>
          </UnstyledButton>

          {session ? (
            <Menu position="right-end" shadow="md" width={220} withArrow>
              <Menu.Target>
                <UnstyledButton
                  p="xs"
                  style={getSidebarButtonStyle()}
                >
                    <Group justify="space-between">
                      <Group gap="sm">
                        <Avatar src={session.picture} size="sm" color="ingress">
                          {session.name?.[0]}
                        </Avatar>
                        <Box flex={1} style={{ overflow: 'hidden' }}>
                          <LabelText truncate>{session.name}</LabelText>
                        </Box>
                      </Group>
                      <ChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>{t("nav.identity")}</Menu.Label>
                {company && (
                  <Menu.Item
                    leftSection={<SettingsIcon size={14} />}
                    onClick={() => router.push(`/${company.id}/settings`)}
                  >
                    {t("nav.organizationSettings")}
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item
                  color="review"
                  leftSection={<LogOut size={14} />}
                  onClick={handleLogout}
                >
                  {t("nav.terminateSession")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <Button
              variant="light"
              color="synthesis"
              size="xs"
              fullWidth
              onClick={() => router.push("/auth")}
              leftSection={<UserIcon size={14} />}
            >
              {t("nav.systemAccess")}
            </Button>
          )}
        </Stack>

        <Divider my="md" variant="dotted" />

        <Group gap="md" px="xs" justify="center">
          <Anchor href="/privacy" size="xs" c="dimmed" underline="never">
            {t("common.privacy")}
          </Anchor>
          <Anchor href="/terms" size="xs" c="dimmed" underline="never">
            {t("common.terms")}
          </Anchor>
          <MetaText>
            v{APP_VERSION}
          </MetaText>
        </Group>
      </AppShellSection>
    </AppShellNavbar>
  );
}
