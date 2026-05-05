'use client';

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitBranch, FileText, Lightbulb, CheckSquare, X } from "lucide-react";
import { 
  Box, 
  Stack, 
  Group, 
  Title, 
  Text, 
  ActionIcon, 
  ThemeIcon, 
  Loader, 
  Center,
  rem,
  ScrollArea
} from "@mantine/core";

interface TraceNode {
  id: string;
  type: 'SOURCE' | 'FLASHCARD' | 'TASK';
  title: string;
  timestamp: string;
}

/**
 * INTELLIGENCE TRACE VIEWER (Phase 4)
 * v0.14.0-PRODUCTION
 * 
 * Visualizes the provenance chain of an intelligence unit.
 */
export function TraceViewer({ 
  versionFamilyId, 
  onClose 
}: { 
  versionFamilyId: string; 
  onClose: () => void 
}) {
  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrace() {
      setLoading(true);
      try {
        const res = await fetch(`/api/trace?familyId=${versionFamilyId}`);
        const data = await res.json();
        setNodes(data);
      } catch (e) {
        console.error("Trace fetch failed", e);
      } finally {
        setLoading(false);
      }
    }

    if (versionFamilyId) fetchTrace();
  }, [versionFamilyId]);

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: 20 }}
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        right: 0,
        width: rem(400),
        backgroundColor: 'var(--mantine-color-body)',
        borderLeft: '1px solid var(--mantine-color-default-border)',
        boxShadow: 'var(--mantine-shadow-xl)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
      p="xl"
    >
      <Stack gap="xl" h="100%">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon variant="light" color="indigo" radius="md" size="lg">
              <GitBranch size={20} />
            </ThemeIcon>
            <Title order={2} size="h4" fw={900} lts={-0.5}>Intelligence Lineage</Title>
          </Group>
          <ActionIcon variant="subtle" color="gray" onClick={onClose}>
            <X size={20} />
          </ActionIcon>
        </Group>

        <Box style={{ flex: 1, position: 'relative' }}>
          {/* Vertical Connecting line */}
          <Box 
            style={{ 
              position: 'absolute', 
              left: 17, 
              top: 20, 
              bottom: 20, 
              width: 2, 
              backgroundColor: 'var(--mantine-color-default-border)',
              opacity: 0.5
            }} 
          />

          <ScrollArea h="100%" offsetScrollbars>
            <Stack gap={40} py="md">
              {loading ? (
                <Center h={200}>
                  <Loader variant="bars" color="brand" size="lg" />
                </Center>
              ) : nodes.map((node) => (
                <Group key={node.id} wrap="nowrap" align="flex-start" gap="lg" style={{ position: 'relative', zIndex: 1 }}>
                  <ThemeIcon 
                    variant="filled" 
                    color={node.type === 'SOURCE' ? 'gray' : node.type === 'FLASHCARD' ? 'orange' : 'indigo'} 
                    radius="xl" 
                    size={36}
                    style={{ 
                      boxShadow: '0 0 0 4px var(--mantine-color-body)'
                    }}
                  >
                    {node.type === 'SOURCE' && <FileText size={18} />}
                    {node.type === 'FLASHCARD' && <Lightbulb size={18} />}
                    {node.type === 'TASK' && <CheckSquare size={18} />}
                  </ThemeIcon>
                  
                  <Stack gap={2}>
                    <Text size="10px" fw={900} tt="uppercase" lts={2} c="dimmed">
                      {node.type} • {new Date(node.timestamp).toLocaleTimeString()}
                    </Text>
                    <Text size="sm" fw={700} style={{ lineHeight: 1.4 }}>
                      {node.title}
                    </Text>
                  </Stack>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Box>

        <Box 
          p="md" 
          style={{ 
            borderRadius: 'var(--mantine-radius-md)',
            backgroundColor: 'var(--mantine-color-default-hover)',
            border: '1px solid var(--mantine-color-default-border)'
          }}
        >
          <Text size="xs" c="dimmed" fw={500} style={{ lineHeight: 1.6, fontStyle: 'italic' }}>
            This trace visualizes the autonomous transformation from raw market evidence into strategic action cards.
          </Text>
        </Box>
      </Stack>
    </Box>
  );
}
