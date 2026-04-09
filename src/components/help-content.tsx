"use client";

import Link from "next/link";
import { BookOpen, CircleHelp, Lightbulb } from "lucide-react";

import { faqItems, manualSections } from "@/content/help";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice, PageHeader, PageShell } from "@/components/ui/app-shell";

export function ManualPageContent() {
  return (
    <PageShell width="5xl">
      <PageHeader
        title="Operator Manual"
        description="Practical guidance for adding better data, reviewing Knowmore flashcards, and teaching the checklist system with better feedback."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/faq">Open FAQ</Link>
            </Button>
          </>
        }
      />

      <Notice icon={Lightbulb} title="Fastest path to better output">
        Better source quality and sharper feedback improve the system faster than simply refreshing the same weak inputs.
      </Notice>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Use these source types first</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-foreground">
            <p>Product and pricing pages</p>
            <p>Competitor pricing and positioning pages</p>
            <p>Customer notes and interview summaries</p>
            <p>Sales decks, briefs, onboarding docs, and internal files</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Useful decline language</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-foreground">
            <p>Already doing this</p>
            <p>Not relevant for this company</p>
            <p>Too early, revisit after summer</p>
            <p>Blocked until launch, budget approval, or hiring</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {manualSections.map((section) => (
          <Card key={section.id}>
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{section.title}</Badge>
              </div>
              <CardTitle className="text-2xl">{section.summary}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-foreground">
              {section.bullets.map((bullet) => (
                <div key={bullet} className="rounded-lg border border-border/80 bg-background/70 px-4 py-3">
                  {bullet}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Need quick answers?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/faq">
              <CircleHelp className="h-4 w-4" />
              Open FAQ
            </Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function FaqPageContent() {
  return (
    <PageShell width="5xl">
      <PageHeader
        title="FAQ"
        description="Short answers to the workflow questions that come up most often."
      />

      <Notice icon={BookOpen} title="Before you refresh again">
        If the output feels weak, check source quality and feedback quality first. That usually matters more than another blind rerun.
      </Notice>

      <Card>
        <CardContent className="p-6">
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </PageShell>
  );
}
