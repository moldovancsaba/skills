"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Bell, 
  ShieldCheck, 
  Key, 
  Settings as SettingsIcon, 
  Copy, 
  RefreshCcw, 
  Eye, 
  EyeOff,
  MessageSquare,
  Mail,
  Smartphone,
  Webhook,
  Globe,
  Languages
} from "lucide-react";
import { 
  Card, 
  Text, 
  Title, 
  Switch, 
  Slider, 
  Button, 
  TextInput, 
  Select, 
  Group, 
  Stack, 
  Badge, 
  Divider, 
  ActionIcon, 
  Tooltip, 
  ThemeIcon,
  Box,
  SimpleGrid
} from "@mantine/core";
import { PageHeader, PageShell } from "@/components/ui/app-shell";
import { LanguageSelector } from "@/components/LanguageSelector";
import { notifications } from "@mantine/notifications";

type CommunicationSettings = {
  isEnabled: boolean;
  channel: string;
  handle: string;
  minIceScore: number;
  bridgeSecret: string;
};

type CompanySettings = {
  id: string;
  name: string;
  allowedLanguages: string[];
};

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;

  const [settings, setSettings] = useState<CommunicationSettings | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const [commRes, companyRes] = await Promise.all([
        fetch(`/api/communication/settings?companyId=${companyId}`),
        fetch(`/api/companies/${companyId}/settings`)
      ]);
      
      if (commRes.ok) {
        setSettings(await commRes.json());
      }
      if (companyRes.ok) {
        setCompanySettings(await companyRes.json());
      }
    } catch (error) {
      console.error("Failed to load settings", error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) fetchSettings();
  }, [companyId, fetchSettings]);

  const saveSettings = async (updates: Partial<CommunicationSettings>) => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/communication/settings?companyId=${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, ...updates }),
      });
      if (res.ok) {
        setSettings(await res.json());
        notifications.show({ title: "Settings saved", message: "Communication preferences updated successfully." });
      }
    } catch (error) {
      notifications.show({ title: "Error", message: "Failed to save settings.", color: "red" });
    } finally {
      setSaving(false);
    }
  };

  const saveCompanySettings = async (updates: Partial<CompanySettings>) => {
    if (!companySettings) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...companySettings, ...updates }),
      });
      if (res.ok) {
        setCompanySettings(await res.json());
        notifications.show({ title: "Organization saved", message: "Language and organization settings updated." });
      }
    } catch (error) {
      notifications.show({ title: "Error", message: "Failed to save organization settings.", color: "red" });
    } finally {
      setSaving(false);
    }
  };

  const regenerateSecret = async () => {
    if (!confirm("Regenerating the secret will break existing bridge integrations. Continue?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/communication/settings?companyId=${companyId}&action=regenerate-secret`, {
        method: "POST",
      });
      if (res.ok) {
        setSettings(await res.json());
        notifications.show({ title: "Secret regenerated", message: "A new Bridge API Key has been issued." });
      }
    } catch (error) {
      notifications.show({ title: "Error", message: "Failed to regenerate secret.", color: "red" });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    notifications.show({ title: "Copied", message: "Copied to clipboard." });
  };

  if (loading) return <Box p="xl" ta="center"><Text>Loading OS configuration...</Text></Box>;
  if (!settings) return <Box p="xl" ta="center"><Text c="red">Error: Settings context not found.</Text></Box>;

  return (
    <PageShell width="lg">

      <Stack gap="xl">
        {/* Global Alerting Control */}
        <Card p="xl" radius="md" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}>
          <Group justify="space-between">
            <Stack gap={4}>
              <Group gap="sm">
                <ThemeIcon variant="light" color="brand" size="md">
                  <Bell size={18} />
                </ThemeIcon>
                <Title order={3} size="h4">Alerting Layer</Title>
              </Group>
              <Text size="sm" c="dimmed">Enable or disable automated AI discoveries and task alerts.</Text>
            </Stack>
            <Switch 
              size="lg"
              checked={settings.isEnabled} 
              onChange={(e) => saveSettings({ isEnabled: e.currentTarget.checked })}
              disabled={saving}
            />
          </Group>
        </Card>

        {/* Organization Settings */}
        <Card p="xl" radius="md" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Group gap="sm">
                  <ThemeIcon variant="light" color="brand" size="md">
                    <Languages size={18} />
                  </ThemeIcon>
                  <Title order={3} size="h4">Language Management</Title>
                </Group>
                <Text size="sm" c="dimmed">Define which languages the AI is allowed to use for intelligence synthesis.</Text>
              </Stack>
              <Badge variant="light" color="brand" size="sm">
                {companySettings?.allowedLanguages.length || 0} Enabled
              </Badge>
            </Group>

            <LanguageSelector 
              selectedIds={companySettings?.allowedLanguages || []}
              onChange={(ids) => {
                if (companySettings) {
                  setCompanySettings({ ...companySettings, allowedLanguages: ids });
                }
              }}
              disabled={saving}
            />

            <Group justify="flex-end">
              <Button 
                color="brand"
                onClick={() => saveCompanySettings({ allowedLanguages: companySettings?.allowedLanguages })}
                disabled={saving || !companySettings}
                loading={saving}
              >
                Apply Language Policy
              </Button>
            </Group>

            <Box p="md" style={{ borderRadius: "var(--mantine-radius-md)", backgroundColor: 'light-dark(rgba(0,0,0,0.03), rgba(0,0,0,0.2))', border: '1px solid light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05))' }}>
              <Text size="xs" fw={800} tt="uppercase" lts={1} c="dimmed" mb="xs">Policy Enforcement</Text>
              <Text size="xs" c="dimmed" lh={1.6}>
                AI agents will strictly use only these permitted languages for flashcards and taskcards. 
                checklist Purity Check: Any content detected in a disallowed language or containing mixed-language structures will be deleted immediately during synthesis.
              </Text>
            </Box>
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* Channel Configuration */}
          <Card p="xl" radius="md" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}>
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon variant="light" color="gray" size="md">
                  <Smartphone size={18} />
                </ThemeIcon>
                <Title order={3} size="h5">Notification Channel</Title>
              </Group>
              <Select 
                label="Channel"
                value={settings.channel} 
                onChange={(val) => saveSettings({ channel: val || "EMAIL" })}
                disabled={saving}
                data={[
                  { value: "IMESSAGE", label: "iMessage" },
                  { value: "WHATSAPP", label: "WhatsApp" },
                  { value: "EMAIL", label: "Email" },
                  { value: "WEBHOOK", label: "Webhook" },
                ]}
              />
              <TextInput 
                label="Contact Handle / URL"
                value={settings.handle || ""} 
                onChange={(e) => setSettings({ ...settings, handle: e.currentTarget.value })}
                placeholder={settings.channel === 'EMAIL' ? 'email@example.com' : '+123456789'}
                rightSection={
                  <Button variant="subtle" size="xs" onClick={() => saveSettings({ handle: settings.handle })}>Save</Button>
                }
                rightSectionWidth={60}
              />
            </Stack>
          </Card>

          {/* Threshold Configuration */}
          <Card p="xl" radius="md" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}>
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon variant="light" color="gray" size="md">
                  <ShieldCheck size={18} />
                </ThemeIcon>
                <Title order={3} size="h5">Sensitivity & Priority</Title>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={700}>Minimum ICE Score</Text>
                  <Text size="sm" ff="monospace" c="brand" fw={900}>{settings.minIceScore}</Text>
                </Group>
                <Slider 
                  value={settings.minIceScore} 
                  min={0} 
                  max={1000} 
                  step={10} 
                  onChange={(val) => setSettings({ ...settings, minIceScore: val })}
                  onChangeEnd={(val) => saveSettings({ minIceScore: val })}
                  disabled={saving}
                  color="brand"
                />
                <Text size="xs" c="dimmed" tt="uppercase" lts={1}>
                  Higher score = Fewer, higher-quality notifications.
                </Text>
              </Stack>
            </Stack>
          </Card>
        </SimpleGrid>

        {/* Two-Way Bridge Security */}
        <Card p="xl" radius="md" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon variant="light" color="gray" size="md">
                <Key size={18} />
              </ThemeIcon>
              <Title order={3} size="h5">Communication Bridge API</Title>
            </Group>
            <Text size="sm" c="dimmed">Use this key to send data into checklist memory from external scripts.</Text>
            
            <Box p="md" style={{ borderRadius: "var(--mantine-radius-md)", backgroundColor: 'light-dark(rgba(0,0,0,0.03), rgba(0,0,0,0.2))', border: '1px solid light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05))' }}>
              <Group justify="space-between">
                <Text ff="monospace" size="sm" style={{ wordBreak: "break-all" }}>
                  {showSecret ? settings.bridgeSecret : "•".repeat(36)}
                </Text>
                <Group gap="xs">
                  <ActionIcon variant="subtle" color="gray" onClick={() => setShowSecret(!showSecret)}>
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="gray" onClick={() => copyToClipboard(settings.bridgeSecret)}>
                    <Copy size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="gray" onClick={regenerateSecret} loading={saving}>
                    <RefreshCcw size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Box>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Stack gap={4}>
                <Text size="xs" fw={800} tt="uppercase" lts={1} c="dimmed">Endpoint</Text>
                <Box p="xs" style={{ borderRadius: "var(--mantine-radius-sm)", backgroundColor: "rgba(0,0,0,0.1)", border: "1px solid rgba(255,255,255,0.03)" }}>
                  <Text ff="monospace" size="xs">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/bridge/ingress
                  </Text>
                </Box>
              </Stack>
              <Stack gap={4}>
                <Text size="xs" fw={800} tt="uppercase" lts={1} c="dimmed">Example Payload</Text>
                <Box p="xs" style={{ borderRadius: "var(--mantine-radius-sm)", backgroundColor: "rgba(0,0,0,0.1)", border: "1px solid rgba(255,255,255,0.03)" }}>
                  <Text ff="monospace" size="xs">
                    {`{ "secret": "...", "sender": "+123", "text": "New insight..." }`}
                  </Text>
                </Box>
              </Stack>
            </SimpleGrid>
          </Stack>
        </Card>
      </Stack>
    </PageShell>
  );
}
