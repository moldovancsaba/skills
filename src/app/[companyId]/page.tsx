import CompanyDashboard from "./company-dashboard";
import { CompareHome } from "@/components/compare-home";
import { Center, Loader, Stack } from "@/components/gds/primitives";
import { Text } from "@/components/ui/typography";
import { getDashboardInitialData } from "@/lib/server-company-page-data";
import { resolveFirstSupportedDestinationKey } from "@/lib/destination-scope";

export default async function CompanyPage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const initialData = companyId ? await getDashboardInitialData(companyId) : null;
  const enabledMiniapps = Array.isArray(initialData?.enabledMiniapps) ? initialData.enabledMiniapps : [];
  const firstEnabledMiniapp = resolveFirstSupportedDestinationKey(enabledMiniapps);

  if (firstEnabledMiniapp === "compare") {
    return <CompareHome companyId={companyId} />;
  }

  if (initialData?.webappProfile === "COMPARE") {
    return <CompareHome companyId={companyId} />;
  }

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
