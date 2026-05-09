'use client';

import {
  AppShellNavbar,
  AppShellSection,
  NavLink,
  Stack,
  Group,
  Box,
  Text,
  Avatar,
  Menu,
  ActionIcon,
  rem,
  Divider,
  UnstyledButton,
  ScrollArea,
  ThemeIcon,
  Badge,
  Button
} from "@mantine/core";
import { IconChevronRight as ChevronRight, IconSun as Sun, IconMoon as Moon, IconLogout as LogOut, IconUser as UserIcon, IconSettings as SettingsIcon, IconLayoutDashboard as LayoutDashboard, IconDatabase as Database, IconListCheck as ListCheck, IconCircleCheck as CheckCircle2, IconTarget as Target, IconSparkles as Sparkles, IconBolt as Zap, IconChevronDown as ChevronDown, IconHelmet as HardHat, IconLayersIntersect as Layers, IconHistory as History } from "@tabler/icons-react";
import { Logo } from "@/components/ui/logo";
import { useState, useEffect } from "react";
import { usePathname, useRouter, useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme-provider";
import { APP_VERSION } from "@/lib/release";
import { logClientInteraction } from "@/lib/client-events";
import { getSidebarActiveStyle, getSidebarHoverStyle, type ModuleTone } from "@/lib/semantic-theme";

const pipelineItems = [
  {
    key: "data",
    href: (companyId: string) => `/${companyId}/data`,
    label: "Data",
    icon: Database,
    color: "ingress",
    tone: "ingress",
  },
  {
    key: "topics",
    href: (companyId: string) => `/${companyId}/topics`,
    label: "Topics",
    icon: Layers,
    color: "synthesis",
    tone: "synthesis",
  },
  {
    key: "goals",
    href: (companyId: string) => `/${companyId}/goals`,
    label: "Goals",
    icon: Target,
    color: "strategy",
    tone: "strategy",
  },
  {
    key: "review",
    href: (companyId: string) => `/${companyId}/review`,
    label: "Review",
    icon: History,
    color: "review",
    tone: "review",
  },
  {
    key: "knowmore",
    href: (companyId: string) => `/${companyId}/knowmore`,
    label: "Knowmore",
    icon: Sparkles,
    color: "knowmore",
    tone: "knowmore",
  },
  {
    key: "tactical",
    href: (companyId: string) => `/${companyId}/tactical`,
    label: "Planning",
    icon: LayoutDashboard,
    color: "tactical",
    tone: "tactical",
  },
  {
    key: "nba",
    href: (companyId: string) => `/${companyId}/nba`,
    label: "Checklist",
    icon: ListCheck,
    color: "checklist",
    tone: "checklist",
  },
  {
    key: "pipeline",
    href: (companyId: string) => `/${companyId}/pipeline`,
    label: "Worker Queue",
    icon: HardHat,
    color: "review",
    tone: "review",
  },
];

export function ClientNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { company, setCompany } = useStore();
  const { isDark, toggle } = useTheme();
  const [session, setSession] = useState<any>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Pure URL-driven company ID
  const companyIdFromUrl = params?.companyId as string;

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSession(data));
  }, []);

  useEffect(() => {
    if (companyIdFromUrl && (!company || company.id !== companyIdFromUrl)) {
      // Synchronize store from URL in background
      fetch("/api/companies")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const found = data.find((c: any) => c.id === companyIdFromUrl);
            if (found) {
              setCompany(found);
            }
          }
        })
        .catch(err => console.error("Nav company sync failed:", err));
    }
  }, [company, companyIdFromUrl, setCompany]);

  useEffect(() => {
    const activeId = company?.id || companyIdFromUrl;
    if (!activeId) {
      const timer = window.setTimeout(() => {
        setCounts({});
      }, 0);

      return () => window.clearTimeout(timer);
    }

    const fetchCounts = async () => {
      try {
        const res = await fetch(`/api/companies/${activeId}/dashboard`);
        if (res.ok) {
          const data = await res.json();
          setCounts({
            data: data.counts?.sources || 0,
            topics: data.counts?.topics || 0,
            knowmore: data.counts?.flashcards || 0,
            goals: data.counts?.goals || 0,
            nba: data.counts?.checklistCount || 0,
            tactical: data.counts?.nbaItems || 0,
            review: data.counts?.reviewCount || 0,
            pipeline: data.counts?.pipelineJobs || 0,
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
  }, [company?.id, companyIdFromUrl]);

  const handleLogout = () => {
    window.location.href = "/api/auth/logout?returnTo=/login";
  };

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

  if (pathname === "/login" || pathname === "/auth" || pathname?.startsWith("/auth/")) {
    return null;
  }

  return (
    <AppShellNavbar p="md" style={{ borderRight: '1px solid var(--border-primary)', backgroundColor: 'var(--sidebar-bg)' }}>
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
                label={company?.name || "Intelligence Unit"}
                description={company?.id ? "Operating Unit" : "Synchronizing..."}
                variant="light"
                active={pathname === `/${company?.id || companyIdFromUrl}`}
                onClick={() => company?.id && router.push(`/${company.id}`)}
                styles={{
                  root: {
                    ...getSidebarActiveStyle("review"),
                  },
                  label: { color: "var(--nav-company-label)" },
                  description: { color: "var(--nav-company-description)" },
                }}
              />

              {pipelineItems.map((item) => (
                <NavLink
                  key={item.key}
                  label={item.label}
                  leftSection={
                    <ThemeIcon color={item.color}>
                      <item.icon size={14} />
                    </ThemeIcon>
                  }
                  rightSection={
                    <Group gap={4}>
                      {counts[item.key] !== undefined && (
                        <Badge size="xs" color={item.color} circle>
                          {counts[item.key]}
                        </Badge>
                      )}
                      <ChevronRight size={14} strokeOpacity={0.5} />
                    </Group>
                  }
                  onClick={() => {
                    const companyId = company?.id || companyIdFromUrl;
                    if (!companyId) return;
                    void logClientInteraction({
                      companyId,
                      surface: "global-navigation",
                      interactionType: "PIPELINE_ROUTE_SELECT",
                      entityType: "ROUTE",
                      entityId: item.key,
                      payload: { href: item.href(companyId), label: item.label },
                      teachingWeight: 30,
                    });
                    router.push(item.href(companyId));
                  }}
                  active={pathname.includes(item.key)}
                  variant="subtle"
                  color={item.color}
                  styles={{
                    root: {
                      backgroundColor: "transparent",
                      borderLeft: "2px solid transparent",
                      ...(pathname.includes(item.key) ? getSidebarActiveStyle(item.tone as ModuleTone) : {}),
                      ...(!pathname.includes(item.key)
                        ? {
                            "&:hover": getSidebarHoverStyle(item.tone as ModuleTone),
                          }
                        : {}),
                    },
                    label: {
                      color: pathname.includes(item.key) ? "var(--nav-link-active)" : "var(--nav-link-inactive)",
                      fontWeight: 500,
                    },
                  }}
                />
              ))}
            </Stack>
          ) : (
            <Box px="md" py="xl">
              <Text size="xs" c="dimmed" ta="center" fs="italic">
                Select a portfolio unit to begin operations.
              </Text>
            </Box>
          )}
        </Stack>
      </AppShellSection>

      <AppShellSection pt="md">
        <Divider mb="md" />
        <Stack gap="xs">
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
            style={{
              borderRadius: 'var(--mantine-radius-md)',
            }}
            className="theme-toggle-button"
          >
            <Group justify="space-between">
              <Group gap="sm">
                <ThemeIcon color={isDark ? "review" : "synthesis"} size="sm">
                  {isDark ? <Sun size={14} /> : <Moon size={14} />}
                </ThemeIcon>
                <Text size="xs" c="var(--text-secondary)">{isDark ? "Light" : "Dark"} Mode</Text>
              </Group>
            </Group>
          </UnstyledButton>

          {session ? (
            <Menu position="right-end" shadow="md" width={220} withArrow>
              <Menu.Target>
                <UnstyledButton
                  p="xs"
                  style={{
                    borderRadius: 'var(--mantine-radius-md)',
                  }}
                  className="user-profile-button"
                >
                  <Group justify="space-between">
                    <Group gap="sm">
                      <Avatar src={session.picture} size="sm" color="ingress">
                        {session.name?.[0]}
                      </Avatar>
                      <Box style={{ flex: 1, overflow: 'hidden' }}>
                        <Text size="xs" truncate>{session.name}</Text>
                      </Box>
                    </Group>
                    <ChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Identity</Menu.Label>
                {company && (
                  <Menu.Item
                    leftSection={<SettingsIcon size={14} />}
                    onClick={() => router.push(`/${company.id}/settings`)}
                  >
                    Organization Settings
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item
                  color="review"
                  leftSection={<LogOut size={14} />}
                  onClick={handleLogout}
                >
                  Terminate Session
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
              System Access
            </Button>
          )}
        </Stack>

        <Divider my="md" variant="dotted" />

        <Group gap="md" px="xs" justify="center">
          <Text
            component="a"
            href="/privacy"
            size="xs"
            c="dimmed"
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            PRIVACY
          </Text>
          <Text
            component="a"
            href="/terms"
            size="xs"
            c="dimmed"
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            TERMS
          </Text>
          <Text size="xs" c="dimmed">
            v{APP_VERSION}
          </Text>
        </Group>
      </AppShellSection>
    </AppShellNavbar>
  );
}
