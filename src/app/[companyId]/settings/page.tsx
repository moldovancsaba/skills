"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { IconBell as Bell, IconShieldCheck as ShieldCheck, IconKey as Key, IconSettings as SettingsIcon, IconCopy as Copy, IconRefresh as RefreshCcw, IconEye as Eye, IconEyeOff as EyeOff, IconDeviceMobile as Smartphone, IconGlobe as Globe, IconLanguage as Languages, IconTrash as Trash, IconBuilding as Building } from "@/components/gds/icons";
import { 
  Switch, Slider, Button, TextInput, Select, Group, Stack, Badge, ActionIcon, ThemeIcon, Box, SimpleGrid, NumberInput } from "@/components/gds/primitives";
import { PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardSection } from "@/components/ui/unified-card";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { LanguageSelector } from "@/components/LanguageSelector";
import { notifications } from "@/components/gds/notifications";
import { UiLanguageSelect } from "@/components/ui-language-select";
import { useI18n } from "@/lib/ui-i18n";
import {
  BLOCK_DEFINITIONS,
  BLOCK_KEYS,
  MODULE_DEFINITIONS,
  MODULE_KEYS,
  type BlockKey,
  type ModuleKey,
} from "@/lib/check-foundation";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

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
  unitCapabilities?: {
    profile: string;
    modules: Record<string, boolean>;
  };
};

type CapabilityIssue = {
  field: string;
  code: string;
  message: string;
};

type CapabilityTransactionResponse = {
  ok: boolean;
  mode: "preview" | "apply";
  version: string;
  resolutionSource?: string;
  effectiveProfile?: string;
  effectiveModules?: string[];
  changedBy?: {
    actorId?: string;
    actorEmail?: string;
    source?: string;
    intent?: string;
    reason?: string;
    notes?: string;
  };
  warnings: string[];
  errors: CapabilityIssue[];
  effective: {
    enabledBlocks: BlockKey[];
    enabledModules: ModuleKey[];
    enabledMiniapps: string[];
    source: string;
  };
  impact: {
    hiddenRoutes: string[];
    blockedOperations: string[];
    affectedMiniapps: string[];
  };
  idempotentReplay?: boolean;
};

type CapabilityUiIntent = {
  source: string;
  intent: string;
  reason: string;
  notes?: string;
  requestedCapabilities?: {
    blocks?: string[];
    modules?: string[];
    miniapps?: string[];
  };
};

type CapabilityDraft = {
  blocks: Record<BlockKey, boolean>;
  modules: Record<ModuleKey, boolean>;
  miniapps: Record<string, boolean>;
};

type ModuleMatrixRow = {
  moduleKey: ModuleKey;
  label: string;
  description: string;
  requiredBy: string[];
  optionalBy: string[];
  enabled: boolean;
  locked: boolean;
  lockReason?: string;
  source: "block-required" | "operator-override" | "system-default";
  previewEnabled: boolean | null;
};

type DestinationDaemonLimitKey =
  | "maxRuns"
  | "maxPasses"
  | "maxAutoRejections"
  | "maxRevisionIntakes"
  | "maxApprovedPublishes";

type DestinationDaemonLimits = {
  maxRuns: number;
  maxPasses: number;
  maxAutoRejections: number;
  maxRevisionIntakes: number;
  maxApprovedPublishes: number;
};

type DaemonPolicyResponse = {
  source: "default" | "worker-config";
  defaults: DestinationDaemonLimits;
  byDestination: Record<DestinationKey, DestinationDaemonLimits>;
  warnings?: string[];
};

const DAEMON_LIMIT_FIELDS: Array<{
  key: DestinationDaemonLimitKey;
  labelKey: string;
  descriptionKey: string;
  min: number;
  max: number;
}> = [
  {
    key: "maxRuns",
    labelKey: "settings.daemonPolicyMaxRunsLabel",
    descriptionKey: "settings.daemonPolicyMaxRunsDescription",
    min: 1,
    max: 20,
  },
  {
    key: "maxPasses",
    labelKey: "settings.daemonPolicyMaxPassesLabel",
    descriptionKey: "settings.daemonPolicyMaxPassesDescription",
    min: 1,
    max: 8,
  },
  {
    key: "maxAutoRejections",
    labelKey: "settings.daemonPolicyMaxAutoRejectionsLabel",
    descriptionKey: "settings.daemonPolicyMaxAutoRejectionsDescription",
    min: 1,
    max: 10,
  },
  {
    key: "maxRevisionIntakes",
    labelKey: "settings.daemonPolicyMaxRevisionIntakesLabel",
    descriptionKey: "settings.daemonPolicyMaxRevisionIntakesDescription",
    min: 1,
    max: 20,
  },
  {
    key: "maxApprovedPublishes",
    labelKey: "settings.daemonPolicyMaxApprovedPublishesLabel",
    descriptionKey: "settings.daemonPolicyMaxApprovedPublishesDescription",
    min: 1,
    max: 20,
  },
];

