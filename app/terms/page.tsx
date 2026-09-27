import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="September 26, 2026">
      <p>Prod AI is a non-commercial prototype built for Lyzr&apos;s Architect 2.0 brief, provided as-is for evaluation. It is not an official Lyzr product.</p>
      <h2>Use</h2>
      <ul>
        <li>Don&apos;t use it to process real personal, financial or health data. Sample data is fictional.</li>
        <li>Agent actions in the test and live versions are sandboxed: nothing is actually sent, paid or deleted.</li>
        <li>Usage is limited per account per day to keep the prototype available for everyone.</li>
      </ul>
      <h2>No warranty</h2>
      <p>The service may change, reset or go offline at any time. Generated code is provided without warranty; review it before using it anywhere.</p>
      <h2>Contact</h2>
      <p><a href="mailto:aryansaharan30@gmail.com">aryansaharan30@gmail.com</a></p>
    </LegalPage>
  );
}
