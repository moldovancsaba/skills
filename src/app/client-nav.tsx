'use client';

import { AppShellNavbar, AppShellSection, NavLink, Stack, Group, Box, Avatar, Menu, rem, UnstyledButton, ScrollArea, ThemeIcon, Badge, Divider, Button, Anchor } from "@/components/gds/primitives";
import { IconActivity as Activity, IconActivityHeartbeat as ActivityHeartbeat, IconChevronRight as ChevronRight, IconSun as Sun, IconMoon as Moon, IconLogout as LogOut, IconUser as UserIcon, IconSettings as SettingsIcon, IconLayoutDashboard as LayoutDashboard, IconDatabase as Database, IconListCheck as ListCheck, IconTarget as Target, IconSparkles as Sparkles, IconChevronDown as ChevronDown, IconHelmet as HardHat, IconLayersIntersect as Layers, IconHistory as History, IconChartBar as ChartBar, IconBuilding as Building } from "@/components/gds/icons";
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
import { WEBAPP_SUMMARY_CLIENT_POLL_MS } from "@/lib/webapp-projection";
import { getWebappProfileLabel, getWebappRoute, UNIT_MODULE_DEFINITIONS } from "@/lib/intelligence-unit-capabilities";
import { resolveEnabledLegacyModules } from "@/lib/module-capability-utils";

