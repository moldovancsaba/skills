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
import {
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  User as UserIcon,
  Settings as SettingsIcon,
  LayoutDashboard,
  Database,
  ListTodo,
  CheckCircle2,
  Target,
  Sparkles,
  Zap,
  ChevronDown,
  HardHat
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { useState, useEffect } from "react";
import { usePathname, useRouter, useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme-provider";
import { APP_VERSION } from "@/lib/release";

const pipelineItems = [
  {
    key: "data",
    href: (companyId: string) => `/${companyId}/data`,
    label: "Data Ingress",
    icon: Database,
    color: "blue",
  },
  {
    key: "topics",
    href: (companyId: string) => `/${companyId}/topics`,
    label: "Topic Synthesis",
    icon: ListTodo,
    color: "indigo",
  },
  {
    key: "knowmore",
    href: (companyId: string) => `/${companyId}/knowmore`,
    label: "Knowmore",
    icon: Sparkles,
    color: "teal",
  },
  {
    key: "goals",
    href: (companyId: string) => `/${companyId}/goals`,
    label: "Strategic Goals",
    icon: Target,
    color: "violet",
  },
  {
    key: "nba",
    href: (companyId: string) => `/${companyId}/nba`,
    label: "Checklist",
    icon: ListTodo,
    color: "blue",
  },
  {
    key: "tactical",
    href: (companyId: string) => `/${companyId}/tactical`,
    label: "Tactical Board",
    icon: LayoutDashboard,
    color: "cyan",
  },
  {
    key: "review",
    href: (companyId: string) => `/${companyId}/review`,
    label: "Review Gateway",
    icon: HardHat,
    color: "orange",
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
  }, [companyIdFromUrl, company?.id, setCompany]);

  useEffect(() => {
    const activeId = company?.id || companyIdFromUrl;
    if (!activeId) {
      setCounts({});
      return;
    }

    const fetchCounts = async () => {
      try {
        const res = await fetch(`/api/companies/${activeId}/dashboard`);
        if (res.ok) {
          const data = await res.json();
          setCounts({
            data: (data.sources?.length || 0) + (data.counts?.files || 0),
            topics: data.counts?.topics || 0,
            knowmore: data.counts?.flashcards || 0,
            goals: data.counts?.goals || 0,
            nba: data.counts?.checklistCount || 0,
            tactical: data.counts?.nbaItems || 0,
            review: data.counts?.reviewCount || 0
          });
        }
      } catch (err) {
        console.error("Failed to fetch nav counts:", err);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000); // Sync every 30s
    return () => clearInterval(interval);
  }, [company?.id, companyIdFromUrl]);

  const handleLogout = () => {
    window.location.href = "/api/auth/logout?returnTo=/login";
  };

  if (pathname === "/login" || pathname === "/auth" || pathname?.startsWith("/auth/")) {
    return null;
  }

  return (
    <AppShellNavbar p="md" style={{ borderRight: '1px solid var(--mantine-color-default-border)', backgroundColor: 'var(--mantine-color-body)' }}>
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
                  root: { borderRadius: 'var(--mantine-radius-md)', marginBottom: rem(8) },
                  label: { fontWeight: 900 }
                }}
              />

              {pipelineItems.map((item) => (
                <NavLink
                  key={item.key}
                  label={item.label}
                  leftSection={
                    <ThemeIcon color={item.color} variant="light" size="sm" radius="sm">
                      <item.icon size={14} />
                    </ThemeIcon>
                  }
                  rightSection={
                    <Group gap={4}>
                      {counts[item.key] !== undefined && (
                        <Badge size="xs" variant="light" color={item.color} circle fw={900}>
                          {counts[item.key]}
                        </Badge>
                      )}
                      <ChevronRight size={14} strokeOpacity={0.5} />
                    </Group>
                  }
                  onClick={() => (company?.id || companyIdFromUrl) && router.push(item.href(company?.id || companyIdFromUrl!))}
                  active={pathname.includes(item.key)}
                  variant="subtle"
                  color={item.color}
                  styles={{
                    root: { borderRadius: 'var(--mantine-radius-md)' },
                    label: { fontWeight: 700, fontSize: rem(13) }
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
            onClick={toggle}
            p="xs"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              transition: 'background-color 0.2s ease',
            }}
            className="theme-toggle-button"
          >
            <Group justify="space-between">
              <Group gap="sm">
                <ThemeIcon variant="light" color={isDark ? "yellow" : "indigo"} size="sm">
                  {isDark ? <Sun size={14} /> : <Moon size={14} />}
                </ThemeIcon>
                <Text size="xs" fw={700}>{isDark ? "Light" : "Dark"} Mode</Text>
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
                      <Avatar src={session.picture} radius="xl" size="sm" color="brand">
                        {session.name?.[0]}
                      </Avatar>
                      <Box style={{ flex: 1, overflow: 'hidden' }}>
                        <Text size="xs" fw={900} truncate>{session.name}</Text>
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
                  color="red"
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
              color="indigo"
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
            size="10px"
            c="dimmed"
            fw={700}
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            PRIVACY
          </Text>
          <Text
            component="a"
            href="/terms"
            size="10px"
            c="dimmed"
            fw={700}
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            TERMS
          </Text>
          <Text size="10px" c="dimmed" fw={700} tt="uppercase">
            v{APP_VERSION}
          </Text>
        </Group>
      </AppShellSection>
    </AppShellNavbar>
  );
}
