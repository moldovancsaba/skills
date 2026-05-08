"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { IconBell as Bell, IconShieldCheck as ShieldCheck, IconKey as Key, IconSettings as SettingsIcon, IconCopy as Copy, IconRefresh as RefreshCcw, IconEye as Eye, IconEyeOff as EyeOff, IconMessage2 as MessageSquare, IconMail as Mail, IconDeviceMobile as Smartphone, IconWebhook as Webhook, IconGlobe as Globe, IconLanguage as Languages } from "@tabler/icons-react";
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
import { getSemanticSurfaceStyle } from "@/lib/semantic-theme";

type CommunicationSettings = {
  isEnabled: boolean;
  channel: string;
  handle: string;
  minIceScore: number;
  bridgeSecret: string;
  bridgeSecretConfigured: boolean;
  bridgeSecretStoredHashed: boolean;
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
    if (!companyId) return;

    void (async () => {
      await fetchSettings();
    })();
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
    if (!text) return;
    navigator.clipboard.writeText(text);
    notifications.show({ title: "Copied", message: "Copied to clipboard." });
  };

  if (loading) return <Box p="xl" ta="center"><Text>Loading OS configuration...</Text></Box>;
  if (!settings) return <Box p="xl" ta="center"><Text c="red">Error: Settings context not found.</Text></Box>;

  const bridgeSecretDisplay = settings.bridgeSecret
    ? showSecret
      ? settings.bridgeSecret
      : "•".repeat(Math.max(settings.bridgeSecret.length, 24))
    : settings.bridgeSecretConfigured
      ? "Stored securely. Regenerate to reveal a new Bridge API key."
      : "No Bridge API key generated yet.";

  return (
    <PageShell width="lg">

      <Stack gap="xl">
        {/* Global Alerting Control */}
        <Card style={getSemanticSurfaceStyle("review")}>
          <Group justify="space-between">
            <Stack gap={4}>
              <Group gap="sm">
                <ThemeIcon color="review">
                  <Bell size={18} />
                </ThemeIcon>
                <Title order={3}>Alerting Layer</Title>
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
        <Card style={getSemanticSurfaceStyle("synthesis")}>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Group gap="sm">
                  <ThemeIcon color="synthesis">
                    <Languages size={18} />
                  </ThemeIcon>
                  <Title order={3}>Language Management</Title>
                </Group>
                <Text size="sm" c="dimmed">Define which languages the AI is allowed to use for intelligence synthesis.</Text>
              </Stack>
              <Badge color="synthesis" size="sm">
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
                color="synthesis"
                onClick={() => saveCompanySettings({ allowedLanguages: companySettings?.allowedLanguages })}
                disabled={saving || !companySettings}
                loading={saving}
              >
                Apply Language Policy
              </Button>
            </Group>

            <Box p="md" style={{ borderRadius: "var(--mantine-radius-md)", ...getSemanticSurfaceStyle("synthesis", { elevated: false }) }}>
              <Text size="xs" c="dimmed" mb="xs">Policy Enforcement</Text>
              <Text size="xs" c="dimmed">
                AI agents will strictly use only these permitted languages for flashcards and taskcards. 
                checklist Purity Check: Any content detected in a disallowed language or containing mixed-language structures will be deleted immediately during synthesis.
              </Text>
            </Box>
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* Channel Configuration */}
          <Card style={getSemanticSurfaceStyle("ingress")}>
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon color="ingress">
                  <Smartphone size={18} />
                </ThemeIcon>
                <Title order={3}>Notification Channel</Title>
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
          <Card style={getSemanticSurfaceStyle("review")}>
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon color="review">
                  <ShieldCheck size={18} />
                </ThemeIcon>
                <Title order={3}>Sensitivity & Priority</Title>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text>Minimum ICE Score</Text>
                  <Text c="review">{settings.minIceScore}</Text>
                </Group>
                <Slider 
                  value={settings.minIceScore} 
                  min={0} 
                  max={1000} 
                  step={10} 
                  onChange={(val) => setSettings({ ...settings, minIceScore: val })}
                  onChangeEnd={(val) => saveSettings({ minIceScore: val })}
                  disabled={saving}
                  color="review"
                />
                <Text size="xs" c="dimmed">
                  Higher score = Fewer, higher-quality notifications.
                </Text>
              </Stack>
            </Stack>
          </Card>
        </SimpleGrid>

        {/* Two-Way Bridge Security */}
        <Card style={getSemanticSurfaceStyle("tactical")}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon color="tactical">
                <Key size={18} />
              </ThemeIcon>
              <Title order={3}>Communication Bridge API</Title>
            </Group>
            <Text size="sm" c="dimmed">Use this key to send data into checklist memory from external scripts.</Text>
            
            <Box p="md" style={{ borderRadius: "var(--mantine-radius-md)", ...getSemanticSurfaceStyle("tactical", { elevated: false }) }}>
              <Group justify="space-between">
                <Text  size="sm" style={{ wordBreak: "break-all" }}>
                  {bridgeSecretDisplay}
                </Text>
                <Group gap="xs">
                  <ActionIcon variant="subtle" color="tactical" onClick={() => setShowSecret(!showSecret)} disabled={!settings.bridgeSecret}>
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="tactical" onClick={() => copyToClipboard(settings.bridgeSecret)} disabled={!settings.bridgeSecret}>
                    <Copy size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="tactical" onClick={regenerateSecret} loading={saving}>
                    <RefreshCcw size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Box>
            <Text size="xs" c="dimmed">
              Newly generated keys are shown once, then stored hashed at rest. Use the `x-company-id`, `x-bridge-secret`, and `x-bridge-timestamp` headers when posting into the bridge.
            </Text>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Endpoint</Text>
                <Box p="xs" style={{ borderRadius: "var(--mantine-radius-sm)", ...getSemanticSurfaceStyle("tactical", { elevated: false }) }}>
                  <Text  size="xs">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/bridge/ingress
                  </Text>
                </Box>
              </Stack>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Example Request</Text>
                <Box p="xs" style={{ borderRadius: "var(--mantine-radius-sm)", ...getSemanticSurfaceStyle("tactical", { elevated: false }) }}>
                  <Text  size="xs">
                    {`POST /api/bridge/ingress + headers: x-company-id, x-bridge-secret, x-bridge-timestamp`}
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
