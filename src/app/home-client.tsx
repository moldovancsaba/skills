'use client';

import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/ui/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-fields";
import { HashtagMultiSelect } from "@/components/ui/hashtag-multi-select";
import { Badge } from "@/components/ui/badge";

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
      setFormData({ name: "", industry: "", industries: [] });
      setEditingId(null);
      fetch("/api/companies")
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setCompanies(data);
        });
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
      fetch("/api/companies")
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setCompanies(data);
        });
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
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="7xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-2">
          <PageHeader title="Select Company" />
          {session && (
            <Badge variant="outline" className="px-3 py-1 bg-primary/5 text-primary border-primary/20 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] font-medium lowercase">Logged in as {session.email}</span>
            </Badge>
          )}
        </div>
      </motion.div>

      {error && (
        <div className="mb-4 p-4 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
          <p className="font-semibold">Error</p>
          <p>{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <div className="flex items-center gap-4">
          <Link href="/faq" className="text-sm text-muted-foreground hover:text-foreground">
            FAQ
          </Link>
          <Link href="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in with SSO
          </Link>
        </div>
      </div>

      {session ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 shadow-elevated"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-sky-500/15 via-orange-400/10 to-violet-500/15" />
          <div className="relative">
            <div className="relative h-[18rem] w-full overflow-hidden md:h-[24rem]">
              <Image
                src="/images/hero.png"
                alt="Checklist hero"
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center px-4">
                <div className="w-full rounded-[1.75rem] border border-white/20 bg-slate-950/55 px-6 py-8 text-center text-white shadow-2xl backdrop-blur-md md:w-[70%] md:px-10 xl:w-1/2">
                  <p className="text-sm font-semibold uppercase tracking-[0.35em] text-sky-200">Checklist OS</p>
                  <h2 className="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
                    AI-Powered
                    <br />
                    Marketing Intelligence
                  </h2>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      ) : null}

      {(canManageCompanies && (companies.length === 0 || showForm)) ? (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={editingId ? handleUpdateCompany : handleCreateCompany} className="space-y-4">
              <FormInput
                name="name"
                label="Company Name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Enter company name"
                required
              />
              <HashtagMultiSelect
                label="Industries"
                placeholder="Search or add industry tags (e.g. #saas, #ai)"
                selected={formData.industries}
                onChange={industries => setFormData({...formData, industries})}
                suggestions={suggestedIndustries}
                error={undefined}
              />
              <div className="flex gap-2">
                <Button type="submit">
                  {editingId ? "Update" : "Create"} Company
                </Button>
                {editingId && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { setEditingId(null); setFormData({ name: "", industry: "", industries: [] }); setShowForm(false); }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {Array.isArray(companies) && companies.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="flex items-center gap-2 p-4">
                <Button
                  onClick={() => selectCompany(c)}
                  variant="ghost"
                  className="h-auto flex-1 justify-between px-0 py-0 text-left hover:bg-transparent"
                >
                  <div>
                    <p className="font-medium text-lg">{c.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.industries?.length > 0 ? (
                        c.industries.map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px] bg-primary/5 text-primary border-primary/10">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No industries set</span>
                      )}
                    </div>
                  </div>
                  <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {c.id.slice(0,8)}
                  </span>
                </Button>
                {canManageCompanies && (
                  <>
                    <Button onClick={() => startEdit(c)} variant="outline" size="sm">
                      Edit
                    </Button>
                    <Button onClick={() => handleDeleteCompany(c.id)} variant="destructive" size="sm">
                      Delete
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
          {!canManageCompanies && companies.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No companies are available for this account yet.
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {canManageCompanies && (
        <div className="pt-4 border-t">
          <Button onClick={() => setShowForm(true)} variant="link" className="px-0">
            + Create new company
          </Button>
        </div>
      )}
    </PageShell>
  );
}
