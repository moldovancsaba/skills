import { Suspense } from "react";
import CompanyDashboard from "./company-dashboard";
import { Center, Loader, Stack } from "@mantine/core";
import { Text } from "@/components/ui/typography";

export default function CompanyPage() {
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
      <CompanyDashboard />
    </Suspense>
  );
}
