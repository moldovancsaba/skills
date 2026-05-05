import { Metadata } from "next";
import { Container, Title, Text, Stack, Box, Divider } from "@mantine/core";

export const metadata: Metadata = {
  title: "Terms of Service - checklist",
};

export default function TermsPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <Box>
          <Title order={1} mb="xs">Terms of Service</Title>
          <Text size="sm" c="dimmed">Last updated: April 2025</Text>
        </Box>

        <Stack gap="lg">
          <Box>
            <Title order={2} size="h4" mb={4}>Acceptable Use</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              You agree to use checklist only for lawful business purposes. 
              You are responsible for all activity under your account.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>Data Ownership</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              You retain ownership of all data you input. By using our service, 
              you grant us permission to process your data to provide AI-generated 
              recommendations.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>AI Service</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              Our AI generates marketing recommendations based on your data. 
              Recommendations are suggestions only - you are responsible for evaluating 
              and implementing them.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>Service Availability</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              We strive to keep the service available 24/7 but do not guarantee 
              uptime. The local AI sync runs every 5 minutes.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>Disclaimer</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              checklist provides AI-generated suggestions for marketing purposes only. 
              We do not guarantee the accuracy or effectiveness of any recommendations.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>Changes to Terms</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              We may update these terms at any time. Continued use constitutes 
              acceptance of updated terms.
            </Text>
          </Box>
        </Stack>
      </Stack>
    </Container>
  );
}