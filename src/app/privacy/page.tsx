import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Checklist",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 2025</p>

      <div className="space-y-6 text-sm">
        <section>
          <h2 className="font-semibold mb-2">Data We Collect</h2>
          <p className="text-muted-foreground">
            We collect company information, product details, customer data, and competitor 
            intelligence that you voluntarily provide. We also collect usage data to improve 
            our service.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">How We Use Data</h2>
          <p className="text-muted-foreground">
            Your data is used to generate marketing recommendations (Next Best Actions) 
            tailored to your business. All AI processing is performed locally using 
            Ollama - no data is sent to external AI services.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Data Storage</h2>
          <p className="text-muted-foreground">
            Data is stored in MongoDB Atlas. Local sync runs on mvp-factory-control 
            for AI processing. We implement industry-standard security measures.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Your Rights</h2>
          <p className="text-muted-foreground">
            You may request deletion of your data at any time. Contact us to exercise 
            your data subject access requests.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Contact</h2>
          <p className="text-muted-foreground">
            For privacy questions, contact us through the app.
          </p>
        </section>
      </div>
    </div>
  );
}