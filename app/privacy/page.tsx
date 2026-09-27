import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="September 26, 2026">
      <p>Prod AI is a prototype built by Aryan Saharan for a product-management assignment. This page explains what it stores and why.</p>
      <h2>What we collect</h2>
      <ul>
        <li>If you sign in with Google: your name, email address and profile picture, provided by Google.</li>
        <li>If you sign in with an email link: your email address.</li>
        <li>If you continue as a guest (no account): an anonymous session identifier.</li>
        <li>What you create: project descriptions, plans, comments, and conversations with agents in the playground.</li>
        <li>Usage records: model token counts and credits, used for the spend meter and daily limits.</li>
      </ul>
      <h2>How it&apos;s used</h2>
      <p>Only to run the product: to sign you in, save your projects, and show your usage. Descriptions and agent conversations are sent to Anthropic&apos;s Claude API to generate plans and replies. Nothing is sold or shared for advertising.</p>
      <h2>Where it&apos;s stored</h2>
      <p>Data is stored in a Supabase Postgres database in the United States, with row-level security so each account can only read its own projects. The app is hosted on Vercel.</p>
      <h2>Deleting your data</h2>
      <p>Email <a className="text-amber underline-offset-4 hover:underline" href="mailto:aryansaharan30@gmail.com">aryansaharan30@gmail.com</a> and your account and projects will be deleted. Anonymous demo sessions may be removed after 30 days.</p>
    </LegalPage>
  );
}
