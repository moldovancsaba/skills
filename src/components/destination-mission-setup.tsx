'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, Loader, SimpleGrid, Stack } from "@/components/gds/primitives";
import { IconCopy, IconPlayerPause, IconRefresh, IconRosetteDiscountCheck, IconSettings } from "@/components/gds/icons";
import { FormCheckbox, FormInput, FormSelect, FormTextarea } from "@/components/ui/form-fields";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";
import {
  DEFAULT_DESTINATION_MISSION_DEFINITION,
  normalizeMissionDefinitionConfig,
  type DestinationMissionDefinitionConfig,
} from "@/lib/destination-mission-contract";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { resolveDestinationLabel } from "@/lib/destination-scope";

type MissionDefinitionRecord = {
  id: string;
  name: string;
  status: string;
  missionKind: string;
  activeRevisionId: string | null;
  configJson: DestinationMissionDefinitionConfig;
  revisions?: Array<{ id: string; version: number; createdAt: string }>;
  updatedAt: string;
};

type MissionDefinitionPayload = {
  ok: boolean;
  definitions?: MissionDefinitionRecord[];
  definition?: MissionDefinitionRecord;
  run?: { id: string };
  error?: string;
};

type MissionDefinitionFormState = {
  name: string;
  boroughs: string;
  neighborhoods: string;
  listingTypeScope: string;
  mode: "manual" | "guarded" | "autopilot";
  cadence: "manual-only" | "scheduled";
  cronEnabled: boolean;
  requireHumanPublishApproval: boolean;
  minimumScarcityScore: string;
  maxCandidatesPerMission: string;
  maxDomainRetries: string;
  maxContinuousPasses: string;
  requireOfficialSource: boolean;
  requireImgBbImage: boolean;
  requireRecurringProgramsWhenAvailable: boolean;
};

function parseList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function configToFormState(config: DestinationMissionDefinitionConfig): MissionDefinitionFormState {
  const normalized = normalizeMissionDefinitionConfig(config);
  return {
    name: "",
    boroughs: normalized.geographyScope.boroughs.join(", "),
    neighborhoods: normalized.geographyScope.neighborhoods.join(", "),
    listingTypeScope: normalized.listingTypeScope.join(", "),
    mode: normalized.executionPolicy.mode,
    cadence: normalized.executionPolicy.cadence,
    cronEnabled: normalized.executionPolicy.cronEnabled,
    requireHumanPublishApproval: normalized.executionPolicy.requireHumanPublishApproval,
    minimumScarcityScore: String(normalized.rulebookPolicy.minimumScarcityScore),
    maxCandidatesPerMission: String(normalized.rulebookPolicy.maxCandidatesPerMission),
    maxDomainRetries: String(normalized.rulebookPolicy.maxDomainRetries),
    maxContinuousPasses: String(normalized.rulebookPolicy.maxContinuousPasses),
    requireOfficialSource: normalized.rulebookPolicy.requireOfficialSource,
    requireImgBbImage: normalized.rulebookPolicy.requireImgBbImage,
    requireRecurringProgramsWhenAvailable: normalized.rulebookPolicy.requireRecurringProgramsWhenAvailable,
  };
}

function formStateToConfig(form: MissionDefinitionFormState): DestinationMissionDefinitionConfig {
  return normalizeMissionDefinitionConfig({
    geographyScope: {
      boroughs: parseList(form.boroughs),
      neighborhoods: parseList(form.neighborhoods),
    },
    listingTypeScope: parseList(form.listingTypeScope),
    executionPolicy: {
      mode: form.mode,
      cadence: form.cadence,
      cronEnabled: form.cadence === "scheduled" ? form.cronEnabled : false,
      requireHumanPublishApproval: form.requireHumanPublishApproval,
    },
    rulebookPolicy: {
      version: DEFAULT_DESTINATION_MISSION_DEFINITION.rulebookPolicy.version,
      executionMode: form.mode,
      minimumScarcityScore: Number(form.minimumScarcityScore || 70),
      allowedListingTypes: parseList(form.listingTypeScope),
      requireOfficialSource: form.requireOfficialSource,
      requireImgBbImage: form.requireImgBbImage,
      requireRecurringProgramsWhenAvailable: form.requireRecurringProgramsWhenAvailable,
      maxCandidatesPerMission: Number(form.maxCandidatesPerMission || 12),
      maxDomainRetries: Number(form.maxDomainRetries || 2),
      maxContinuousPasses: Number(form.maxContinuousPasses || 3),
      stopCondition: "one_live_verified_listing",
    },
  });
}

