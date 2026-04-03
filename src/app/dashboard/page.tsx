'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";

export default function Dashboard() {
  const { company, nbaItems, isLoading, setCompany, setNbaItems, setLoading } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    industry: "",
    description: "",
    targetMarket: "",
    mainGoal: "",
  });

  useEffect(() => {
    fetch("/api/companies")
      .then(res => res.json())
      .then(data => {
        if (data.length > 0) {
          setCompany(data[0]);
          fetchNbaItems(data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const fetchNbaItems = (companyId: string) => {
    fetch(`/api/nba?companyId=${companyId}`)
      .then(res => res.json())
      .then(setNbaItems)
      .catch(console.error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      const newCompany = await res.json();
      setCompany(newCompany);
      setShowForm(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <div className="container"><p>Loading...</p></div>;
  }

  if (!company && !showForm) {
    return (
      <div className="container">
        <div className="card">
          <h1>Welcome to Checklist</h1>
          <p>Set up your company to get started with AI-powered marketing recommendations.</p>
          <button className="button button-primary" onClick={() => setShowForm(true)}>
            Set Up Company
          </button>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="container">
        <div className="card">
          <h1>Set Up Your Company</h1>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label">Company Name</label>
              <input
                className="input"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Industry</label>
              <input
                className="input"
                value={formData.industry}
                onChange={e => setFormData({ ...formData, industry: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="label">Description</label>
              <textarea
                className="input"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="label">Target Market</label>
              <input
                className="input"
                value={formData.targetMarket}
                onChange={e => setFormData({ ...formData, targetMarket: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="label">Main Goal</label>
              <select
                className="input"
                value={formData.mainGoal}
                onChange={e => setFormData({ ...formData, mainGoal: e.target.value })}
              >
                <option value="">Select a goal</option>
                <option value="GROW_REVENUE">Grow Revenue</option>
                <option value="LAUNCH_PRODUCT">Launch Product</option>
                <option value="ENTER_NEW_MARKET">Enter New Market</option>
                <option value="BUILD_AWARENESS">Build Awareness</option>
                <option value="GENERATE_LEADS">Generate Leads</option>
              </select>
            </div>
            <button type="submit" className="button button-primary">Save Company</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>{company?.name}</h1>
          <p>{company?.industry} • {company?.mainGoal}</p>
        </div>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/products" className="button button-secondary">Products</Link>
          <Link href="/customers" className="button button-secondary">Customers</Link>
          <Link href="/competitors" className="button button-secondary">Competitors</Link>
        </nav>
      </header>

      <section>
        <h2>Next Best Actions</h2>
        {nbaItems.length === 0 ? (
          <p>Add products, customers, and competitors to get NBA recommendations.</p>
        ) : (
          <div className="checklist">
            {nbaItems.map(item => (
              <NBAItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NBAItemCard({ item }: { item: any }) {
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [annotation, setAnnotation] = useState("");

  const handleAction = async (action: string) => {
    if (action === "DECLINE" && !annotation) {
      setShowDeclineModal(true);
      return;
    }

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nbaItemId: item.id,
          action,
          annotation: action === "DECLINE" ? annotation : null,
        }),
      });
      window.location.reload();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <small>Priority: {Math.round(item.iceScore)}</small>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="button button-primary" onClick={() => handleAction("ACCEPT")}>
            Accept
          </button>
          <button className="button button-secondary" onClick={() => handleAction("DECLINE")}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}