'use client';

import { 
  Stack, 
  Group, 
  Text, 
  Avatar, 
  ActionIcon, 
  Tooltip, 
  Badge, 
  Box, 
  ThemeIcon,
  Loader,
  Transition
} from "@mantine/core";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody 
} from "@/components/ui/unified-card";
import { FormInput } from "@/components/ui/form-fields";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Trash2, Shield, User as UserIcon, Mail } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

export function MemberList({ companyId, isOwner }: { companyId: string; isOwner: boolean }) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (err) {
      console.error("Failed to fetch members", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setInviting(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role: "MEMBER" }),
      });

      if (res.ok) {
        setEmail("");
        fetchMembers();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add member");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this member?")) return;

    try {
      const res = await fetch(`/api/companies/${companyId}/members?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchMembers();
      }
    } catch (err) {
      console.error("Failed to remove member", err);
    }
  };

  if (loading) {
    return (
      <UnifiedCard className="h-full">
        <Stack align="center" justify="center" h={200}>
          <Loader color="brand" size="sm" />
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={1}>Syncing Permissions...</Text>
        </Stack>
      </UnifiedCard>
    );
  }

  return (
    <UnifiedCard className="h-full">
      <UnifiedCardHeader
        supporting={
          <Group gap="xs">
            <ThemeIcon variant="light" color="gray" size="lg" radius="md">
              <Users size={18} />
            </ThemeIcon>
            <Badge variant="outline" color="gray" size="sm" tt="uppercase" fw={800}>
              Access Control
            </Badge>
          </Group>
        }
        title="Intelligence Team"
        description="Manage secure access to this intelligence unit."
      />

      <UnifiedCardBody>
        <Stack gap="xl">
          {isOwner && (
            <form onSubmit={handleInvite}>
              <Stack gap="xs">
                <Group gap="xs" align="flex-end">
                  <Box style={{ flex: 1 }}>
                    <FormInput
                      placeholder="operator@checklist.os"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      required
                    />
                  </Box>
                  <Button 
                    type="submit" 
                    loading={inviting} 
                    color="brand" 
                    leftSection={<UserPlus size={16} />}
                  >
                    Invite
                  </Button>
                </Group>
                {error && <Text size="xs" c="red" fw={700}>{error}</Text>}
              </Stack>
            </form>
          )}

          <Stack gap="sm">
            {members.map((member) => (
              <Box 
                key={member.id}
                p="sm" 
                style={{ 
                  borderRadius: "var(--mantine-radius-md)",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)"
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                    <Avatar radius="xl" size="md" color={member.role === 'OWNER' ? 'brand' : 'gray'}>
                      {member.email[0].toUpperCase()}
                    </Avatar>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={700} truncate>{member.email}</Text>
                      <Group gap="xs">
                        <Group gap={4}>
                          <Shield size={12} color={member.role === 'OWNER' ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-6)'} />
                          <Text size="10px" fw={800} tt="uppercase" lts={1} c="dimmed">
                            {member.role === 'OWNER' ? 'Admin' : 'Member'}
                          </Text>
                        </Group>
                        <Badge 
                          size="xs" 
                          variant="dot" 
                          color={member.acceptedAt ? "green" : "gray"}
                        >
                          {member.acceptedAt ? "Active" : "Pending"}
                        </Badge>
                      </Group>
                    </Box>
                  </Group>

                  {isOwner && member.role !== 'OWNER' && (
                    <Tooltip label="Revoke Access">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleRemove(member.id)}
                        size="lg"
                      >
                        <Trash2 size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Box>
            ))}
          </Stack>
        </Stack>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
