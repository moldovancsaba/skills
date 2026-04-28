import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - checklist",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 2025</p>

      <div className="space-y-6 text-sm">
        <section>
          <h2 className="font-semibold mb-2">Acceptable Use</h2>
          <p className="text-muted-foreground">
            You agree to use checklist only for lawful business purposes. 
            You are responsible for all activity under your account.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Data Ownership</h2>
          <p className="text-muted-foreground">
            You retain ownership of all data you input. By using our service, 
            you grant us permission to process your data to provide AI-generated 
            recommendations.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">AI Service</h2>
          <p className="text-muted-foreground">
            Our AI generates marketing recommendations based on your data. 
            Recommendations are suggestions only - you are responsible for evaluating 
            and implementing them.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Service Availability</h2>
          <p className="text-muted-foreground">
            We strive to keep the service available 24/7 but do not guarantee 
            uptime. The local AI sync runs every 5 minutes.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Disclaimer</h2>
          <p className="text-muted-foreground">
            checklist provides AI-generated suggestions for marketing purposes only. 
            We do not guarantee the accuracy or effectiveness of any recommendations.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Changes to Terms</h2>
          <p className="text-muted-foreground">
            We may update these terms at any time. Continued use constitutes 
            acceptance of updated terms.
          </p>
        </section>
      </div>
    </div>
  );
}