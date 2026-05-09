'use client';

import { 
  Stack, 
  Group, 
  Text, 
  Title, 
  ActionIcon, 
  Tooltip, 
  Divider, 
  Box, 
  Loader, 
  Alert,
  ThemeIcon,
  Button,
  Badge,
  Card,
  Center
} from "@mantine/core";
import { IconPlus as Plus, IconSparkles as Sparkles, IconPencil as Edit, IconTrash as Trash2, IconHelpCircle as HelpCircle, IconLogin as LogIn, IconAlertCircle as AlertCircle, IconDatabase as Database, IconTarget as Target, IconListCheck as ListCheck, IconLayoutDashboard as LayoutDashboard, IconLayersIntersect as Layers, IconHistory as History } from "@tabler/icons-react";
import { FormInput } from "@/components/ui/form-fields";
import { HashtagMultiSelect } from "@/components/ui/hashtag-multi-select";
import { EmptyState, LinkCard, Notice, PageShell, RouteCardGrid } from "@/components/ui/app-shell";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useState, useEffect, useCallback } from "react";
import { getSemanticInsetStyle } from "@/lib/semantic-theme";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCompany, setSources } = useStore();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", industry: "", industries: [] as string[] });
  const [suggestedIndustries, setSuggestedIndustries] = useState<string[]>([]);
  const [session, setSession] = useState<any>(null);

  const chartSeries = useCallback((history: any[] | undefined, ...keys: string[]) => {
    return (history || []).map((point: any) => {
      const value = keys.reduce<number | null>((resolved, key) => {
        if (resolved !== null) return resolved;
        return typeof point?.[key] === "number" ? point[key] : null;
      }, null);
      return { date: point.date, value: value ?? 0 };
    });
  }, []);

  const canManageCompanies = Boolean(session?.isSuperAdmin);

  const companyParam = searchParams.get("company");

  const selectCompany = useCallback((company: any) => {
    setCompany(company);
    setSources([]);
    router.push(`/${company.id}`);
  }, [router, setCompany, setSources]);

  useEffect(() => {
    fetch("/api/companies")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch companies");
        }
        return data;
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setCompanies(data);
        } else {
          setCompanies([]);
          console.error("Received non-array data:", data);
        }
        setLoading(false);
        
        if (companyParam && Array.isArray(data)) {
          const found = data.find((c: any) => c.id === companyParam);
          if (found) {
            selectCompany(found);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });

    // Fetch industry suggestions
    fetch("/api/industries")
      .then(res => res.ok ? res.json() : [])
      .then(data => setSuggestedIndustries(data))
      .catch(console.error);

    // Fetch session profile
    fetch("/api/auth/session")
      .then(res => res.ok ? res.json() : null)
      .then(data => setSession(data))
      .catch(console.error);
  }, [companyParam, selectCompany]);

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
      setError(data.error || "Failed to create company");
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
      setError(data.error || "Failed to update company");
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!confirm("Delete this company?")) return;
    
    setError(null);
    const res = await fetch(`/api/companies?id=${id}`, {
      method: "DELETE",
    });
    
    if (res.ok) {
      setCompanies(prev => prev.filter(c => c.id !== id));
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete company");
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
          <Text c="dimmed">Hardening OS Infrastructure...</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <PageShell width="7xl">
      <Stack gap="xl">

        {error && (
          <Notice icon={AlertCircle} title="Synchronization Failure" variant="destructive">
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
            Intelligence FAQ
          </Button>
          {!session && (
            <Button 
              variant="light" 
              color="synthesis" 
              size="compact-sm" 
              leftSection={<LogIn size={14} />}
              onClick={() => router.push("/auth")}
            >
              Sign in with SSO
            </Button>
          )}
        </Group>

        {(canManageCompanies && (companies.length === 0 || showForm)) ? (
          <Card>
            <Stack gap="lg">
              <Title order={3}>{editingId ? "Modify Intelligence Unit" : "Initialize New Unit"}</Title>
              <form onSubmit={editingId ? handleUpdateCompany : handleCreateCompany}>
                <Stack gap="md">
                  <FormInput
                    name="name"
                    label="Company Name"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Enter company name"
                    required
                  />
                  <HashtagMultiSelect
                    label="Strategic Industries"
                    placeholder="Search or add industry tags (e.g. #saas, #ai)"
                    selected={formData.industries}
                    onChange={industries => setFormData({...formData, industries})}
                    suggestions={suggestedIndustries}
                    error={undefined}
                  />
                  <Group gap="sm" mt="lg">
                    <Button type="submit" color="ingress" leftSection={<Plus size={16} />}>
                      {editingId ? "Synchronize" : "Initialize"} Unit
                    </Button>
                    <Button
                      variant="subtle"
                      color="gray"
                      onClick={() => { setEditingId(null); setFormData({ name: "", industry: "", industries: [] }); setShowForm(false); }}
                    >
                      Cancel
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Stack>
          </Card>
        ) : (
          <Stack gap={48}>
            {Array.isArray(companies) && companies.map((c: any) => (
              <Box key={c.id}>
                <Group justify="space-between" mb="md" align="flex-end" style={{ borderBottom: '1px solid var(--surface-section-border)' }}>
                  <Stack gap={4}>
                    <Group gap="sm">
                      <Title 
                        order={2} 
                        onClick={() => router.push(`/${c.id}`)}
                      >
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
                      UNIT ID: {c.id.slice(0, 8)}
                    </Text>
                  </Stack>
                  
                  {canManageCompanies && (
                    <Group gap="xs">
                      <Tooltip label="Edit Unit">
                        <ActionIcon onClick={() => startEdit(c)} variant="light" color="gray" size="lg">
                          <Edit size={18} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Purge Unit">
                        <ActionIcon onClick={() => handleDeleteCompany(c.id)} variant="light" color="review" size="lg">
                          <Trash2 size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>

                <RouteCardGrid>
                  <LinkCard
                    href={`/${c.id}/data`}
                    icon={Database}
                    variant="ingress"
                    metric={c.metrics?.data ?? 0}
                    title="Data"
                    chartData={chartSeries(c.analytics, "sources", "dataIngress")}
                  />
                  <LinkCard
                    href={`/${c.id}/topics`}
                    icon={Layers}
                    variant="synthesis"
                    metric={c.metrics?.topics ?? 0}
                    title="Topics"
                    chartData={chartSeries(c.analytics, "topics", "topicSynthesis")}
                  />
                  <LinkCard
                    href={`/${c.id}/goals`}
                    icon={Target}
                    variant="strategy"
                    metric={c.metrics?.goals ?? 0}
                    title="Goals"
                    chartData={chartSeries(c.analytics, "goals", "strategicGoals", "nba")}
                  />
                  <LinkCard
                    href={`/${c.id}/review`}
                    icon={History}
                    variant="review"
                    metric={c.metrics?.review ?? 0}
                    title="Review"
                    chartData={chartSeries(c.analytics, "reviewGateway", "nba")}
                  />
                  <LinkCard
                    href={`/${c.id}/knowmore`}
                    icon={Sparkles}
                    variant="knowmore"
                    metric={c.metrics?.knowmore ?? 0}
                    title="Knowmore"
                    chartData={chartSeries(c.analytics, "flashcards", "knowmore")}
                  />
                  <LinkCard
                    href={`/${c.id}/tactical`}
                    icon={LayoutDashboard}
                    variant="tactical"
                    metric={c.metrics?.tactical ?? 0}
                    title="Planning"
                    chartData={chartSeries(c.analytics, "tacticalBoard", "nbaItems", "nba")}
                  />
                  <LinkCard
                    href={`/${c.id}/nba`}
                    icon={ListCheck}
                    variant="checklist"
                    metric={c.metrics?.checklist ?? 0}
                    title="Checklist"
                    chartData={chartSeries(c.analytics, "checklist", "nba")}
                  />
                </RouteCardGrid>
              </Box>
            ))}

            {!canManageCompanies && companies.length === 0 && (
              <EmptyState
                icon={Database}
                tone="ingress"
                title="No intelligence units are currently provisioned"
                description="This account does not yet have an active operating unit."
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
              Provision New Intelligence Unit
            </Button>
          </Box>
        )}
      </Stack>
    </PageShell>
  );
}
