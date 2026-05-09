import Link from "next/link";
import { IconArrowRight as ArrowRight, IconBulb as Lightbulb, IconRoute as Route } from "@tabler/icons-react";
import { Badge, Button, Group, Stack, Box, ThemeIcon, Alert } from "@mantine/core";
import { getSemanticInsetStyle } from "@/lib/semantic-theme";
import { BodyText, MetaText } from "@/components/ui/typography";

import type { ExpertTip } from "@/content/help";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardActions 
} from "@/components/ui/unified-card";

type ExpertTipCardProps = {
  tip: ExpertTip;
};

export function ExpertTipCard({ tip }: ExpertTipCardProps) {
  return (
    <UnifiedCard tone="synthesis" layoutStyle={{ height: "100%" }}>
      <UnifiedCardHeader
        supporting={
          <Group gap="xs">
            <ThemeIcon variant="light" color="synthesis" size="lg" >
              <Lightbulb size={18} />
            </ThemeIcon>
            <Badge variant="outline" color="synthesis" size="sm"  >
              {tip.category}
            </Badge>
          </Group>
        }
        title={tip.title}
        description={tip.body}
      />
      
      <UnifiedCardBody>
          <Alert 
            icon={<Route size={16} />} 
            title="Strategic Rationale" 
            color="synthesis" 
            variant="light"
          >
          {tip.whyItMatters}
        </Alert>

        {tip.samplePhrases && tip.samplePhrases.length > 0 && (
          <Stack gap="xs">
            <MetaText>Suggested Phrasing</MetaText>
            <Stack gap={6}>
              {tip.samplePhrases.map((phrase) => (
                <Box 
                  key={phrase} 
                  p="xs" 
                  style={getSemanticInsetStyle("synthesis")}
                >
                  <BodyText c="dimmed">“{phrase}”</BodyText>
                </Box>
              ))}
            </Stack>
          </Stack>
        )}
      </UnifiedCardBody>

      <UnifiedCardActions>
        <Button 
          component={Link} 
          href={tip.ctaHref} 
          color="synthesis" 
          size="sm" 
          rightSection={<ArrowRight size={14} />}
        >
          {tip.ctaLabel}
        </Button>
        <Button 
          component={Link} 
          href="/faq" 
          variant="subtle" 
          color="gray" 
          size="sm"
        >
          FAQ
        </Button>
      </UnifiedCardActions>
    </UnifiedCard>
  );
}
