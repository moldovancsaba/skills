import { Metadata } from "next";
import { Container, Title, Text, Stack, Box, Divider } from "@mantine/core";

export const metadata: Metadata = {
  title: "Privacy Policy - checklist",
};

export default function PrivacyPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <Box>
          <Title order={1} mb="xs">Privacy Policy</Title>
          <Text size="sm" c="dimmed">Last updated: April 2025</Text>
        </Box>

        <Stack gap="lg">
          <Box>
            <Title order={2} size="h4" mb={4}>Data We Collect</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              We collect company information, product details, customer data, and competitor 
              intelligence that you voluntarily provide. We also collect usage data to improve 
              our service.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>How We Use Data</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              Your data is used to generate marketing recommendations (Next Best Actions) 
              tailored to your business. All AI processing is performed locally using 
              Ollama - no data is sent to external AI services.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>Data Storage</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              Data is stored in MongoDB Atlas. Local sync runs on mvp-factory-control 
              for AI processing. We implement industry-standard security measures.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>Your Rights</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              You may request deletion of your data at any time. Contact us to exercise 
              your data subject access requests.
            </Text>
          </Box>

          <Divider variant="dotted" />

          <Box>
            <Title order={2} size="h4" mb={4}>Contact</Title>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              For privacy questions, contact us through the app.
            </Text>
          </Box>
        </Stack>
      </Stack>
    </Container>
  );
}