function cloneDestinationDaemonByDestination(
  value: Record<DestinationKey, DestinationDaemonLimits>,
): Record<DestinationKey, DestinationDaemonLimits> {
  return {
    compare: { ...value.compare },
    trainers: { ...value.trainers },
    athleteiq: { ...value.athleteiq },
  };
}

function clampDestinationDaemonLimit(
  key: DestinationDaemonLimitKey,
  rawValue: number,
) {
  const field = DAEMON_LIMIT_FIELDS.find((item) => item.key === key);
  if (!field) return Math.round(rawValue);
  return Math.max(field.min, Math.min(field.max, Math.round(rawValue)));
}

const DEFAULT_MINIAPP_KEYS = ["compare", "trainers", "athleteiq"] as const;

function buildEmptyCapabilityDraft(): CapabilityDraft {
  return {
    blocks: Object.fromEntries(BLOCK_KEYS.map((key) => [key, false])) as Record<BlockKey, boolean>,
    modules: Object.fromEntries(MODULE_KEYS.map((key) => [key, false])) as Record<ModuleKey, boolean>,
    miniapps: Object.fromEntries(DEFAULT_MINIAPP_KEYS.map((key) => [key, false])) as Record<string, boolean>,
  };
}

function buildCapabilityDraftFromEffective(effective: {
  enabledBlocks?: string[];
  enabledModules?: string[];
  enabledMiniapps?: string[];
} | null | undefined): CapabilityDraft {
  const base = buildEmptyCapabilityDraft();
  const enabledBlockSet = new Set(effective?.enabledBlocks ?? []);
  const enabledModuleSet = new Set(effective?.enabledModules ?? []);
  const enabledMiniappSet = new Set(effective?.enabledMiniapps ?? []);

  const miniappKeys = Array.from(new Set<string>([
    ...Object.keys(base.miniapps),
    ...Array.from(enabledMiniappSet),
  ]));

  return {
    blocks: Object.fromEntries(
      BLOCK_KEYS.map((key) => [key, enabledBlockSet.has(key)]),
    ) as Record<BlockKey, boolean>,
    modules: Object.fromEntries(
      MODULE_KEYS.map((key) => [key, enabledModuleSet.has(key)]),
    ) as Record<ModuleKey, boolean>,
    miniapps: Object.fromEntries(
      miniappKeys.map((key) => [key, enabledMiniappSet.has(key)]),
    ) as Record<string, boolean>,
  };
}

function buildCapabilityIntent(mode: "preview" | "apply", draft: CapabilityDraft): CapabilityUiIntent {
  const requestedCapabilities = {
    blocks: Object.entries(draft.blocks)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key),
    modules: Object.entries(draft.modules)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key),
    miniapps: Object.entries(draft.miniapps)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key),
  };

  return {
    source: "settings-capabilities-ui",
    intent: `${mode}-capability-transaction`,
    reason: mode === "preview"
      ? "Previewing capability draft from Unit Settings."
      : "Applying capability draft from Unit Settings.",
    notes: `Operator requested ${mode} for ${requestedCapabilities.blocks.length} blocks and ${requestedCapabilities.modules.length} modules.`,
    requestedCapabilities,
  };
}

function toCapabilityPayload(draft: CapabilityDraft) {
  return {
    blocks: Object.fromEntries(
      BLOCK_KEYS.map((key) => [key, { enabled: Boolean(draft.blocks[key]) }]),
    ),
    modules: Object.fromEntries(
      MODULE_KEYS.map((key) => [key, Boolean(draft.modules[key])]),
    ),
    miniapps: Object.fromEntries(
      Object.entries(draft.miniapps).map(([key, enabled]) => [key, { enabled: Boolean(enabled) }]),
    ),
  };
}

