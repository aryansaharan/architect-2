import type { Vertical } from "./schema";

export type Question = { id: string; label: string; options: string[]; defaultIndex: number };

const CAREFUL: Question = {
  id: "care",
  label: "How careful should the agents be?",
  options: ["Ask me before anything leaves the building", "Act, then tell me", "Fully on their own"],
  defaultIndex: 0,
};

const BY_VERTICAL: Record<Vertical, Question[]> = {
  claims: [
    { id: "users", label: "Who uses it day to day?", options: ["Claims handlers", "Adjusters", "Team leads", "Policyholders too"], defaultIndex: 0 },
    { id: "systems", label: "What must it connect to?", options: ["Policy system", "Payments", "Email", "Nothing yet"], defaultIndex: 0 },
    CAREFUL,
  ],
  support: [
    { id: "users", label: "Who answers tickets today?", options: ["A small support team", "Tier 1 + tier 2", "Founders", "An outsourced team"], defaultIndex: 0 },
    { id: "systems", label: "Where do tickets live?", options: ["Zendesk", "Intercom", "Shared inbox", "Nowhere yet"], defaultIndex: 0 },
    CAREFUL,
  ],
  sales: [
    { id: "users", label: "Who is it for?", options: ["SDRs", "Account executives", "Founders", "RevOps"], defaultIndex: 0 },
    { id: "systems", label: "Which CRM?", options: ["HubSpot", "Salesforce", "Spreadsheet", "None yet"], defaultIndex: 0 },
    CAREFUL,
  ],
  hr: [
    { id: "users", label: "Who runs onboarding?", options: ["People team", "IT", "Hiring managers", "All three"], defaultIndex: 3 },
    { id: "systems", label: "What must it connect to?", options: ["HR system (Workday)", "Identity (Okta)", "Laptops & procurement", "Nothing yet"], defaultIndex: 0 },
    CAREFUL,
  ],
  custom: [
    { id: "users", label: "Who is it for?", options: ["My team", "Our customers", "Both"], defaultIndex: 0 },
    { id: "systems", label: "What must it connect to?", options: ["Email", "Slack", "A CRM", "Nothing yet"], defaultIndex: 3 },
    CAREFUL,
  ],
};

export function questionsFor(v: Vertical): Question[] {
  return BY_VERTICAL[v] ?? BY_VERTICAL.custom;
}

export function renderAnswers(qs: Question[], answers: Record<string, string>): string {
  return qs
    .map((q) => `${q.label} ${answers[q.id] ?? q.options[q.defaultIndex]}`)
    .join("\n");
}
