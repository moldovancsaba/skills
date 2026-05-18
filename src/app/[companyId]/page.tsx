import CompanyDashboard from "./company-dashboard";
import { Center, Loader, Stack } from "@mantine/core";
import { Text } from "@/components/ui/typography";
import { getDashboardInitialData } from "@/lib/server-company-page-data";

export default async function CompanyPage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const initialData = companyId ? await getDashboardInitialData(companyId) : null;

  return (
    <CompanyDashboard
      companyId={companyId}
      initialData={initialData}
      fallback={
        <Center h="100vh">
          <Stack align="center" gap="md">
            <Loader size="xl" variant="bars" color="ingress" />
            <Text size="sm" c="dimmed">
              Initializing Intelligence Dashboard...
            </Text>
          </Stack>
        </Center>
      }
    />
  );
}
