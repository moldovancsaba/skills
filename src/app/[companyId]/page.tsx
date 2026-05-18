import { Suspense } from "react";
import CompanyDashboard from "./company-dashboard";
import { Center, Loader, Stack } from "@mantine/core";
import { Text } from "@/components/ui/typography";
import { redirect } from "next/navigation";
import { getDashboardInitialData } from "@/lib/server-company-page-data";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const initialData = await getDashboardInitialData(companyId);
  if (!initialData) {
    redirect("/");
  }

  return (
    <Suspense 
      fallback={
        <Center h="100vh">
          <Stack align="center" gap="md">
            <Loader size="xl" variant="bars" color="ingress" />
            <Text size="sm"  c="dimmed">
              Initializing Intelligence Dashboard...
            </Text>
          </Stack>
        </Center>
      }
    >
      <CompanyDashboard companyId={companyId} initialData={initialData} />
    </Suspense>
  );
}
