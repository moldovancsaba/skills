'use client';

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-fields";
import { Users, UserPlus, Trash2, Shield, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

  if (loading) return <div className="animate-pulse h-48 bg-muted rounded-xl" />;

  return (
    <Card className="border-primary/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
        <div className="space-y-1">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Team Members
          </CardTitle>
          <CardDescription>
            Invite users by email. When they log in with that address, they automatically get access to this company.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isOwner && (
          <form onSubmit={handleInvite} className="flex gap-2">
            <FormInput
              placeholder="team@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="flex-1"
            />
            <Button type="submit" disabled={inviting} className="gap-2 shrink-0">
              <UserPlus className="h-4 w-4" />
              Invite User
            </Button>
          </form>
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {members.map((member) => (
              <motion.div
                key={member.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center justify-between p-3 rounded-lg border border-primary/5 bg-accent/30"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.email}</p>
                    <div className="flex items-center gap-1">
                      <Shield className={`h-3 w-3 ${member.role === 'OWNER' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        {member.role}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        {member.acceptedAt ? "ACTIVE" : "INVITED"}
                      </span>
                    </div>
                  </div>
                </div>
                {isOwner && member.role !== 'OWNER' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(member.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
