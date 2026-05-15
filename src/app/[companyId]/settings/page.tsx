"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { IconBell as Bell, IconShieldCheck as ShieldCheck, IconKey as Key, IconSettings as SettingsIcon, IconCopy as Copy, IconRefresh as RefreshCcw, IconEye as Eye, IconEyeOff as EyeOff, IconMessage2 as MessageSquare, IconMail as Mail, IconDeviceMobile as Smartphone, IconWebhook as Webhook, IconGlobe as Globe, IconLanguage as Languages } from "@tabler/icons-react";
import { 
  Switch, Slider, Button, TextInput, Select, Group, Stack, Badge, Divider, ActionIcon, Tooltip, ThemeIcon, Box, SimpleGrid } from "@mantine/core";
import { PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardSection } from "@/components/ui/unified-card";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { LanguageSelector } from "@/components/LanguageSelector";
import { notifications } from "@mantine/notifications";
import { UiLanguageSelect } from "@/components/ui-language-select";
import { useI18n } from "@/lib/ui-i18n";

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
  const { t } = useI18n();

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
        notifications.show({ title: t("settings.saved"), message: t("settings.communicationUpdated") });
      }
    } catch (error) {
      notifications.show({ title: t("common.error"), message: t("settings.saveFailed"), color: "review" });
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
        notifications.show({ title: t("settings.organizationSaved"), message: t("settings.organizationUpdated") });
      }
    } catch (error) {
      notifications.show({ title: t("common.error"), message: t("settings.organizationSaveFailed"), color: "review" });
    } finally {
      setSaving(false);
    }
  };

  const regenerateSecret = async () => {
    if (!confirm(t("settings.regenerateConfirm"))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/communication/settings?companyId=${companyId}&action=regenerate-secret`, {
        method: "POST",
      });
      if (res.ok) {
        setSettings(await res.json());
        notifications.show({ title: t("settings.secretRegenerated"), message: t("settings.secretIssued") });
      }
    } catch (error) {
      notifications.show({ title: t("common.error"), message: t("settings.regenerateFailed"), color: "review" });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    notifications.show({ title: t("common.copied"), message: t("settings.copied") });
  };

  if (loading) return <Box p="xl" ta="center"><Text>{t("settings.loading")}</Text></Box>;
  if (!settings) return <Box p="xl" ta="center"><Text c="review">{t("settings.missing")}</Text></Box>;

  const bridgeSecretDisplay = settings.bridgeSecret
    ? showSecret
      ? settings.bridgeSecret
      : "•".repeat(Math.max(settings.bridgeSecret.length, 24))
    : settings.bridgeSecretConfigured
      ? t("settings.bridgeSecretStored")
      : t("settings.bridgeSecretMissing");

  return (
    <PageShell width="lg">

      <Stack gap="xl">
        <UnifiedCard tone="ingress">
          <UnifiedCardBody>
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon color="ingress">
                  <Globe size={18} />
                </ThemeIcon>
                <SectionTitle>{t("settings.uiLanguageTitle")}</SectionTitle>
              </Group>
              <BodyText>{t("settings.uiLanguageDescription")}</BodyText>
              <UiLanguageSelect />
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        {/* Global Alerting Control */}
        <UnifiedCard tone="review">
          <UnifiedCardBody>
          <Group justify="space-between">
            <Stack gap={4}>
                <Group gap="sm">
                  <ThemeIcon color="review">
                    <Bell size={18} />
                  </ThemeIcon>
                <SectionTitle>{t("settings.alertingLayer")}</SectionTitle>
              </Group>
              <BodyText>{t("settings.alertingDescription")}</BodyText>
            </Stack>
            <Switch 
              size="lg"
              checked={settings.isEnabled} 
              onChange={(e) => saveSettings({ isEnabled: e.currentTarget.checked })}
              disabled={saving}
            />
          </Group>
          </UnifiedCardBody>
        </UnifiedCard>

        {/* Organization Settings */}
        <UnifiedCard tone="synthesis">
          <UnifiedCardBody>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Group gap="sm">
                  <ThemeIcon color="synthesis">
                    <Languages size={18} />
                  </ThemeIcon>
                  <SectionTitle>{t("settings.languageManagement")}</SectionTitle>
                </Group>
                <BodyText>{t("settings.languageDescription")}</BodyText>
              </Stack>
              <Badge color="synthesis" size="sm">
                {t("settings.enabledCount", { count: companySettings?.allowedLanguages.length || 0 })}
              </Badge>
            </Group>

            <UnifiedCardSection tone="synthesis">
              <MetaText mb="xs">{t("settings.languagePolicyOnly")}</MetaText>
              <MetaText>{t("settings.languagePolicyHelper")}</MetaText>
            </UnifiedCardSection>

            <LanguageSelector 
              selectedIds={companySettings?.allowedLanguages || []}
              label={t("settings.permittedLanguages")}
              placeholder={t("settings.permittedLanguagesPlaceholder")}
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
                {t("settings.applyLanguagePolicy")}
              </Button>
            </Group>

            <UnifiedCardSection tone="synthesis">
              <MetaText mb="xs">{t("settings.policyEnforcement")}</MetaText>
              <MetaText>
                {t("settings.policyDetails")}
              </MetaText>
            </UnifiedCardSection>
          </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* Channel Configuration */}
          <UnifiedCard tone="ingress">
            <UnifiedCardBody>
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon color="ingress">
                  <Smartphone size={18} />
                </ThemeIcon>
                <SectionTitle>{t("settings.notificationChannel")}</SectionTitle>
              </Group>
              <Select 
                label={t("settings.channel")}
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
                label={t("settings.contactHandle")}
                value={settings.handle || ""} 
                onChange={(e) => setSettings({ ...settings, handle: e.currentTarget.value })}
                placeholder={settings.channel === 'EMAIL' ? 'email@example.com' : '+123456789'}
                rightSection={
                  <Button variant="subtle" size="xs" onClick={() => saveSettings({ handle: settings.handle })}>{t("common.save")}</Button>
                }
                rightSectionWidth={60}
              />
            </Stack>
            </UnifiedCardBody>
          </UnifiedCard>

          {/* Threshold Configuration */}
          <UnifiedCard tone="review">
            <UnifiedCardBody>
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon color="review">
                  <ShieldCheck size={18} />
                </ThemeIcon>
                <SectionTitle>{t("settings.sensitivityPriority")}</SectionTitle>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text>{t("settings.minimumIceScore")}</Text>
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
                <MetaText>{t("settings.higherScore")}</MetaText>
              </Stack>
            </Stack>
            </UnifiedCardBody>
          </UnifiedCard>
        </SimpleGrid>

        {/* Two-Way Bridge Security */}
        <UnifiedCard tone="tactical">
          <UnifiedCardBody>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon color="tactical">
                <Key size={18} />
              </ThemeIcon>
              <SectionTitle>{t("settings.bridgeApi")}</SectionTitle>
            </Group>
            <BodyText>{t("settings.bridgeDescription")}</BodyText>
            
            <UnifiedCardSection tone="tactical">
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
            </UnifiedCardSection>
            <MetaText>
              {t("settings.bridgeSecretDetails")}
            </MetaText>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Stack gap={4}>
                <MetaText>{t("settings.bridgeEndpoint")}</MetaText>
                <UnifiedCardSection tone="tactical">
                  <MetaText c="var(--text-primary)">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/bridge/ingress
                  </MetaText>
                </UnifiedCardSection>
              </Stack>
              <Stack gap={4}>
                <MetaText>{t("settings.bridgeExampleRequest")}</MetaText>
                <UnifiedCardSection tone="tactical">
                  <MetaText c="var(--text-primary)">
                    {`POST /api/bridge/ingress + headers: x-company-id, x-bridge-secret, x-bridge-timestamp`}
                  </MetaText>
                </UnifiedCardSection>
              </Stack>
            </SimpleGrid>
          </Stack>
          </UnifiedCardBody>
        </UnifiedCard>
      </Stack>
    </PageShell>
  );
}
