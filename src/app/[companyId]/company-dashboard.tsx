'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import { Brain, Package, Plus, Users, Search, Sparkles, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  LinkCard,
  MetricCard,
  MetricGrid,
  PageHeader,
  PageShell,
} from "@/components/ui/app-shell";

export default function CompanyDashboard() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { company, setCompany, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        const found = companies.find((c: any) => c.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);

        const [p, c, r] = await Promise.all([
          fetch(`/api/products?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/customers?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/competitors?companyId=${found.id}`).then((res) => res.json()),
        ]);

        setProducts(p);
        setCustomers(c);
        setCompetitors(r);
        setLoading(false);
      } catch (error) {
        console.error(error);
      }
    };

    fetchCompany(companyId);
  }, [companyId, router, setCompany, setProducts, setCustomers, setCompetitors]);

  const stats = [
    { label: "Products", value: products.length, icon: Package, color: "text-blue-500" },
    { label: "Customers", value: customers.length, icon: Users, color: "text-green-500" },
    { label: "Competitors", value: competitors.length, icon: Search, color: "text-purple-500" },
  ];

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="7xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title={company?.name ?? "Company"}
          description="Use raw data, knowledge flashcards, and tasks as separate system layers."
          backHref="/"
          backLabel="Switch company"
        />
      </motion.div>

      <MetricGrid>
        {stats.map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <MetricCard
              icon={stat.icon}
              iconClassName={stat.color}
              label={stat.label}
              value={stat.value}
            />
          </motion.div>
        ))}
      </MetricGrid>

      <div className="grid gap-4 md:grid-cols-3">
        <LinkCard
          href={`/${companyId}/data`}
          icon={Plus}
          title="Data Collection"
          description="Add raw products, customers, and competitors without processing the source itself."
        />
        <LinkCard
          href={`/${companyId}/nba`}
          icon={Brain}
          title="Recommendations"
          description="Review tasks generated from the current flashcard layer."
        />
        <LinkCard
          href={`/${companyId}/knowmore`}
          icon={Sparkles}
          title="Knowmore"
          description="Inspect the processed knowledge layer behind the AI outputs."
        />
      </div>

      <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8">
        <Button
          onClick={() => router.push(`/${companyId}/data`)}
          size="lg"
          className="rounded-full shadow-lg"
        >
          <Zap className="w-5 h-5" />
          <span className="font-medium">Quick Add</span>
        </Button>
      </div>
    </PageShell>
  );
}
