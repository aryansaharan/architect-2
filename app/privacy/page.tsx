import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="October 5, 2026">
      <p>Prod AI is made and run by Aryan Saharan. This page says what it stores, why, and who else sees it.</p>
      <h2>Your account</h2>
      <ul>
        <li>Sign in with Google: your name, email address and profile picture, from Google.</li>
        <li>Sign in with an email link: your email address.</li>
        <li>Continue as a guest: an anonymous session, with no name or email.</li>
      </ul>
      <h2>What you make</h2>
      <ul>
        <li>Your projects: what you asked for, plans, versions, notes in the margin, comments, handoffs and conversations with AI helpers.</li>
        <li>Your credits: what each piece of work cost, for the credits meter, spending caps and daily limits.</li>
        <li>Only you can see your projects. Once you publish an app, its public pages are open to anyone with the link, and its team screens to you and the people you invite.</li>
      </ul>
      <h2>Published apps</h2>
      <ul>
        <li>When you publish an app, its records are stored for you, the owner: what people type into its forms, what your team and its AI helpers change, and a history of those changes (kept 90 days) so they can be undone.</li>
        <li>If you fill in a form on someone else&apos;s published app, what you send is stored for that app&apos;s owner. Ask them about it, or report the page.</li>
        <li>When you invite someone to an app&apos;s team screens, we store the email address you invited so they can get in. The invitation and any email an AI helper sends go out through Resend; we keep a record of each one with the recipient stored only as a scrambled code (a hash), not the address.</li>
        <li>Conversations with AI helpers in a published app are saved for its owner, along with which team member had them.</li>
      </ul>
      <h2>Network addresses</h2>
      <p>To enforce rate limits and to handle reports, we keep your IP address only as a hash mixed with a secret, so it can&apos;t be read back. A report from &quot;Report this page&quot; stores the reason, any details you write and that hash. The person who published the page isn&apos;t told who reported it.</p>
      <h2>Who else processes it</h2>
      <ul>
        <li><strong>Anthropic</strong>: what you write, your plans, and AI helper conversations (including the records a helper looks up) are sent to Anthropic&apos;s Claude API to write plans, changes and replies.</li>
        <li><strong>Supabase</strong> stores the database (in the United States, US East) and handles sign-in. <strong>Vercel</strong> hosts the app. <strong>Google</strong> handles Google sign-in. <strong>Resend</strong> sends email, when email is switched on.</li>
      </ul>
      <p>Nothing is sold, and nothing is used for advertising. Prod AI counts page views of its own pages with Vercel Web Analytics, which sets no cookies and keeps no profile of you. Published apps are never counted.</p>
      <h2>How long it&apos;s kept</h2>
      <ul>
        <li>Guests who haven&apos;t been back for a week are removed automatically, with their projects and published apps.</li>
        <li>Projects keep their newest 30 versions.</li>
        <li>Signed-in accounts and their projects are kept until you ask us to delete them.</li>
      </ul>
      <h2>Deleting your data</h2>
      <p>
        Email <a href="mailto:aryansaharan30@gmail.com">aryansaharan30@gmail.com</a> from the address you sign in with, and your account, projects and published apps will be deleted. You can take a
        published app offline yourself from its Publish tab.
      </p>
    </LegalPage>
  );
}
