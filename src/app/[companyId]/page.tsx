import { Suspense } from "react";
import CompanyDashboard from "./company-dashboard";

export default function CompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>}>
      <CompanyDashboard params={params} />
    </Suspense>
  );
}