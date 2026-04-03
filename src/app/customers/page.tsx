'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";

export default function CustomersPage() {
  const { company, customers, setCustomers } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    segments: "",
    painPoints: "",
    channels: "",
    lifetimeValue: "",
  });

  useEffect(() => {
    if (company) {
      fetch(`/api/customers?companyId=${company.id}`)
        .then(res => res.json())
        .then(setCustomers)
        .catch(console.error);
    }
  }, [company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company?.id,
          name: formData.name,
          email: formData.email,
          segments: formData.segments.split(",").map(s => s.trim()),
          painPoints: formData.painPoints.split(",").map(p => p.trim()),
          channels: formData.channels.split(",").map(c => c.trim()),
          lifetimeValue: parseFloat(formData.lifetimeValue) || 0,
        }),
      });
      const res = await fetch(`/api/customers?companyId=${company?.id}`);
      setCustomers(await res.json());
      setShowForm(false);
      setFormData({ name: "", email: "", segments: "", painPoints: "", channels: "", lifetimeValue: "" });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="container">
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between" }}>
        <Link href="/dashboard">← Back to Dashboard</Link>
        <button className="button button-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Customer Data"}
        </button>
      </header>

      <h1>Customers</h1>

      {showForm && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label">Name</label>
              <input className="input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input className="input" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Segments (comma separated)</label>
              <input className="input" value={formData.segments} onChange={e => setFormData({ ...formData, segments: e.target.value })} placeholder="enterprise, smb, startup" />
            </div>
            <div className="form-group">
              <label className="label">Pain Points (comma separated)</label>
              <input className="input" value={formData.painPoints} onChange={e => setFormData({ ...formData, painPoints: e.target.value })} placeholder="cost, time, complexity" />
            </div>
            <div className="form-group">
              <label className="label">Channels (comma separated)</label>
              <input className="input" value={formData.channels} onChange={e => setFormData({ ...formData, channels: e.target.value })} placeholder="email, social, referral" />
            </div>
            <div className="form-group">
              <label className="label">Lifetime Value ($)</label>
              <input className="input" type="number" value={formData.lifetimeValue} onChange={e => setFormData({ ...formData, lifetimeValue: e.target.value })} />
            </div>
            <button type="submit" className="button button-primary">Save Customer</button>
          </form>
        </div>
      )}

      {customers.length === 0 ? (
        <p>No customer data yet. Add your first customer!</p>
      ) : (
        <div className="customers-list">
          {customers.map((customer: any) => (
            <div key={customer.id} className="card" style={{ marginBottom: "1rem" }}>
              <h3>{customer.name}</h3>
              <p>{customer.email}</p>
              <p><strong>Segments:</strong> {customer.segments.join(", ")}</p>
              <p><strong>Pain Points:</strong> {customer.painPoints.join(", ")}</p>
              <p><strong>LTV:</strong> ${customer.lifetimeValue}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}