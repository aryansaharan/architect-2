import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="October 7, 2026">
      <p>
        Prod AI is a free, early product made and run by Aryan Saharan, provided as-is. It is independent: not affiliated with or endorsed by the makers of any framework it writes
        code for. By using it you agree to these terms.
      </p>
      <h2>Free credits</h2>
      <ul>
        <li>Each signed-in person gets free credits every month (300 today). They come back on the 1st, and unused credits don&apos;t carry over.</li>
        <li>Credits have no cash value. They can&apos;t be bought, sold, transferred or exchanged for money. Prod AI takes no payments today.</li>
        <li>Prices, allowances and limits may change. The current prices are shown in Settings before you spend anything.</li>
        <li>Guests don&apos;t get credits. They use the free starter plans.</li>
      </ul>
      <h2>Your apps and their data</h2>
      <ul>
        <li>You own what you make. You are responsible for your published apps, what they say, and the data they collect from the people who use them.</li>
        <li>AI helpers in a published app change that app&apos;s records (changes can be undone), and can send email only after a person approves it. Payments and other outside services aren&apos;t real yet: nothing is paid or posted.</li>
        <li>Don&apos;t use a published app to collect passwords, payment card details, or health or government ID information.</li>
      </ul>
      <h2>Acceptable use</h2>
      <ul>
        <li>No phishing: don&apos;t make apps or pages that trick people into handing over passwords, money or personal details.</li>
        <li>No impersonation: don&apos;t pretend to be another person, company or service.</li>
        <li>No spam: don&apos;t use published apps, invitations or AI helper emails to send messages people didn&apos;t ask for.</li>
        <li>Nothing illegal, harmful or hateful, and no malware.</li>
        <li>Don&apos;t try to get around the limits, reach other people&apos;s data, or overload the service.</li>
      </ul>
      <h2>Reports and takedowns</h2>
      <p>
        Every published page has a &quot;Report this page&quot; link. We look at reports, and we may take down a published app or close an account that breaks these terms, without
        notice.
      </p>
      <h2>Guests</h2>
      <p>Guest sessions that haven&apos;t been back for a week are removed, with their projects and published apps. Sign in to keep your work.</p>
      <h2>No warranty</h2>
      <p>
        The service may change, lose data or go offline at any time. Generated code and AI answers can be wrong; review them before you rely on them. To the extent the law allows,
        Prod AI isn&apos;t liable for losses from using it.
      </p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:aryansaharan30@gmail.com">aryansaharan30@gmail.com</a>
      </p>
    </LegalPage>
  );
}