function buildModuleMatrixRows(
  draft: CapabilityDraft,
  preview: CapabilityTransactionResponse | null,
): ModuleMatrixRow[] {
  const enabledBlocks = BLOCK_DEFINITIONS.filter((block) => draft.blocks[block.key]);
  const previewEnabledModules = new Set(preview?.effective?.enabledModules ?? []);

  return MODULE_DEFINITIONS.map((moduleDefinition) => {
    const requiredBy = enabledBlocks
      .filter((block) => block.requiredModules.includes(moduleDefinition.key))
      .map((block) => block.displayName);
    const optionalBy = enabledBlocks
      .filter((block) => block.optionalModules.includes(moduleDefinition.key))
      .map((block) => block.displayName);
    const locked = requiredBy.length > 0;
    const enabled = locked || Boolean(draft.modules[moduleDefinition.key]);
    return {
      moduleKey: moduleDefinition.key,
      label: moduleDefinition.displayName,
      description: moduleDefinition.description,
      requiredBy,
      optionalBy,
      enabled,
      locked,
      lockReason: locked ? `Required by ${requiredBy.join(", ")}.` : undefined,
      source: locked ? "block-required" : draft.modules[moduleDefinition.key] ? "operator-override" : "system-default",
      previewEnabled: preview ? previewEnabledModules.has(moduleDefinition.key) : null,
    };
  });
}

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const { t } = useI18n();

  const [settings, setSettings] = useState<CommunicationSettings | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [daemonPolicy, setDaemonPolicy] = useState<DaemonPolicyResponse | null>(null);
  const [daemonPolicyDraft, setDaemonPolicyDraft] = useState<Record<DestinationKey, DestinationDaemonLimits> | null>(null);
  const [capabilityDraft, setCapabilityDraft] = useState<CapabilityDraft>(() => buildEmptyCapabilityDraft());
  const [capabilityVersion, setCapabilityVersion] = useState("");
  const [capabilityPreview, setCapabilityPreview] = useState<CapabilityTransactionResponse | null>(null);
  const [capabilityWarnings, setCapabilityWarnings] = useState<string[]>([]);
  const [capabilityErrors, setCapabilityErrors] = useState<CapabilityIssue[]>([]);
  const [unitNameDraft, setUnitNameDraft] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingUnit, setDeletingUnit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDaemonPolicy, setSavingDaemonPolicy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const [commRes, companyRes, daemonPolicyRes, packageRes] = await Promise.all([
        fetch(`/api/communication/settings?companyId=${companyId}`),
        fetch(`/api/companies/${companyId}/settings`),
        fetch(`/api/companies/${companyId}/daemon-policy`),
        fetch(`/api/companies/${companyId}/package`),
      ]);
      
      if (commRes.ok) {
        setSettings(await commRes.json());
      }
      if (companyRes.ok) {
        const companyData = await companyRes.json();
        setCompanySettings(companyData);
        setUnitNameDraft(companyData.name || "");
      }
      if (daemonPolicyRes.ok) {
        const daemonPolicyData = await daemonPolicyRes.json() as DaemonPolicyResponse;
        if (daemonPolicyData?.byDestination) {
          setDaemonPolicy(daemonPolicyData);
          setDaemonPolicyDraft(cloneDestinationDaemonByDestination(daemonPolicyData.byDestination));
        }
      }
      if (packageRes.ok) {
        const packageData = await packageRes.json() as {
          capabilities?: {
            enabledBlocks?: string[];
            enabledModules?: string[];
            enabledMiniapps?: string[];
          };
        };
        const nextDraft = buildCapabilityDraftFromEffective(packageData?.capabilities);
        setCapabilityDraft(nextDraft);

        const previewRes = await fetch(`/api/companies/${companyId}/capabilities/transaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "preview",
            payload: toCapabilityPayload(nextDraft),
            uiIntent: buildCapabilityIntent("preview", nextDraft),
          }),
        });
        const previewData = await previewRes.json().catch(() => null) as CapabilityTransactionResponse | null;
        if (previewData && typeof previewData === "object") {
          setCapabilityPreview(previewData);
          setCapabilityVersion(previewData.version || "");
          setCapabilityWarnings(Array.isArray(previewData.warnings) ? previewData.warnings : []);
          setCapabilityErrors(Array.isArray(previewData.errors) ? previewData.errors : []);
        }
      }
    } catch (error) {
      console.error("Failed to load settings", error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const runCapabilityTransaction = useCallback(async (input: {
    mode: "preview" | "apply";
    expectedVersion?: string;
    idempotencyKey?: string;
    uiIntent?: CapabilityUiIntent;
  }) => {
    const response = await fetch(`/api/companies/${companyId}/capabilities/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: input.mode,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        payload: toCapabilityPayload(capabilityDraft),
        uiIntent: input.uiIntent,
      }),
    });
    const payload = await response.json().catch(() => null) as CapabilityTransactionResponse | null;
    return { response, payload };
  }, [capabilityDraft, companyId]);

  const previewCapabilityDraft = useCallback(async () => {
    setSaving(true);
    try {
      const previewIntent = buildCapabilityIntent("preview", capabilityDraft);
      const { response: previewResponse, payload: previewPayload } = await runCapabilityTransaction({
        mode: "preview",
        uiIntent: previewIntent,
      });
      if (!previewPayload || typeof previewPayload !== "object") {
        notifications.show({
          title: t("common.error"),
          message: "Capability preview failed because the server response was invalid.",
          color: "review",
        });
        return;
      }

      setCapabilityPreview(previewPayload);
      setCapabilityVersion(previewPayload.version || "");
      setCapabilityWarnings(Array.isArray(previewPayload.warnings) ? previewPayload.warnings : []);
      setCapabilityErrors(Array.isArray(previewPayload.errors) ? previewPayload.errors : []);

      if (previewResponse.ok && previewPayload.ok) {
        notifications.show({
          title: "Preview complete",
          message: "Capability preview is ready. Review impact before applying.",
        });
        return;
      }

      notifications.show({
        title: "Preview blocked",
        message: "Fix validation errors before applying capability changes.",
        color: "review",
      });
    } catch (error) {
      notifications.show({
        title: t("common.error"),
        message: "Capability preview failed.",
        color: "review",
      });
    } finally {
      setSaving(false);
    }
  }, [capabilityDraft, runCapabilityTransaction, t]);

  const applyCapabilityDraft = useCallback(async () => {
    setSaving(true);
    try {
      let expectedVersion = capabilityVersion;
      if (!expectedVersion) {
        const previewResult = await runCapabilityTransaction({
          mode: "preview",
          uiIntent: buildCapabilityIntent("preview", capabilityDraft),
        });
        const previewPayload = previewResult.payload;
        if (!previewPayload || !previewResult.response.ok || !previewPayload.ok) {
          setCapabilityPreview(previewPayload);
          setCapabilityWarnings(Array.isArray(previewPayload?.warnings) ? previewPayload.warnings : []);
          setCapabilityErrors(Array.isArray(previewPayload?.errors) ? previewPayload.errors : []);
          notifications.show({
            title: "Apply blocked",
            message: "Preview is required before apply and the preview currently has errors.",
            color: "review",
          });
          return;
        }
        expectedVersion = previewPayload.version;
        setCapabilityVersion(expectedVersion);
        setCapabilityPreview(previewPayload);
      }

      const idempotencyKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const applyIntent = buildCapabilityIntent("apply", capabilityDraft);

      const { response, payload } = await runCapabilityTransaction({
        mode: "apply",
        expectedVersion,
        idempotencyKey,
        uiIntent: applyIntent,
      });

      if (!payload || typeof payload !== "object") {
        notifications.show({
          title: t("common.error"),
          message: "Capability apply failed because the server response was invalid.",
          color: "review",
        });
        return;
      }

      setCapabilityPreview(payload);
      setCapabilityVersion(payload.version || "");
      setCapabilityWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      setCapabilityErrors(Array.isArray(payload.errors) ? payload.errors : []);

      if (!response.ok || !payload.ok) {
        notifications.show({
          title: response.status === 409 ? "Version conflict" : "Apply blocked",
          message: response.status === 409
            ? "Capability state changed on the server. Review latest state and retry."
            : "Capability apply failed. Resolve validation issues and retry.",
          color: "review",
        });
        return;
      }

      const normalizedDraft = buildCapabilityDraftFromEffective(payload.effective);
      setCapabilityDraft(normalizedDraft);
      notifications.show({
        title: payload.idempotentReplay ? "Apply replay accepted" : "Capabilities applied",
        message: payload.idempotentReplay
          ? "The same capability apply request was already completed."
          : "Block, module, and miniapp capabilities were applied successfully.",
      });
    } catch (error) {
      notifications.show({
        title: t("common.error"),
        message: "Capability apply failed.",
        color: "review",
      });
    } finally {
      setSaving(false);
    }
  }, [capabilityDraft, capabilityVersion, runCapabilityTransaction, t]);

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
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setCompanySettings(updated);
        setUnitNameDraft(updated.name || "");
        notifications.show({ title: t("settings.organizationSaved"), message: t("settings.organizationUpdated") });
      } else {
        const payload = await res.json().catch(() => null);
        notifications.show({
          title: t("common.error"),
          message: payload?.error || t("settings.organizationSaveFailed"),
          color: "review",
        });
      }
    } catch (error) {
      notifications.show({ title: t("common.error"), message: t("settings.organizationSaveFailed"), color: "review" });
    } finally {
      setSaving(false);
    }
  };

  const renameUnit = async () => {
    const nextName = unitNameDraft.trim().replace(/\s+/g, " ");
    if (!companySettings || !nextName || nextName === companySettings.name) return;
    await saveCompanySettings({ name: nextName });
  };

  const deleteUnit = async () => {
    if (!companySettings || deleteConfirmation.trim() !== companySettings.name) {
      notifications.show({
        title: t("common.error"),
        message: "Type the current Unit name exactly before deleting.",
        color: "review",
      });
      return;
    }
    setDeletingUnit(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/settings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation.trim() }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to delete Unit.");
      }
      notifications.show({ title: "Unit deleted", message: `${companySettings.name} was deleted.` });
      router.push("/");
      router.refresh();
    } catch (error) {
      notifications.show({
        title: t("common.error"),
        message: error instanceof Error ? error.message : "Failed to delete Unit.",
        color: "review",
      });
    } finally {
      setDeletingUnit(false);
    }
  };

  const updateDaemonPolicyLimit = (
    destinationKey: DestinationKey,
    limitKey: DestinationDaemonLimitKey,
    value: number | string,
  ) => {
    if (!daemonPolicyDraft) return;
    if (value === "") return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const nextValue = clampDestinationDaemonLimit(limitKey, numeric);
    setDaemonPolicyDraft({
      ...daemonPolicyDraft,
      [destinationKey]: {
        ...daemonPolicyDraft[destinationKey],
        [limitKey]: nextValue,
      },
    });
  };

  const saveDaemonPolicy = async () => {
    if (!daemonPolicyDraft) return;
    setSavingDaemonPolicy(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/daemon-policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          miniapps: daemonPolicyDraft,
        }),
      });
      if (res.ok) {
        const next = await res.json() as DaemonPolicyResponse;
        if (next?.byDestination) {
          setDaemonPolicy(next);
          setDaemonPolicyDraft(cloneDestinationDaemonByDestination(next.byDestination));
        }
        notifications.show({
          title: t("settings.daemonPolicySaved"),
          message: t("settings.daemonPolicyUpdated"),
        });
      } else {
        notifications.show({
          title: t("common.error"),
          message: t("settings.daemonPolicySaveFailed"),
          color: "review",
        });
      }
    } catch (error) {
      notifications.show({
        title: t("common.error"),
        message: t("settings.daemonPolicySaveFailed"),
        color: "review",
      });
    } finally {
      setSavingDaemonPolicy(false);
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

  const moduleMatrixRows = useMemo(
    () => buildModuleMatrixRows(capabilityDraft, capabilityPreview),
    [capabilityDraft, capabilityPreview],
  );
  const pendingModuleDiff = moduleMatrixRows.filter((row) => row.previewEnabled !== null && row.previewEnabled !== row.enabled);

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

        {/* Global alerting control */}
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

        {/* Organization settings */}
        <UnifiedCard tone="strategy">
          <UnifiedCardBody>
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Group gap="sm">
                    <ThemeIcon color="strategy">
                      <Building size={18} />
                    </ThemeIcon>
                    <SectionTitle>Unit Identity</SectionTitle>
                  </Group>
                  <BodyText>Rename or permanently delete this operating Unit.</BodyText>
                </Stack>
                <Badge color="strategy" size="sm">Unit</Badge>
              </Group>

              <UnifiedCardSection tone="strategy">
                <Stack gap="sm">
                  <TextInput
                    label="Unit name"
                    value={unitNameDraft}
                    onChange={(event) => setUnitNameDraft(event.currentTarget.value)}
                    disabled={saving || deletingUnit}
                  />
                  <Group justify="flex-end">
                    <Button
                      color="strategy"
                      onClick={() => void renameUnit()}
                      disabled={saving || deletingUnit || !companySettings || !unitNameDraft.trim() || unitNameDraft.trim() === companySettings.name}
                      loading={saving}
                    >
                      Rename Unit
                    </Button>
                  </Group>
                </Stack>
              </UnifiedCardSection>

              <UnifiedCardSection tone="review">
                <Stack gap="sm">
                  <Group gap="sm">
                    <ThemeIcon color="review">
                      <Trash size={18} />
                    </ThemeIcon>
                    <SectionTitle>Delete Unit</SectionTitle>
                  </Group>
                  <BodyText>Deletion removes the Unit and its stored cards, workers, projections, Miniapp data, members, and settings. This cannot be undone.</BodyText>
                  <TextInput
                    label={`Type "${companySettings?.name ?? ""}" to confirm`}
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.currentTarget.value)}
                    disabled={saving || deletingUnit}
                  />
                  <Group justify="flex-end">
                    <Button
                      color="review"
                      variant="outline"
                      leftSection={<Trash size={16} />}
                      onClick={() => void deleteUnit()}
                      disabled={!companySettings || deleteConfirmation.trim() !== companySettings.name || saving}
                      loading={deletingUnit}
                    >
                      Delete Unit
                    </Button>
                  </Group>
                </Stack>
              </UnifiedCardSection>
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

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

        {/* Block control center */}
        <UnifiedCard tone="review">
          <UnifiedCardBody>
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Group gap="sm">
                    <ThemeIcon color="review">
                      <SettingsIcon size={18} />
                    </ThemeIcon>
                    <SectionTitle>Block Control Center</SectionTitle>
                  </Group>
                  <MetaText>Enable or disable Blocks, Modules, and Miniapp destinations with preview-first transactional apply.</MetaText>
                </Stack>
                <Badge color="review" variant="light">
                  {capabilityVersion ? `Version ${capabilityVersion}` : "Version pending"}
                </Badge>
              </Group>

              <UnifiedCardSection tone="review">
                <Stack gap="sm">
                  <SectionTitle>Blocks</SectionTitle>
                  {BLOCK_DEFINITIONS.map((definition) => (
                    <Group key={definition.key} justify="space-between" align="flex-start" wrap="nowrap">
                      <Box>
                        <BodyText>{definition.displayName}</BodyText>
                        <MetaText>{definition.description}</MetaText>
                      </Box>
                      <Switch
                        size="md"
                        checked={Boolean(capabilityDraft.blocks[definition.key])}
                        disabled={saving}
                        onChange={(event) => {
                          const enabled = event.currentTarget.checked;
                          setCapabilityPreview(null);
                          setCapabilityWarnings([]);
                          setCapabilityErrors([]);
                          setCapabilityDraft((prev) => {
                            const nextMiniapps = { ...prev.miniapps };
                            if (definition.key === "miniapp" && !enabled) {
                              for (const key of Object.keys(nextMiniapps)) {
                                nextMiniapps[key] = false;
                              }
                            }
                            return {
                              ...prev,
                              blocks: {
                                ...prev.blocks,
                                [definition.key]: enabled,
                              },
                              miniapps: nextMiniapps,
                            };
                          });
                        }}
                      />
                    </Group>
                  ))}
                </Stack>
              </UnifiedCardSection>

              <UnifiedCardSection tone="review">
                <Stack gap="sm">
                  <SectionTitle>Miniapp destinations</SectionTitle>
                  {Object.entries(capabilityDraft.miniapps).map(([miniappKey, enabled]) => (
                    <Group key={miniappKey} justify="space-between" align="center" wrap="nowrap">
                      <Box>
                        <BodyText>{miniappKey}</BodyText>
                        <MetaText>Miniapp capability and mission pipeline.</MetaText>
                      </Box>
                      <Switch
                        size="md"
                        checked={Boolean(enabled)}
                        disabled={saving}
                        onChange={(event) => {
                          const nextEnabled = event.currentTarget.checked;
                          setCapabilityPreview(null);
                          setCapabilityWarnings([]);
                          setCapabilityErrors([]);
                          setCapabilityDraft((prev) => ({
                            ...prev,
                            miniapps: {
                              ...prev.miniapps,
                              [miniappKey]: nextEnabled,
                            },
                            blocks: {
                              ...prev.blocks,
                              miniapp: nextEnabled ? true : prev.blocks.miniapp,
                            },
                          }));
                        }}
                      />
                    </Group>
                  ))}
                </Stack>
              </UnifiedCardSection>

              <UnifiedCardSection tone="review">
                <Stack gap="sm">
                  <SectionTitle>Module matrix</SectionTitle>
                  <MetaText>Required modules are locked by enabled Blocks. Optional modules can be changed and previewed before apply.</MetaText>
                  {moduleMatrixRows.map((row) => (
                    <Group key={row.moduleKey} justify="space-between" align="flex-start" wrap="nowrap">
                      <Box>
                        <Group gap="xs">
                          <BodyText>{row.label}</BodyText>
                          {row.locked ? <Badge color="review" variant="light">Locked</Badge> : null}
                          {row.requiredBy.length > 0 ? <Badge color="tactical" variant="light">Required</Badge> : <Badge color="gray" variant="light">Optional</Badge>}
                          {row.previewEnabled !== null && row.previewEnabled !== row.enabled ? <Badge color="strategy" variant="light">Pending diff</Badge> : null}
                        </Group>
                        <MetaText>{row.description}</MetaText>
                        {row.lockReason ? <MetaText>{row.lockReason}</MetaText> : null}
                        {row.optionalBy.length > 0 && !row.locked ? (
                          <MetaText>{`Optional for ${row.optionalBy.join(", ")}.`}</MetaText>
                        ) : null}
                      </Box>
                      <Switch
                        size="md"
                        checked={row.enabled}
                        disabled={saving || row.locked}
                        aria-label={`${row.label} module ${row.locked ? "locked" : "toggle"}`}
                        onChange={(event) => {
                          const enabled = event.currentTarget.checked;
                          setCapabilityPreview(null);
                          setCapabilityWarnings([]);
                          setCapabilityErrors([]);
                          setCapabilityDraft((prev) => ({
                            ...prev,
                            modules: {
                              ...prev.modules,
                              [row.moduleKey]: enabled,
                            },
                          }));
                        }}
                      />
                    </Group>
                  ))}
                </Stack>
              </UnifiedCardSection>

              {pendingModuleDiff.length > 0 ? (
                <UnifiedCardSection tone="strategy">
                  <Stack gap="xs">
                    <SectionTitle>Pending module diff</SectionTitle>
                    {pendingModuleDiff.map((row) => (
                      <Group key={`pending-${row.moduleKey}`} justify="space-between">
                        <MetaText>{row.label}</MetaText>
                        <Badge color="strategy" variant="light">
                          {row.previewEnabled ? "Server will enable" : "Server will disable"}
                        </Badge>
                      </Group>
                    ))}
                  </Stack>
                </UnifiedCardSection>
              ) : null}

              {capabilityWarnings.length > 0 ? (
                <UnifiedCardSection tone="review">
                  <Stack gap="xs">
                    <SectionTitle>Warnings</SectionTitle>
                    {capabilityWarnings.map((warning, index) => (
                      <MetaText key={`capability-warning-${index}`}>{warning}</MetaText>
                    ))}
                  </Stack>
                </UnifiedCardSection>
              ) : null}

              {capabilityErrors.length > 0 ? (
                <UnifiedCardSection tone="review">
                  <Stack gap="xs">
                    <SectionTitle>Validation errors</SectionTitle>
                    {capabilityErrors.map((issue, index) => (
                      <MetaText key={`capability-error-${index}`}>
                        {`${issue.field}: ${issue.message} (${issue.code})`}
                      </MetaText>
                    ))}
                  </Stack>
                </UnifiedCardSection>
              ) : null}

              {capabilityPreview?.impact ? (
                <UnifiedCardSection tone="review">
                  <Stack gap="xs">
                    <SectionTitle>Runtime impact preview</SectionTitle>
                    <MetaText>{`Hidden routes: ${capabilityPreview.impact.hiddenRoutes.length}`}</MetaText>
                    <MetaText>{`Blocked operations: ${capabilityPreview.impact.blockedOperations.length}`}</MetaText>
                    <MetaText>{`Affected miniapps: ${capabilityPreview.impact.affectedMiniapps.length}`}</MetaText>
                  </Stack>
                </UnifiedCardSection>
              ) : null}

              <Group justify="flex-end" gap="sm">
                <Button
                  variant="light"
                  color="gray"
                  disabled={saving}
                  loading={saving}
                  onClick={() => {
                    void previewCapabilityDraft();
                  }}
                >
                  Preview changes
                </Button>
                <Button
                  color="review"
                  disabled={saving}
                  loading={saving}
                  onClick={() => {
                    void applyCapabilityDraft();
                  }}
                >
                  Apply changes
                </Button>
              </Group>
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="tactical">
          <UnifiedCardBody>
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon color="tactical">
                  <SettingsIcon size={18} />
                </ThemeIcon>
                <SectionTitle>{t("settings.daemonPolicyTitle")}</SectionTitle>
              </Group>
              <MetaText>
                {t("settings.daemonPolicyDescription")}
              </MetaText>

              {daemonPolicy && daemonPolicyDraft ? (
                <>
                  <UnifiedCardSection tone="tactical">
                    <Stack gap="xs">
                      <MetaText>
                        {t("settings.daemonPolicyResolvedSource", {
                          source:
                            daemonPolicy.source === "worker-config"
                              ? t("settings.daemonPolicySourceWorkerConfig")
                              : t("settings.daemonPolicySourceDefault"),
                        })}
                      </MetaText>
                      <MetaText>{t("settings.daemonPolicyDefaultHint")}</MetaText>
                      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                        {DAEMON_LIMIT_FIELDS.map((field) => (
                          <Group key={`defaults-${field.key}`} justify="space-between">
                            <MetaText>{t(field.labelKey)}</MetaText>
                            <Text>{daemonPolicy.defaults[field.key]}</Text>
                          </Group>
                        ))}
                      </SimpleGrid>
                    </Stack>
                  </UnifiedCardSection>

                  {(["compare", "trainers", "athleteiq"] as DestinationKey[]).map((destinationKey) => (
                    <UnifiedCardSection key={`daemon-${destinationKey}`} tone="tactical">
                      <Stack gap="sm">
                        <SectionTitle>
                          {t("settings.daemonPolicyLaneOverrides", {
                            destination:
                              destinationKey === "compare"
                                ? t("settings.daemonPolicyDestinationCompare")
                                : destinationKey === "trainers"
                                ? "Trainers"
                                : "AthleteIQ",
                          })}
                        </SectionTitle>
                        <MetaText>{t("settings.daemonPolicyLaneOverridesDescription")}</MetaText>
                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                          {DAEMON_LIMIT_FIELDS.map((field) => (
                            <NumberInput
                              key={`${destinationKey}-${field.key}`}
                              label={t(field.labelKey)}
                              description={t(field.descriptionKey)}
                              value={daemonPolicyDraft[destinationKey][field.key]}
                              min={field.min}
                              max={field.max}
                              step={1}
                              onChange={(value) => updateDaemonPolicyLimit(destinationKey, field.key, value)}
                              disabled={savingDaemonPolicy}
                            />
                          ))}
                        </SimpleGrid>
                      </Stack>
                    </UnifiedCardSection>
                  ))}

                  {Array.isArray(daemonPolicy.warnings) && daemonPolicy.warnings.length > 0 ? (
                    <UnifiedCardSection tone="review">
                      <Stack gap="xs">
                        <MetaText>{t("settings.daemonPolicyWarnings")}</MetaText>
                        {daemonPolicy.warnings.map((warning, index) => (
                          <MetaText key={`daemon-warning-${index}`} c="review">
                            {warning}
                          </MetaText>
                        ))}
                      </Stack>
                    </UnifiedCardSection>
                  ) : null}

                  <Group justify="flex-end">
                    <Button
                      variant="subtle"
                      color="tactical"
                      onClick={() => {
                        if (!daemonPolicy?.byDestination) return;
                        setDaemonPolicyDraft(cloneDestinationDaemonByDestination(daemonPolicy.byDestination));
                      }}
                      disabled={savingDaemonPolicy}
                    >
                      {t("settings.daemonPolicyReset")}
                    </Button>
                    <Button
                      color="tactical"
                      onClick={() => void saveDaemonPolicy()}
                      loading={savingDaemonPolicy}
                    >
                      {t("settings.daemonPolicySave")}
                    </Button>
                  </Group>
                </>
              ) : (
                <MetaText c="review">{t("settings.daemonPolicyLoadFailed")}</MetaText>
              )}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* Channel configuration */}
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

          {/* Threshold configuration */}
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

        {/* Two-Way bridge security */}
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
                <Text size="sm" style={{ wordBreak: "break-all" }}>
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
