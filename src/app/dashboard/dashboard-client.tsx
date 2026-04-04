import { Suspense } from "react";
import DashboardClient from "./dashboard-client";

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>}>
      <DashboardClient />
    </Suspense>
  );
}