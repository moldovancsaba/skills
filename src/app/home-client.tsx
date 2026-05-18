'use client';
import { Text, Title } from "@/components/ui/typography";

import { Stack, Group, ActionIcon, Tooltip, Divider, Box, Loader, Alert, ThemeIcon, Button, Badge, Center } from "@mantine/core";
import { IconPlus as Plus, IconSparkles as Sparkles, IconPencil as Edit, IconTrash as Trash2, IconHelpCircle as HelpCircle, IconLogin as LogIn, IconAlertCircle as AlertCircle, IconDatabase as Database, IconTarget as Target, IconListCheck as ListCheck, IconLayoutDashboard as LayoutDashboard, IconLayersIntersect as Layers, IconHistory as History } from "@tabler/icons-react";
import { FormInput } from "@/components/ui/form-fields";
import { HashtagMultiSelect } from "@/components/ui/hashtag-multi-select";
import { EmptyState, LinkCard, Notice, PageShell, RouteCardGrid } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody } from "@/components/ui/unified-card";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useState, useEffect, useCallback } from "react";
import { getSemanticInsetStyle } from "@/lib/semantic-theme";
import { useI18n } from "@/lib/ui-i18n";

type HomeCompany = {
  id: string;
  name: string;
  industry?: string | null;
  industries?: string[];
  metrics?: Record<string, number>;
  projection?: {
    available: boolean;
    freshness?: {
      status: string;
      generatedAt: string | null;
      ageMinutes: number | null;
    };
    generatedAt: string | null;
  };
  charts?: Record<string, Array<{ date: string; value: number }>>;
};

type HomeSession = {
  authenticated: boolean;
  id: string;
  email: string;
  name: string;
  picture?: string;
  isSuperAdmin?: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    picture?: string;
    isSuperAdmin?: boolean;
  };
} | null;

type HomeProps = {
  initialCompanies?: HomeCompany[];
  initialSuggestedIndustries?: string[];
  initialSession?: HomeSession;
  initialDataReady?: boolean;
};

