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
  SimpleGrid, 
  Loader, 
  Alert,
  ThemeIcon
} from "@mantine/core";
import { Plus, ListOrdered, Sparkles, Zap, Edit, Trash2, HelpCircle, LogIn, AlertCircle, Database, Target, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-fields";
import { HashtagMultiSelect } from "@/components/ui/hashtag-multi-select";
import { LinkCard, UnifiedGrid, PageHeader, PageShell } from "@/components/ui/app-shell";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme-provider";
import { useState, useEffect, useCallback } from "react";

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
      <Box style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
        <Stack align="center" gap="md" w="100%">
          <Loader color="brand" size="lg" />
          <Text size="sm" fw={700} c="dimmed">Hardening OS Infrastructure...</Text>
        </Stack>
      </Box>
    );
  }

  return (
    <PageShell width="7xl">
      <Stack gap="xl">
        <Group justify="space-between" align="center">
          <PageHeader 
            title="Sovereign Portfolio" 
            description="Select an intelligence unit to operate." 
          />
          {session && (
            <Badge 
              variant="dot" 
              color="brand" 
              size="lg" 
              radius="md"
              styles={{ root: { backgroundColor: 'var(--mantine-color-dark-6)', border: '1px solid var(--mantine-color-dark-4)' } }}
            >
              System Operator: {session.email}
            </Badge>
          )}
        </Group>

        {error && (
          <Alert icon={<AlertCircle size={16} />} title="Synchronization Failure" color="red" radius="md" variant="light">
            {error}
          </Alert>
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
              color="indigo" 
              size="compact-sm" 
              leftSection={<LogIn size={14} />}
              onClick={() => router.push("/auth")}
            >
              Sign in with SSO
            </Button>
          )}
        </Group>

        {(canManageCompanies && (companies.length === 0 || showForm)) ? (
          <Card p="xl">
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
                    <Button type="submit" color="brand" leftSection={<Plus size={16} />}>
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
                <Group justify="space-between" mb="md" align="flex-end" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', paddingBottom: 'var(--mantine-spacing-md)' }}>
                  <Stack gap={4}>
                    <Group gap="sm">
                      <Title 
                        order={2} 
                        size="h2" 
                        fw={900} 
                        style={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/${c.id}`)}
                      >
                        {c.name}
                      </Title>
                      <Group gap={6}>
                        {c.industries?.map((tag: string) => (
                          <Badge key={tag} variant="outline" color="brand" size="xs">
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                    </Group>
                    <Text size="xs" ff="monospace" c="dimmed" tt="uppercase" lts={1}>
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
                        <ActionIcon onClick={() => handleDeleteCompany(c.id)} variant="light" color="red" size="lg">
                          <Trash2 size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>

                <UnifiedGrid className="md:grid-cols-4">
                  <LinkCard
                    href={`/${c.id}/data`}
                    icon={Database}
                    variant="gray"
                    metric={c.metrics?.data ?? 0}
                    title="Data Ingress"
                    description="Raw sources & harvesting"
                  />
                  <LinkCard
                    href={`/${c.id}/topics`}
                    icon={ListTodo}
                    variant="indigo"
                    metric={c.metrics?.topics ?? 0}
                    title="Topics"
                    description="Prioritize AI synthesis"
                  />
                  <LinkCard
                    href={`/${c.id}/knowmore`}
                    icon={Sparkles}
                    variant="knowledge"
                    metric={c.metrics?.knowmore ?? 0}
                    title="Knowmore"
                    description="Intelligence knowledge layer"
                  />
                  <LinkCard
                    href={`/${c.id}/nba`}
                    icon={Zap}
                    variant="brand"
                    metric={c.metrics?.checklist ?? 0}
                    title="checklist"
                    description="High-impact strategic actions"
                  />
                </UnifiedGrid>
              </Box>
            ))}

            {!canManageCompanies && companies.length === 0 && (
              <Card p="xl" radius="lg" withBorder ta="center" bg="var(--mantine-color-dark-8)">
                <Text size="sm" c="dimmed" fs="italic">
                  No intelligence units are currently provisioned for this account.
                </Text>
              </Card>
            )}
          </Stack>
        )}

        {canManageCompanies && !showForm && (
          <Box pt="xl" style={{ borderTop: '1px solid var(--mantine-color-dark-6)' }}>
            <Button 
              onClick={() => setShowForm(true)} 
              variant="subtle" 
              color="brand"
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
