'use client';

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/ui/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { FormInput, FormSelect } from "@/components/ui/form-fields";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCompany, setProducts, setCustomers, setCompetitors } = useStore();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", industry: "" });

  const companyParam = searchParams.get("company");

  const selectCompany = useCallback((company: any) => {
    setCompany(company);
    setProducts([]);
    setCustomers([]);
    setCompetitors([]);
    router.push(`/${company.id}`);
  }, [router, setCompany, setProducts, setCustomers, setCompetitors]);

  useEffect(() => {
    setError(null);
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
      setFormData({ name: "", industry: "" });
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
      setFormData({ name: "", industry: "" });
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
    setFormData({ name: c.name, industry: c.industry || "" });
    setEditingId(c.id);
    setShowForm(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="md">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader title="Select Company" />
      </motion.div>

      {error && (
        <div className="mb-4 p-4 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
          <p className="font-semibold">Error</p>
          <p>{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <div className="flex items-center gap-4">
          <Link href="/manual" className="text-sm text-muted-foreground hover:text-foreground">
            Manual
          </Link>
          <Link href="/faq" className="text-sm text-muted-foreground hover:text-foreground">
            FAQ
          </Link>
          <Link href="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in with SSO
          </Link>
        </div>
      </div>

      {(companies.length === 0 || showForm) ? (
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
              <FormSelect
                name="industry"
                label="Industry"
                value={formData.industry}
                onChange={e => setFormData({...formData, industry: e.target.value})}
                options={[
                  { value: "", label: "Select industry" },
                  { value: "SaaS", label: "SaaS" },
                  { value: "E-commerce", label: "E-commerce" },
                  { value: "Healthcare", label: "Healthcare" },
                  { value: "Finance", label: "Finance" },
                  { value: "Education", label: "Education" },
                  { value: "Retail", label: "Retail" },
                  { value: "Technology", label: "Technology" },
                  { value: "Manufacturing", label: "Manufacturing" },
                  { value: "Other", label: "Other" },
                ]}
              />
              <div className="flex gap-2">
                <Button type="submit">
                  {editingId ? "Update" : "Create"} Company
                </Button>
                {editingId && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { setEditingId(null); setFormData({ name: "", industry: "" }); setShowForm(false); }}
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
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.industry}</p>
                  </div>
                  <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {c.id.slice(0,8)}
                  </span>
                </Button>
                <Button onClick={() => startEdit(c)} variant="outline" size="sm">
                  Edit
                </Button>
                <Button onClick={() => handleDeleteCompany(c.id)} variant="destructive" size="sm">
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="pt-4 border-t">
        <Button onClick={() => setShowForm(true)} variant="link" className="px-0">
          + Create new company
        </Button>
      </div>
    </PageShell>
  );
}