export default function Home({
  initialCompanies = [],
  initialSuggestedIndustries = [],
  initialSession = null,
  initialDataReady = false,
}: HomeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCompany, setSources } = useStore();
  const { t } = useI18n();
  const [companies, setCompanies] = useState<HomeCompany[]>(initialCompanies);
  const [loading, setLoading] = useState(!initialDataReady);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", industry: "", industries: [] as string[] });
  const [suggestedIndustries, setSuggestedIndustries] = useState<string[]>(initialSuggestedIndustries);
  const [session, setSession] = useState<HomeSession>(initialSession);

  const canManageCompanies = Boolean(session?.isSuperAdmin);

  const companyParam = searchParams.get("company");

  const selectCompany = useCallback((company: any) => {
    setCompany(company);
    setSources([]);
    router.push(`/${company.id}`);
  }, [router, setCompany, setSources]);

  useEffect(() => {
    if (initialDataReady) return;

    fetch("/api/companies")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || t("home.failedCompanies"));
        }
        return data;
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setCompanies(data);
        } else if (Array.isArray(data?.companies)) {
          setCompanies(data.companies);
        } else {
          setCompanies([]);
          console.error("Received non-array data:", data);
        }
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [initialDataReady, t]);

  useEffect(() => {
    if (initialSuggestedIndustries.length > 0 || !canManageCompanies) return;

    fetch("/api/industries")
      .then(res => res.ok ? res.json() : [])
      .then(data => setSuggestedIndustries(data))
      .catch(console.error);
  }, [canManageCompanies, initialSuggestedIndustries.length]);

  useEffect(() => {
    if (initialSession) return;

    fetch("/api/auth/session")
      .then(res => res.ok ? res.json() : null)
      .then(data => setSession(data))
      .catch(console.error);
  }, [initialSession]);

  useEffect(() => {
    if (!companyParam || companies.length === 0) return;
    const found = companies.find((c) => c.id === companyParam);
    if (found) {
      selectCompany(found);
    }
  }, [companies, companyParam, selectCompany]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    setError(null);
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    
    if (res.ok) {
      const newCompany = await res.json();
      setFormData({ name: "", industry: "", industries: [] });
      setShowForm(false);
      selectCompany(newCompany);
    } else {
      const data = await res.json();
      setError(data.error || t("home.failedCreate"));
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !editingId) return;
    
    setError(null);
    const res = await fetch(`/api/companies?id=${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    
    if (res.ok) {
      const updatedCompany = await res.json();
      setCompanies(prev => prev.map(c => c.id === editingId ? updatedCompany : c));
      setFormData({ name: "", industry: "", industries: [] });
      setEditingId(null);
      setShowForm(false);
    } else {
      const data = await res.json();
      setError(data.error || t("home.failedUpdate"));
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!confirm(t("home.deleteConfirm"))) return;
    
    setError(null);
    const res = await fetch(`/api/companies?id=${id}`, {
      method: "DELETE",
    });
    
    if (res.ok) {
      setCompanies(prev => prev.filter(c => c.id !== id));
    } else {
      const data = await res.json();
      setError(data.error || t("home.failedDelete"));
    }
  };

  const startEdit = (c: any) => {
    setFormData({ 
      name: c.name, 
      industry: c.industry || "", 
      industries: c.industries || (c.industry ? [c.industry] : []) 
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  if (loading) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="md" w="100%">
          <Loader color="ingress" />
          <Text c="dimmed">{t("home.loading")}</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <PageShell width="7xl">
      <Stack gap="xl">

        {error && (
          <Notice icon={AlertCircle} title={t("home.syncFailure")} variant="destructive">
            {error}
          </Notice>
        )}

        <Group justify="flex-end" gap="lg">
          <Button 
            variant="subtle" 
            color="gray" 
            size="compact-sm" 
            leftSection={<HelpCircle size={14} />}
            onClick={() => router.push("/faq")}
          >
            {t("home.faq")}
          </Button>
          {!session && (
            <Button 
              variant="light" 
              color="synthesis" 
              size="compact-sm" 
              leftSection={<LogIn size={14} />}
              onClick={() => router.push("/auth")}
            >
              {t("home.sso")}
            </Button>
          )}
        </Group>

        {(canManageCompanies && (companies.length === 0 || showForm)) ? (
          <UnifiedCard tone="ingress">
            <UnifiedCardBody>
            <Stack gap="lg">
              <Title order={3}>{editingId ? t("home.editTitle") : t("home.createTitle")}</Title>
              <form onSubmit={editingId ? handleUpdateCompany : handleCreateCompany}>
                <Stack gap="md">
                  <FormInput
                    name="name"
                    label={t("home.companyName")}
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder={t("home.companyNamePlaceholder")}
                    required
                  />
                  <HashtagMultiSelect
                    label={t("home.industriesLabel")}
                    placeholder={t("home.industriesPlaceholder")}
                    selected={formData.industries}
                    onChange={industries => setFormData({...formData, industries})}
                    suggestions={suggestedIndustries}
                    error={undefined}
                  />
                  <Group gap="sm" mt="lg">
                    <Button type="submit" color="ingress" leftSection={<Plus size={16} />}>
                      {editingId ? t("home.synchronizeUnit") : t("home.initializeUnit")}
                    </Button>
                    <Button
                      variant="subtle"
                      color="gray"
                      onClick={() => { setEditingId(null); setFormData({ name: "", industry: "", industries: [] }); setShowForm(false); }}
                    >
                      {t("common.cancel")}
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Stack>
            </UnifiedCardBody>
          </UnifiedCard>
        ) : (
          <Stack gap={48}>
            {Array.isArray(companies) &&
              companies.map((c: any) => {
                const checklistMetric = Number(c.metrics?.checklist ?? 0);
                const planningMetric = Math.max(Number(c.metrics?.tactical ?? 0), checklistMetric);

                return (
                  <Box key={c.id}>
                    <Group justify="space-between" align="flex-end" mb="md">
                      <Stack gap={4}>
                        <Group gap="sm">
                          <Title order={2} onClick={() => router.push(`/${c.id}`)}>
                            {c.name}
                          </Title>
                          <Group gap={6}>
                            {c.industries?.map((tag: string) => (
                              <Badge key={tag} variant="outline" color="ingress" size="xs">
                                {tag}
                              </Badge>
                            ))}
                          </Group>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {t("home.unitId", { id: c.id.slice(0, 8) })}
                        </Text>
                      </Stack>

                      {canManageCompanies && (
                        <Group gap="xs">
                          <Tooltip label={t("home.editUnit")}>
                            <ActionIcon onClick={() => startEdit(c)} variant="light" color="gray" size="lg">
                              <Edit size={18} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t("home.purgeUnit")}>
                            <ActionIcon onClick={() => handleDeleteCompany(c.id)} variant="light" color="review" size="lg">
                              <Trash2 size={18} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      )}
                    </Group>
                    <Divider mb="md" />

                    <RouteCardGrid cols={{ base: 1, sm: 2, xl: 4 }}>
                      <LinkCard
                        href={`/${c.id}/data`}
                        icon={Database}
                        variant="ingress"
                        metric={c.metrics?.data ?? 0}
                        title={t("nav.data")}
                        chartData={c.charts?.data ?? []}
                        density="compact"
                      />
                      <LinkCard
                        href={`/${c.id}/topics`}
                        icon={Layers}
                        variant="synthesis"
                        metric={c.metrics?.topics ?? 0}
                        title={t("nav.topics")}
                        chartData={c.charts?.topics ?? []}
                        density="compact"
                      />
                      <LinkCard
                        href={`/${c.id}/goals`}
                        icon={Target}
                        variant="strategy"
                        metric={c.metrics?.goals ?? 0}
                        title={t("nav.goals")}
                        chartData={c.charts?.goals ?? []}
                        density="compact"
                      />
                      <LinkCard
                        href={`/${c.id}/review`}
                        icon={History}
                        variant="review"
                        metric={c.metrics?.review ?? 0}
                        title={t("nav.review")}
                        chartData={c.charts?.review ?? []}
                        density="compact"
                      />
                      <LinkCard
                        href={`/${c.id}/knowmore`}
                        icon={Sparkles}
                        variant="knowmore"
                        metric={c.metrics?.knowmore ?? 0}
                        title={t("nav.knowmore")}
                        chartData={c.charts?.knowmore ?? []}
                        density="compact"
                      />
                      <LinkCard
                        href={`/${c.id}/tactical`}
                        icon={LayoutDashboard}
                        variant="tactical"
                        metric={planningMetric}
                        title={t("nav.tactical")}
                        chartData={c.charts?.tactical ?? []}
                        density="compact"
                      />
                      <LinkCard
                        href={`/${c.id}/checklist`}
                        icon={ListCheck}
                        variant="checklist"
                        metric={checklistMetric}
                        title={t("nav.checklist")}
                        chartData={c.charts?.checklist ?? []}
                        density="compact"
                      />
                    </RouteCardGrid>
                  </Box>
                );
              })}

            {!canManageCompanies && companies.length === 0 && (
              <EmptyState
                icon={Database}
                tone="ingress"
                title={t("home.noUnitsTitle")}
                description={t("home.noUnitsDescription")}
              />
            )}
          </Stack>
        )}

        {canManageCompanies && !showForm && (
          <Box mt="xl">
            <Button 
              onClick={() => setShowForm(true)} 
              variant="subtle" 
              color="ingress"
              leftSection={<Plus size={16} />}
            >
              {t("home.provisionUnit")}
            </Button>
          </Box>
        )}
      </Stack>
    </PageShell>
  );
}
