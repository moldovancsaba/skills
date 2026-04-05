'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import { Button } from "@/components/ui/button";

export default function CompetitorsPage() {
  const { company, competitors, setCompetitors } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    urls: "",
    pricing: "",
    strengths: "",
    weaknesses: "",
    positioning: "",
  });

  useEffect(() => {
    if (company) {
      fetch(`/api/competitors?companyId=${company.id}`)
        .then((res) => res.json())
        .then(setCompetitors)
        .catch(console.error);
    }
  }, [company, setCompetitors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company?.id,
          name: formData.name,
          urls: formData.urls.split(",").map(u => u.trim()).filter(Boolean),
          pricing: formData.pricing,
          strengths: formData.strengths.split(",").map(s => s.trim()),
          weaknesses: formData.weaknesses.split(",").map(w => w.trim()),
          positioning: formData.positioning,
        }),
      });
      const res = await fetch(`/api/competitors?companyId=${company?.id}`);
      setCompetitors(await res.json());
      setShowForm(false);
      setFormData({ name: "", urls: "", pricing: "", strengths: "", weaknesses: "", positioning: "" });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="container">
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between" }}>
        <Link href="/dashboard">← Back to Dashboard</Link>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Competitor"}
        </Button>
      </header>

      <h1>Competitors</h1>

      {showForm && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <form onSubmit={handleSubmit}>
            <FormInput
              name="name"
              label="Name"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <FormInput
              name="urls"
              label="URLs (comma separated)"
              value={formData.urls}
              onChange={e => setFormData({ ...formData, urls: e.target.value })}
              placeholder="https://..."
            />
            <FormInput
              name="pricing"
              label="Pricing"
              value={formData.pricing}
              onChange={e => setFormData({ ...formData, pricing: e.target.value })}
            />
            <FormInput
              name="strengths"
              label="Strengths (comma separated)"
              value={formData.strengths}
              onChange={e => setFormData({ ...formData, strengths: e.target.value })}
              placeholder="feature 1, feature 2"
            />
            <FormInput
              name="weaknesses"
              label="Weaknesses (comma separated)"
              value={formData.weaknesses}
              onChange={e => setFormData({ ...formData, weaknesses: e.target.value })}
              placeholder="limitation 1, limitation 2"
            />
            <FormTextarea
              name="positioning"
              label="Positioning"
              value={formData.positioning}
              onChange={e => setFormData({ ...formData, positioning: e.target.value })}
            />
            <Button type="submit">Save Competitor</Button>
          </form>
        </div>
      )}

      {competitors.length === 0 ? (
        <p>No competitors yet. Add your first competitor!</p>
      ) : (
        <div className="competitors-list">
          {competitors.map((competitor: any) => (
            <div key={competitor.id} className="card" style={{ marginBottom: "1rem" }}>
              <h3>{competitor.name}</h3>
              <p><strong>Pricing:</strong> {competitor.pricing}</p>
              <p><strong>Strengths:</strong> {competitor.strengths.join(", ")}</p>
              <p><strong>Weaknesses:</strong> {competitor.weaknesses.join(", ")}</p>
              <p><strong>Positioning:</strong> {competitor.positioning}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
