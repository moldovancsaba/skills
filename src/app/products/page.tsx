'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import { Button } from "@/components/ui/button";

export default function ProductsPage() {
  const { company, products, setProducts } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    pricing: "",
    features: "",
  });

  useEffect(() => {
    if (company) {
      fetch(`/api/products?companyId=${company.id}`)
        .then((res) => res.json())
        .then(setProducts)
        .catch(console.error);
    }
  }, [company, setProducts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company?.id,
          ...formData,
          features: formData.features.split(",").map(f => f.trim()),
        }),
      });
      const res = await fetch(`/api/products?companyId=${company?.id}`);
      setProducts(await res.json());
      setShowForm(false);
      setFormData({ name: "", description: "", pricing: "", features: "" });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="container">
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between" }}>
        <Link href="/dashboard">← Back to Dashboard</Link>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Product"}
        </Button>
      </header>

      <h1>Products & Services</h1>

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
            <FormTextarea
              name="description"
              label="Description"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
            <FormInput
              name="pricing"
              label="Pricing"
              value={formData.pricing}
              onChange={e => setFormData({ ...formData, pricing: e.target.value })}
            />
            <FormInput
              name="features"
              label="Features (comma separated)"
              value={formData.features}
              onChange={e => setFormData({ ...formData, features: e.target.value })}
              placeholder="feature 1, feature 2"
            />
            <Button type="submit">Save Product</Button>
          </form>
        </div>
      )}

      {products.length === 0 ? (
        <p>No products yet. Add your first product!</p>
      ) : (
        <div className="products-list">
          {products.map((product: any) => (
            <div key={product.id} className="card" style={{ marginBottom: "1rem" }}>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <p><strong>Pricing:</strong> {product.pricing}</p>
              {product.features.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  {product.features.map((f: string, i: number) => (
                    <span key={i} style={{ background: "#e5e7eb", padding: "0.25rem 0.5rem", borderRadius: "4px", marginRight: "0.5rem", fontSize: "0.875rem" }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