export function DestinationMissionSetup({
  companyId,
  destinationKey = "classscout",
}: {
  companyId: string;
  destinationKey?: DestinationKey;
}) {
  const destinationLabel = resolveDestinationLabel(destinationKey);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [startingMission, setStartingMission] = useState(false);
  const [definitions, setDefinitions] = useState<MissionDefinitionRecord[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
  const [formState, setFormState] = useState<MissionDefinitionFormState>(
    configToFormState(DEFAULT_DESTINATION_MISSION_DEFINITION),
  );
  const defaultDefinitionName = `${destinationLabel} Production Scarcity Curator`;
  const [definitionName, setDefinitionName] = useState(defaultDefinitionName);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastStartedRunId, setLastStartedRunId] = useState<string | null>(null);

  const selectedDefinition = useMemo(
    () => definitions.find((definition) => definition.id === selectedDefinitionId) ?? definitions[0] ?? null,
    [definitions, selectedDefinitionId],
  );

  const applyDefinitionToEditor = useCallback((definition: MissionDefinitionRecord | null) => {
    if (!definition) return;
    setDefinitionName(definition.name);
    setFormState(configToFormState(definition.configJson));
  }, []);

  const loadDefinitions = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        companyId,
        destinationKey,
        missionKind: "rulebook_new_listing",
      });
      const response = await fetch(`/api/destination-missions/definitions?${params.toString()}`);
      const payload = (response.ok ? await response.json() : null) as MissionDefinitionPayload | null;
      const nextDefinitions = Array.isArray(payload?.definitions) ? payload.definitions : [];
      const nextSelectedDefinition =
        nextDefinitions.find((definition) => definition.id === selectedDefinitionId) ??
        nextDefinitions[0] ??
        null;
      setDefinitions(nextDefinitions);
      setSelectedDefinitionId(nextSelectedDefinition?.id ?? null);
      if (nextSelectedDefinition) {
        applyDefinitionToEditor(nextSelectedDefinition);
      } else {
        setDefinitionName(defaultDefinitionName);
      }
    } catch (error) {
      setErrorMessage(String(error));
    } finally {
      setLoading(false);
    }
  }, [applyDefinitionToEditor, companyId, defaultDefinitionName, destinationKey, selectedDefinitionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDefinitions(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDefinitions]);

  const saveDefinition = useCallback(async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const config = formStateToConfig(formState);
      const method = selectedDefinition ? "PATCH" : "POST";
      const endpoint = selectedDefinition
        ? `/api/destination-missions/definitions/${selectedDefinition.id}`
        : "/api/destination-missions/definitions";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
          missionKind: "rulebook_new_listing",
          name: definitionName,
          config,
        }),
      });
      const payload = (response.ok ? await response.json() : null) as MissionDefinitionPayload | null;
      if (!response.ok || !payload?.definition) {
        throw new Error(payload?.error || "Failed to save mission definition");
      }
      await loadDefinitions();
      setSelectedDefinitionId(payload.definition.id);
    } catch (error) {
      setErrorMessage(String(error));
    } finally {
      setSaving(false);
    }
  }, [companyId, definitionName, destinationKey, formState, loadDefinitions, selectedDefinition]);

  const triggerAction = useCallback(async (action: "activate" | "pause" | "archive" | "duplicate") => {
    if (!selectedDefinition) return;
    setActioning(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/destination-missions/definitions/${selectedDefinition.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const payload = (response.ok ? await response.json() : null) as MissionDefinitionPayload | null;
      if (!response.ok || !payload?.definition) {
        throw new Error(payload?.error || `Failed to ${action} mission definition`);
      }
      await loadDefinitions();
      setSelectedDefinitionId(payload.definition.id);
    } catch (error) {
      setErrorMessage(String(error));
    } finally {
      setActioning(false);
    }
  }, [companyId, loadDefinitions, selectedDefinition]);

  const startMissionFromDefinition = useCallback(async () => {
    if (!selectedDefinition) return;
    setStartingMission(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/destination-missions/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
          missionKind: "rulebook_new_listing",
          missionDefinitionId: selectedDefinition.id,
          metadata: {
            startedFrom: "destination-mission-setup",
            missionDefinitionName: selectedDefinition.name,
          },
        }),
      });
      const payload = (response.ok ? await response.json() : null) as MissionDefinitionPayload | null;
      if (!response.ok || !payload?.run?.id) {
        throw new Error(payload?.error || "Failed to start mission run");
      }
      setLastStartedRunId(payload.run.id);
    } catch (error) {
      setErrorMessage(String(error));
    } finally {
      setStartingMission(false);
    }
  }, [companyId, destinationKey, selectedDefinition]);

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader />
      </Stack>
    );
  }

  return (
    <UnifiedCard tone="strategy">
      <UnifiedCardHeader
        title="Mission Setup"
        supporting={(
          <Group gap="xs">
            <Badge variant="light" color="strategy">
              {definitions.length} definition{definitions.length === 1 ? "" : "s"}
            </Badge>
            <Button variant="subtle" color="strategy" leftSection={<IconRefresh size={14} />} onClick={() => void loadDefinitions()}>
              Refresh
            </Button>
          </Group>
        )}
      />
      <UnifiedCardBody>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={2}>
              <SectionTitle>Define the {destinationLabel} rulebook inside this unit</SectionTitle>
              <BodyText>
                This is the delegated mission source of truth for discovery scope, scarcity policy, execution mode, and publish guardrails.
              </BodyText>
            </Stack>
            <Group gap="sm">
              <Button color="strategy" leftSection={<IconSettings size={16} />} loading={saving} onClick={() => void saveDefinition()}>
                {selectedDefinition ? "Save definition" : "Create definition"}
              </Button>
              <Button
                variant="light"
                color="review"
                leftSection={<IconRosetteDiscountCheck size={16} />}
                disabled={!selectedDefinition}
                loading={actioning}
                onClick={() => void triggerAction("activate")}
              >
                Activate
              </Button>
            </Group>
          </Group>

          {errorMessage ? (
            <UnifiedCardSection tone="review">
              <BodyText>{errorMessage}</BodyText>
            </UnifiedCardSection>
          ) : null}

          <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="md">
            <UnifiedCardSection tone="strategy">
              <Stack gap="xs">
                <MetaText>Definitions</MetaText>
                {definitions.length === 0 ? (
                  <BodyText>No mission definitions yet. Create one to make this unit the {destinationLabel} rulebook source of truth.</BodyText>
                ) : null}
                {definitions.map((definition) => {
                  const isSelected = definition.id === selectedDefinition?.id;
                  return (
                    <Button
                      key={definition.id}
                      variant={isSelected ? "light" : "subtle"}
                      color={isSelected ? "strategy" : "gray"}
                      justify="space-between"
                      onClick={() => {
                        setSelectedDefinitionId(definition.id);
                        applyDefinitionToEditor(definition);
                      }}
                    >
                      <MetaText>{definition.name}</MetaText>
                      <Badge variant="light" color={definition.status === "active" ? "green" : "gray"}>
                        {definition.status}
                      </Badge>
                    </Button>
                  );
                })}
              </Stack>
            </UnifiedCardSection>

            <UnifiedCardSection tone="review">
              <Stack gap="xs">
                <MetaText>Selected Definition</MetaText>
                {selectedDefinition ? (
                  <>
                    <Text fw={600}>{selectedDefinition.name}</Text>
                    <Badge variant="light" color={selectedDefinition.status === "active" ? "green" : "review"}>
                      {selectedDefinition.status}
                    </Badge>
                    <MetaText>Mission kind: {selectedDefinition.missionKind}</MetaText>
                    <MetaText>Updated: {new Date(selectedDefinition.updatedAt).toLocaleString()}</MetaText>
                    <MetaText>Latest revision: v{selectedDefinition.revisions?.[0]?.version ?? 1}</MetaText>
                    {lastStartedRunId ? (
                      <MetaText>Last started run: {lastStartedRunId}</MetaText>
                    ) : null}
                    <Group gap="sm">
                      <Button
                        variant="light"
                        color="review"
                        loading={startingMission}
                        onClick={() => void startMissionFromDefinition()}
                      >
                        Start mission
                      </Button>
                      <Button
                        variant="light"
                        color="gray"
                        leftSection={<IconCopy size={14} />}
                        loading={actioning}
                        onClick={() => void triggerAction("duplicate")}
                      >
                        Duplicate
                      </Button>
                      <Button
                        variant="light"
                        color="dark"
                        leftSection={<IconPlayerPause size={14} />}
                        loading={actioning}
                        onClick={() => void triggerAction("pause")}
                      >
                        Pause
                      </Button>
                    </Group>
                    <Button
                      variant="subtle"
                      color="review"
                      loading={actioning}
                      onClick={() => void triggerAction("archive")}
                    >
                      Archive
                    </Button>
                  </>
                ) : (
                  <BodyText>Creating a definition here makes the check Unit the home for {destinationLabel} mission setup.</BodyText>
                )}
              </Stack>
            </UnifiedCardSection>

            <UnifiedCardSection tone="checklist">
              <Stack gap="xs">
                <MetaText>Execution summary</MetaText>
                <MetaText>Mode: {formState.mode}</MetaText>
                <MetaText>Cadence: {formState.cadence}</MetaText>
                <MetaText>Cron enabled: {formState.cadence === "scheduled" && formState.cronEnabled ? "yes" : "no"}</MetaText>
                <MetaText>Human publish approval: {formState.requireHumanPublishApproval ? "required" : "not required"}</MetaText>
                <MetaText>Scarcity floor: {formState.minimumScarcityScore || "70"}</MetaText>
                <MetaText>Allowed listing types: {parseList(formState.listingTypeScope).length || 0}</MetaText>
              </Stack>
            </UnifiedCardSection>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
            <UnifiedCardSection tone="strategy">
              <Stack gap="sm">
                <FormInput
                  label="Definition name"
                  value={definitionName}
                  onChange={(event) => setDefinitionName(event.currentTarget.value)}
                />
                <FormTextarea
                  label="Borough scope"
                  description="Comma-separated boroughs. Leave empty to allow all boroughs."
                  minRows={2}
                  value={formState.boroughs}
                  onChange={(event) => setFormState((current) => ({ ...current, boroughs: event.currentTarget.value }))}
                />
                <FormTextarea
                  label="Neighborhood scope"
                  description="Comma-separated neighborhoods. Leave empty to allow all neighborhoods."
                  minRows={3}
                  value={formState.neighborhoods}
                  onChange={(event) => setFormState((current) => ({ ...current, neighborhoods: event.currentTarget.value }))}
                />
                <FormTextarea
                  label="Listing type scope"
                  description={`Comma-separated ${destinationLabel} listing types.`}
                  minRows={2}
                  value={formState.listingTypeScope}
                  onChange={(event) => setFormState((current) => ({ ...current, listingTypeScope: event.currentTarget.value }))}
                />
              </Stack>
            </UnifiedCardSection>

            <UnifiedCardSection tone="review">
              <Stack gap="sm">
                <FormSelect
                  label="Execution mode"
                  data={[
                    { value: "manual", label: "Manual" },
                    { value: "guarded", label: "Guarded" },
                    { value: "autopilot", label: "Autopilot" },
                  ]}
                  value={formState.mode}
                  onChange={(value) => setFormState((current) => ({
                    ...current,
                    mode: value === "guarded" || value === "autopilot" ? value : "manual",
                  }))}
                />
                <FormSelect
                  label="Cadence"
                  data={[
                    { value: "manual-only", label: "Manual only" },
                    { value: "scheduled", label: "Scheduled" },
                  ]}
                  value={formState.cadence}
                  onChange={(value) => setFormState((current) => ({
                    ...current,
                    cadence: value === "scheduled" ? "scheduled" : "manual-only",
                  }))}
                />
                <FormCheckbox
                  label="Enable cron execution for this mission definition"
                  checked={formState.cronEnabled}
                  disabled={formState.cadence !== "scheduled"}
                  onChange={(event) => setFormState((current) => ({ ...current, cronEnabled: event.currentTarget.checked }))}
                />
                <FormCheckbox
                  label="Require human publish approval"
                  checked={formState.requireHumanPublishApproval}
                  onChange={(event) => setFormState((current) => ({
                    ...current,
                    requireHumanPublishApproval: event.currentTarget.checked,
                  }))}
                />
              </Stack>
            </UnifiedCardSection>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
            <UnifiedCardSection tone="checklist">
              <Stack gap="sm">
                <FormInput
                  label="Minimum scarcity score"
                  value={formState.minimumScarcityScore}
                  onChange={(event) => setFormState((current) => ({ ...current, minimumScarcityScore: event.currentTarget.value }))}
                />
                <FormInput
                  label="Max candidates per mission"
                  value={formState.maxCandidatesPerMission}
                  onChange={(event) => setFormState((current) => ({ ...current, maxCandidatesPerMission: event.currentTarget.value }))}
                />
                <FormInput
                  label="Max domain retries"
                  value={formState.maxDomainRetries}
                  onChange={(event) => setFormState((current) => ({ ...current, maxDomainRetries: event.currentTarget.value }))}
                />
                <FormInput
                  label="Max continuous passes"
                  value={formState.maxContinuousPasses}
                  onChange={(event) => setFormState((current) => ({ ...current, maxContinuousPasses: event.currentTarget.value }))}
                />
              </Stack>
            </UnifiedCardSection>

            <UnifiedCardSection tone="neutral">
              <Stack gap="sm">
                <FormCheckbox
                  label="Require official source"
                  checked={formState.requireOfficialSource}
                  onChange={(event) => setFormState((current) => ({ ...current, requireOfficialSource: event.currentTarget.checked }))}
                />
                <FormCheckbox
                  label="Require ImgBB image"
                  checked={formState.requireImgBbImage}
                  onChange={(event) => setFormState((current) => ({ ...current, requireImgBbImage: event.currentTarget.checked }))}
                />
                <FormCheckbox
                  label="Require recurring programs when available"
                  checked={formState.requireRecurringProgramsWhenAvailable}
                  onChange={(event) => setFormState((current) => ({
                    ...current,
                    requireRecurringProgramsWhenAvailable: event.currentTarget.checked,
                  }))}
                />
              </Stack>
            </UnifiedCardSection>
          </SimpleGrid>
        </Stack>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