const staticModuleNavItems: PipelineItem[] = [
  {
    key: "customer-operations",
    href: (companyId: string) => `/${companyId}/customer-operations`,
    label: "Customer Ops",
    icon: ActivityHeartbeat,
    color: "strategy",
    tone: "strategy",
  },
  {
    key: "unit-board",
    href: (companyId: string) => `/${companyId}/unit-board`,
    label: "Project Board",
    icon: Building,
    color: "review",
    tone: "review",
  },
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
    key: "sales",
    href: (companyId: string) => `/${companyId}/sales`,
    labelKey: "nav.sales",
    icon: Sparkles,
    color: "strategy",
    tone: "strategy",
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
    key: "analytics",
    href: (companyId: string) => `/${companyId}/analytics`,
    label: "Analytics",
    icon: ChartBar,
    color: "review",
    tone: "review",
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

type PipelineItem = {
  key: string;
  href: (companyId: string) => string;
  label?: string;
  labelKey?: string;
  icon: any;
  color: string;
  tone: ModuleTone | "neutral";
};

type ModuleCapabilityState = Record<string, boolean>;
type EffectiveBlockKey = "checklist" | "sales" | "project" | "miniapp";

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

type PortfolioUnit = {
  id: string;
  name: string;
  industries?: string[];
  metrics?: {
    data?: number;
    topics?: number;
    knowmore?: number;
    goals?: number;
    sales?: number;
    review?: number;
    checklist?: number;
    tactical?: number;
  };
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
  const [portfolioUnits, setPortfolioUnits] = useState<PortfolioUnit[]>([]);
  const [webappProfile, setWebappProfile] = useState<"NONE" | "CLASSSCOUT" | "COMPARE">("NONE");
  const [moduleCapabilities, setModuleCapabilities] = useState<ModuleCapabilityState>({});
  const [enabledBlocks, setEnabledBlocks] = useState<EffectiveBlockKey[]>([]);

  // Pure URL-driven company ID
  const companyIdFromUrl = params?.companyId as string;

  useEffect(() => {
    if (initialSession) return;
    fetch("/api/auth/session?scope=identity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSession(data));
  }, [initialSession]);

  useEffect(() => {
    if (pathname !== "/") return;

    const fetchPortfolioUnits = async () => {
      try {
        const res = await fetch("/api/companies");
        if (!res.ok) return;
        const data = await res.json();
        const units = Array.isArray(data) ? data : Array.isArray(data?.companies) ? data.companies : [];
        setPortfolioUnits(Array.isArray(units) ? units : []);
      } catch (err) {
        console.error("Failed to fetch portfolio units:", err);
      }
    };

    void fetchPortfolioUnits();

    const interval = window.setInterval(() => {
      void fetchPortfolioUnits();
    }, WEBAPP_SUMMARY_CLIENT_POLL_MS);

    return () => window.clearInterval(interval);
  }, [pathname]);

  useEffect(() => {
    const activeId = companyIdFromUrl || company?.id;
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
          if (data.webapp?.profile) {
            setWebappProfile(data.webapp.profile);
          }
          if (Array.isArray(data.webapp?.enabledBlocks)) {
            setEnabledBlocks(
              data.webapp.enabledBlocks.filter((value: unknown): value is EffectiveBlockKey =>
                value === "checklist" || value === "sales" || value === "project" || value === "miniapp",
              ),
            );
          }
          if (data.webapp?.modules && typeof data.webapp.modules === "object") {
            setModuleCapabilities(data.webapp.modules as ModuleCapabilityState);
          }
          if (Array.isArray(data.webapp?.enabledModules)) {
            const resolvedModules = resolveEnabledLegacyModules({
              enabledModules: data.webapp.enabledModules,
              enabledBlocks: data.webapp.enabledBlocks,
            });
            setModuleCapabilities(UNIT_MODULE_DEFINITIONS.reduce<ModuleCapabilityState>((acc, definition) => {
              acc[definition.key] = resolvedModules.includes(definition.key);
              return acc;
            }, {}));
          }
          const checklistCount = Number(data.counts?.checklist || 0);
          const planningCount = Number(data.counts?.tactical || 0);
          setCounts({
            data: data.counts?.data || 0,
            topics: data.counts?.topics || 0,
            knowmore: data.counts?.knowmore || 0,
            sales: data.counts?.sales || 0,
            goals: data.counts?.goals || 0,
            analytics: data.counts?.analytics || 0,
            checklist: checklistCount,
            tactical: planningCount,
            review: data.counts?.review || 0,
            pipeline: data.counts?.pipeline || 0,
            classscout: data.counts?.classscout || 0,
            compare: data.counts?.compare || 0,
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
    }, WEBAPP_SUMMARY_CLIENT_POLL_MS);

    return () => clearInterval(interval);
  }, [company, company?.id, company?.name, companyIdFromUrl, setCompany]);

  const handleLogout = () => {
    window.location.href = "/api/auth/logout?returnTo=/login";
  };

  const navCompany = resolvedCompany?.id === companyIdFromUrl
    ? resolvedCompany
    : (company?.id === companyIdFromUrl ? company : resolvedCompany || company);
  const activeCompanyId = companyIdFromUrl || company?.id;

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

      <AppShellSection component={ScrollArea} grow mx="-md" px="md" scrollbars="y" type="scroll">
        <Stack gap="xs">
          {/* Global portfolio and intelligence unit divider removed per user request */}

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

              {(() => {
                const webappRoute = getWebappRoute(webappProfile);
                const items: PipelineItem[] = [];
                const canShowMiniappOps = enabledBlocks.length === 0 || enabledBlocks.includes("miniapp");
                const routeByProfile = webappRoute
                  ? ({
                      key: webappProfile === "CLASSSCOUT" ? "classscout" : webappProfile === "COMPARE" ? "compare" : "webapp",
                      href: (companyId: string) => `/${companyId}/${webappRoute}`,
                      label: getWebappProfileLabel(webappProfile),
                      icon: Activity,
                      color: "review",
                      tone: "review",
                    } as PipelineItem)
                  : null;

                if (routeByProfile && canShowMiniappOps) {
                  items.push(routeByProfile);
                }

                for (const item of staticModuleNavItems) {
                  if (moduleCapabilities[item.key] === false) {
                    continue;
                  }
                  const definition = UNIT_MODULE_DEFINITIONS.find((moduleDefinition) => moduleDefinition.key === item.key);
                  if (item.key !== "customer-operations" && !definition?.route) {
                    continue;
                  }
                  items.push(item);
                }

                return items.map((item) => {
                  const companyId = companyIdFromUrl || company?.id;
                  const itemHref = companyId ? item.href(companyId) : "";
                  const itemHrefBase = itemHref.split("?")[0];
                  const isActive = Boolean(
                    pathname && itemHrefBase && (pathname === itemHrefBase || pathname.startsWith(`${itemHrefBase}/`))
                  );
                  const itemLabel = "labelKey" in item && item.labelKey ? t(item.labelKey) : item.label;

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
                });
              })()}
            </Stack>
          ) : pathname === "/" ? (
            <Stack gap="sm">
              <Box px="md" py="xs">
                <MetaText ta="center">
                  {t("nav.selectPortfolio")}
                </MetaText>
              </Box>

              {portfolioUnits.map((unit) => {
                const tacticalCount = Number(unit.metrics?.tactical ?? 0);
                const summaryCount = tacticalCount || Number(unit.metrics?.sales ?? 0) || Number(unit.metrics?.data ?? 0);

                return (
                  <NavLink
                    key={unit.id}
                    label={unit.name}
                    description={unit.industries?.slice(0, 2).join(" · ") || t("nav.companyDescription")}
                    leftSection={
                      <ThemeIcon color="review">
                        <Building size={14} />
                      </ThemeIcon>
                    }
                    rightSection={summaryCount > 0 ? <Badge size="xs" color="review">{summaryCount}</Badge> : undefined}
                    variant="light"
                    onClick={() => {
                      setCompany({
                        id: unit.id,
                        name: unit.name,
                        industry: null,
                        description: null,
                        targetMarket: null,
                        mainGoal: null,
                      });
                      router.push(`/${unit.id}`);
                    }}
                    styles={{
                      root: {
                        borderLeft: "2px solid transparent",
                        ...getSidebarButtonStyle(),
                      },
                      label: { color: "var(--nav-link-inactive)", fontWeight: 500 },
                      description: { color: "var(--nav-company-description)" },
                    }}
                  />
                );
              })}

              {portfolioUnits.length === 0 ? (
                <Box px="md" py="xl">
                  <MetaText ta="center">
                    {t("home.noUnitsDescription")}
                  </MetaText>
                </Box>
              ) : null}
            </Stack>
          ) : (
            <Box px="md" py="xl">
              <MetaText ta="center">
                {t("nav.selectPortfolio")}
              </MetaText>
            </Box>
          )}

          <Divider my="md" />
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
                        <Box flex={1} style={{ overflow: "hidden" }}>
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

          <Group gap="md" px="xs" pb="xs" justify="center">
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
        </Stack>
      </AppShellSection>
    </AppShellNavbar>
  );
}
