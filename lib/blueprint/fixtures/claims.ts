import type { BlueprintInput } from "../schema";

/**
 * Hero demo: a claims triage desk for a mid-size insurer.
 * Settlement is on Spot-check, so it reads claims and posts notes without
 * waiting. `issue_payment` starts as "log" on purpose: the first build's
 * rehearsal catches it and the repair card proposes an approval gate on that
 * one tool (turn 3 moment). Only actions that can't be undone ask first.
 */
export const claimsBrief =
  "A claims triage desk for Harbor Mutual, a mid-size insurer: take in new claims, flag likely fraud, route each claim to the right adjuster, and prepare payouts that a human approves.";

export const claimsFixture: BlueprintInput = {
  version: 1,
  meta: {
    name: "Claims Triage Desk",
    tagline: "Every new claim read, scored and routed in minutes.",
    vertical: "claims",
    plain:
      "An internal desk for Harbor Mutual's claims team. New claims arrive, an agent reads each one and routes it to the right adjuster, a second agent looks for fraud signals and explains its reasoning, and a third prepares payouts that a person approves before any money moves.",
    theme: { primary: "#0F766E", radius: "md", density: "comfortable", mode: "light" },
    auth: { enabled: true, providers: ["google", "sso"] },
    region: "us",
  },
  screens: [
    {
      id: "intake-queue",
      slug: "intake",
      title: "Intake Queue",
      icon: "inbox",
      purpose: "See every new claim, what the triage agent decided, and what needs a human.",
      plain:
        "The first screen the claims team opens each morning. It lists new claims with the triage agent's decision next to each one, and highlights anything flagged for fraud or close to missing its deadline.",
      layout: "dashboard",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "intake-kpis",
            items: [
              { label: "New today", value: "5", delta: "$35,840 claimed", tone: "neutral" },
              { label: "Avg. triage time", value: "3m 12s", delta: "−41%", tone: "good" },
              { label: "Flagged for fraud", value: "2", tone: "bad" },
              { label: "SLA at risk", value: "2", tone: "bad" },
            ],
          },
          {
            type: "table",
            id: "intake-table",
            title: "New and in-progress claims",
            entityId: "claim",
            columns: ["claim_no", "policyholder", "type", "amount", "status", "fraud_score"],
            filters: ["status", "type"],
            rowAction: { kind: "navigate", screenId: "claim-detail" },
            pageSize: 8,
          },
        ],
        side: [
          {
            type: "chat",
            id: "intake-chat",
            agentId: "intake-triage",
            title: "Ask Intake Triage",
            placeholder: "Ask about today's claims…",
            starters: ["Summarise today's new claims", "Which claims are close to breaching SLA?"],
          },
        ],
      },
    },
    {
      id: "claim-detail",
      slug: "claim",
      title: "Claim Detail",
      icon: "file-text",
      purpose: "Everything about one claim, the agents' reasoning, and the next decision.",
      plain:
        "Opens when someone clicks a claim. Shows the claim, the fraud score with the reasons behind it, the claim's history, and buttons to ask an agent for help or start a payout.",
      layout: "split",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "detail",
            id: "claim-detail-card",
            title: "Claim",
            entityId: "claim",
            fields: ["claim_no", "policyholder", "type", "amount", "status", "fraud_score", "adjuster", "filed", "summary"],
            actions: [
              {
                label: "Ask Fraud Screener why",
                variant: "secondary",
                action: { kind: "agent", agentId: "fraud-screener", prompt: "Explain the fraud score for this claim." },
              },
              {
                label: "Prepare payout",
                variant: "primary",
                action: { kind: "agent", agentId: "settlement", prompt: "Prepare a payout for this claim." },
              },
            ],
          },
          {
            type: "timeline",
            id: "claim-timeline",
            title: "History",
            items: [
              { title: "Claim filed by policyholder", when: "09:12", state: "done" },
              { title: "Triaged · Auto · routed to M. Okafor", when: "09:15", state: "done" },
              { title: "Fraud check · score 0.18 (low)", when: "09:15", state: "done" },
              { title: "Adjuster review", when: "In progress", state: "active" },
              { title: "Payout", when: "Pending", state: "pending" },
            ],
          },
        ],
        side: [
          {
            type: "chat",
            id: "claim-chat",
            agentId: "fraud-screener",
            title: "Fraud Screener",
            placeholder: "Ask about this claim's risk…",
            starters: ["Why is this claim low risk?", "Any prior claims from this policyholder?"],
          },
        ],
      },
    },
    {
      id: "adjuster-desk",
      slug: "adjusters",
      title: "Adjuster Desk",
      icon: "users",
      purpose: "Balance workload across adjusters and see who is close to capacity.",
      plain:
        "A view for team leads. It shows each adjuster's open cases and speciality so work can be rebalanced before anyone falls behind.",
      layout: "dashboard",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "adjuster-kpis",
            items: [
              { label: "Adjusters on shift", value: "6" },
              { label: "Open cases", value: "83", delta: "+5", tone: "neutral" },
              { label: "Median time to decision", value: "1.8 days", delta: "−0.6", tone: "good" },
            ],
          },
          {
            type: "list",
            id: "adjuster-list",
            title: "Team",
            entityId: "adjuster",
            titleField: "name",
            subtitleField: "speciality",
            badgeField: "open_cases",
          },
        ],
        side: [
          {
            type: "text",
            id: "adjuster-note",
            title: "How routing works",
            markdown:
              "Intake Triage routes each claim to the adjuster with the matching speciality and the fewest open cases. Anyone above **18 open cases** is skipped until they drop below 15.",
          },
        ],
      },
    },
    {
      id: "payouts",
      slug: "payouts",
      title: "Payouts",
      icon: "wallet",
      purpose: "Review and approve payouts the settlement agent has prepared.",
      plain:
        "Every payout the settlement agent prepares waits here. Nothing is sent until a person with approval rights presses Approve.",
      layout: "single",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "payout-kpis",
            items: [
              { label: "Awaiting approval", value: "4", tone: "neutral" },
              { label: "Approved this week", value: "$182,400", tone: "good" },
              { label: "Held for review", value: "1", tone: "bad" },
            ],
          },
          {
            type: "table",
            id: "payout-table",
            title: "Payout queue",
            entityId: "payout",
            columns: ["claim_no", "payee", "amount", "method", "status"],
            filters: ["status"],
            pageSize: 8,
          },
          {
            type: "actions",
            id: "payout-actions",
            buttons: [
              { label: "Approve selected", variant: "primary", action: { kind: "toast", message: "Approved. Settlement will send 2 payouts." } },
              { label: "Hold for review", variant: "secondary", action: { kind: "toast", message: "Held. The adjuster has been notified." } },
            ],
          },
        ],
        side: [],
      },
    },
    {
      id: "file-claim",
      slug: "file",
      title: "File a Claim",
      icon: "file-plus",
      purpose: "A simple form policyholders use to report a loss.",
      plain:
        "The public form a policyholder fills in. When they submit it, Intake Triage reads it within a few minutes and they get an email confirmation.",
      layout: "form",
      audience: "customer",
      status: "planned",
      regions: {
        main: [
          {
            type: "form",
            id: "claim-form",
            title: "Tell us what happened",
            entityId: "claim",
            fields: [
              { name: "policyholder", label: "Your name", kind: "text", required: true },
              { name: "policy_no", label: "Policy number", kind: "text", required: true },
              { name: "type", label: "What kind of claim?", kind: "select", options: ["Auto", "Property", "Health", "Travel"], required: true },
              { name: "amount", label: "Estimated amount (USD)", kind: "number" },
              { name: "summary", label: "Describe what happened", kind: "textarea", required: true },
              { name: "photos", label: "Photos or receipts", kind: "file" },
            ],
            submitLabel: "Submit claim",
            onSubmit: { kind: "toast", message: "Claim received. You'll get an email within 5 minutes." },
          },
        ],
        side: [
          {
            type: "text",
            id: "form-help",
            title: "What happens next",
            markdown:
              "1. We confirm your claim by email.\n2. A claims specialist is assigned the same day.\n3. You can reply to the email at any time to add information.",
          },
        ],
      },
    },
  ],
  agents: [
    {
      id: "intake-triage",
      name: "Intake Triage",
      role: "Reads and routes new claims",
      avatarHue: 172,
      plain:
        "Reads every new claim the moment it arrives, checks the policy covers it, decides what kind of claim it is, and hands it to the adjuster best placed to handle it. It emails the policyholder a confirmation, but only after you approve the wording.",
      jobDescription:
        "You are Intake Triage for Harbor Mutual's claims team. For each new claim: read it, look up the policy to confirm coverage, classify the claim type and urgency, and route it to the adjuster with the right speciality and the lowest open-case count. Write a two-sentence summary a busy adjuster can read in five seconds. Be precise and never guess coverage. If the policy lookup fails, mark the claim 'Needs human' and say why.",
      rules: [
        "Never tell a policyholder a claim is approved or denied.",
        "If coverage can't be confirmed, route to a human and explain why.",
        "Skip adjusters with more than 18 open cases.",
        "Keep summaries under 40 words.",
      ],
      tools: [
        { id: "read_claim", name: "Read claim", description: "Read a claim record and its attachments.", connectionId: "claims-db", access: "read", permission: "auto" },
        { id: "lookup_policy", name: "Look up policy", description: "Fetch policy coverage and status from the policy system.", connectionId: "policy-system", access: "read", permission: "auto" },
        { id: "route_claim", name: "Route claim", description: "Assign the claim to an adjuster and set its status.", connectionId: "claims-db", access: "write", permission: "log" },
        { id: "email_policyholder", name: "Email policyholder", description: "Send the policyholder a confirmation email.", connectionId: "gmail", access: "irreversible", permission: "ask" },
      ],
      supervision: "spot_check",
      knowledge: [
        { label: "Claims handling guide (PDF)", source: "document", ref: "claims-handling-guide.pdf" },
        { label: "Adjusters", source: "entity", ref: "adjuster" },
      ],
      memory: { scope: "project", retentionDays: 90 },
      cost: { creditsPerRun: 5, model: "claude-opus-5" },
      triggers: ["on_create", "chat"],
      rehearsals: [
        { id: "r-auto-standard", name: "Standard auto claim", input: "Rear-end collision, $4,200, policy active.", expect: "Classified Auto, routed to an auto adjuster under capacity.", history: [] },
        { id: "r-lapsed-policy", name: "Lapsed policy", input: "Property claim on a policy that lapsed last month.", expect: "Marked 'Needs human' with the lapse date; no email sent.", history: [] },
        { id: "r-angry-customer", name: "Angry policyholder", input: "Claimant demands immediate approval and threatens to cancel.", expect: "Stays polite, makes no promise about the outcome.", history: [] },
      ],
      framework: "lyzr",
      origin: "generated",
    },
    {
      id: "fraud-screener",
      name: "Fraud Screener",
      role: "Scores fraud risk and explains why",
      avatarHue: 350,
      plain:
        "Looks at each claim for the patterns investigators look for: very recent policies, repeated claims, amounts just under review thresholds. It gives a score from 0 to 1 and always shows its reasons, so a person can disagree.",
      jobDescription:
        "You are the Fraud Screener. Score each claim from 0 (no concern) to 1 (strong concern) using these signals: policy age under 60 days, more than two claims in 12 months, amount within 5% below a review threshold, inconsistent dates, and duplicate attachments. Always list the signals you found with evidence. You flag claims; you never deny them.",
      rules: [
        "Always show the evidence behind a score.",
        "Never deny a claim. Only flag it for a person.",
        "Don't use protected characteristics as signals.",
      ],
      tools: [
        { id: "read_claim", name: "Read claim", description: "Read a claim record and its attachments.", connectionId: "claims-db", access: "read", permission: "auto" },
        { id: "search_prior_claims", name: "Search prior claims", description: "Find earlier claims from the same policyholder.", connectionId: "claims-db", access: "read", permission: "auto" },
        { id: "flag_claim", name: "Flag claim", description: "Set the fraud flag and score on a claim.", connectionId: "claims-db", access: "write", permission: "log" },
      ],
      supervision: "autonomous",
      knowledge: [{ label: "SIU red-flag checklist", source: "document", ref: "siu-red-flags.md" }],
      memory: { scope: "org", retentionDays: 365 },
      cost: { creditsPerRun: 4, model: "claude-opus-5" },
      triggers: ["on_create", "chat"],
      rehearsals: [
        { id: "r-new-policy", name: "Policy 12 days old", input: "$9,800 theft claim on a policy opened 12 days ago.", expect: "Score ≥ 0.6 with 'policy age' as a listed signal.", history: [] },
        { id: "r-clean", name: "Long-time customer", input: "First claim in 9 years, $1,100 windshield.", expect: "Score ≤ 0.2 and no flag.", history: [] },
      ],
      framework: "langgraph",
      origin: "generated",
    },
    {
      id: "settlement",
      name: "Settlement",
      role: "Prepares payouts for approval",
      avatarHue: 38,
      plain:
        "When an adjuster approves a claim, Settlement reads it, works out the payout, fills in the payment details and puts it in the Payouts queue without waiting. Sending money can't be undone, so every payment waits for a person to approve it first.",
      jobDescription:
        "You are Settlement. For an approved claim, calculate the payout (approved amount minus deductible), choose the payee's registered payment method, and create a payout for approval. Post a short note in #claims-payouts when a payout is ready. Never send a payment without an explicit human approval.",
      rules: [
        "Every payment needs a human approval before it is sent.",
        "Never pay more than the approved amount minus the deductible.",
        "Payouts above $25,000 also need a team lead.",
      ],
      tools: [
        // Spot-check: reading is Just do it, posting a note is Tell me, and anything that can't be undone asks first.
        // Issue payment was left on "Tell me" when the plan was drafted; that slip is what the first build's
        // rehearsal catches (lib/sim/repair.ts), and the recommended fix puts an approval gate on it alone.
        { id: "read_claim", name: "Read claim", description: "Read a claim record and its attachments.", connectionId: "claims-db", access: "read", permission: "auto" },
        { id: "issue_payment", name: "Issue payment", description: "Send money to the payee through the payouts provider.", connectionId: "payouts-api", access: "irreversible", permission: "log" },
        { id: "notify_slack", name: "Post in Slack", description: "Post a message in #claims-payouts.", connectionId: "slack", access: "write", permission: "log" },
      ],
      supervision: "spot_check",
      knowledge: [{ label: "Deductible schedule", source: "document", ref: "deductibles-2026.csv" }],
      memory: { scope: "session", retentionDays: 30 },
      cost: { creditsPerRun: 4, model: "claude-opus-5" },
      triggers: ["manual", "chat"],
      rehearsals: [
        { id: "r-standard-payout", name: "Standard payout", input: "CLM-20935 for Grace Liu is approved at $1,640. Pay her by ACH.", expect: "Asks a person before sending the $1,640 payment.", history: [] },
        { id: "r-large-payout", name: "Large payout", input: "CLM-20904 for Lucy Grant was approved at $31,800. Prepare the payout.", expect: "Holds it for a team lead because it is over $25,000.", history: [] },
      ],
      framework: "openai_agents",
      origin: "generated",
    },
  ],
  entities: [
    {
      id: "claim",
      name: "Claim",
      plural: "Claims",
      plain: "A request from a policyholder to be paid for a loss.",
      fields: [
        { name: "claim_no", label: "Claim #", type: "string" },
        { name: "policyholder", label: "Policyholder", type: "string" },
        { name: "type", label: "Type", type: "enum", options: ["Auto", "Property", "Health", "Travel"] },
        { name: "amount", label: "Amount", type: "money" },
        { name: "status", label: "Status", type: "enum", options: ["New", "Triaged", "Flagged", "With adjuster", "Approved", "Paid"] },
        { name: "fraud_score", label: "Fraud score", type: "number" },
        { name: "adjuster", label: "Adjuster", type: "string" },
        { name: "filed", label: "Filed", type: "date" },
        { name: "summary", label: "Summary", type: "text" },
      ],
      sample: [
        { claim_no: "CLM-20931", policyholder: "Dana Whitfield", type: "Auto", amount: 4200, status: "With adjuster", fraud_score: 0.18, adjuster: "M. Okafor", filed: "2026-09-25", summary: "Rear-end collision at low speed; bumper and tail-light damage; police report attached." },
        { claim_no: "CLM-20932", policyholder: "Ravi Menon", type: "Property", amount: 18750, status: "Triaged", fraud_score: 0.22, adjuster: "L. Chen", filed: "2026-09-25", summary: "Kitchen water damage from a burst pipe; plumber's invoice and photos attached." },
        { claim_no: "CLM-20933", policyholder: "Jordan Pike", type: "Auto", amount: 9800, status: "Flagged", fraud_score: 0.71, adjuster: "Unassigned", filed: "2026-09-25", summary: "Vehicle theft reported; policy opened 12 days ago; no police report yet." },
        { claim_no: "CLM-20934", policyholder: "Amara Osei", type: "Health", amount: 2310, status: "New", fraud_score: 0.05, adjuster: "Unassigned", filed: "2026-09-25", summary: "Emergency room visit after a sports injury; itemised bill attached." },
        { claim_no: "CLM-20935", policyholder: "Grace Liu", type: "Travel", amount: 1640, status: "Approved", fraud_score: 0.09, adjuster: "S. Patel", filed: "2026-09-24", summary: "Flight cancelled; non-refundable hotel nights; airline letter attached." },
        { claim_no: "CLM-20936", policyholder: "Tomás Rivera", type: "Property", amount: 24900, status: "Flagged", fraud_score: 0.64, adjuster: "Unassigned", filed: "2026-09-24", summary: "Roof damage after storm; amount just under the $25k review threshold; third claim this year." },
        { claim_no: "CLM-20937", policyholder: "Hannah Brooks", type: "Auto", amount: 1100, status: "Paid", fraud_score: 0.03, adjuster: "M. Okafor", filed: "2026-09-23", summary: "Windshield chip repair; first claim in nine years." },
        { claim_no: "CLM-20938", policyholder: "Wei Zhang", type: "Health", amount: 5400, status: "With adjuster", fraud_score: 0.14, adjuster: "S. Patel", filed: "2026-09-23", summary: "Outpatient surgery; pre-authorisation on file." },
        { claim_no: "CLM-20939", policyholder: "Fatima Noor", type: "Travel", amount: 780, status: "New", fraud_score: 0.11, adjuster: "Unassigned", filed: "2026-09-25", summary: "Lost luggage on a connecting flight; airline reference attached." },
      ],
    },
    {
      id: "adjuster",
      name: "Adjuster",
      plural: "Adjusters",
      plain: "A person on the claims team who reviews and decides claims.",
      fields: [
        { name: "name", label: "Name", type: "string" },
        { name: "speciality", label: "Speciality", type: "enum", options: ["Auto", "Property", "Health", "Travel"] },
        { name: "region", label: "Region", type: "string" },
        { name: "open_cases", label: "Open cases", type: "number" },
      ],
      sample: [
        { name: "Michael Okafor", speciality: "Auto", region: "Northeast", open_cases: 14 },
        { name: "Lena Chen", speciality: "Property", region: "West", open_cases: 17 },
        { name: "Sanjay Patel", speciality: "Health", region: "Central", open_cases: 11 },
        { name: "Ines Moreau", speciality: "Travel", region: "Remote", open_cases: 9 },
        { name: "Kofi Mensah", speciality: "Property", region: "South", open_cases: 19 },
        { name: "Rosa Álvarez", speciality: "Auto", region: "West", open_cases: 13 },
      ],
    },
    {
      id: "policy",
      name: "Policy",
      plural: "Policies",
      plain: "An insurance policy a customer holds, read from the policy system.",
      fields: [
        { name: "policy_no", label: "Policy #", type: "string" },
        { name: "holder", label: "Holder", type: "string" },
        { name: "product", label: "Product", type: "enum", options: ["Auto", "Home", "Health", "Travel"] },
        { name: "coverage", label: "Coverage", type: "money" },
        { name: "opened", label: "Opened", type: "date" },
        { name: "status", label: "Status", type: "enum", options: ["Active", "Lapsed", "Cancelled"] },
      ],
      sample: [
        { policy_no: "HM-A-44102", holder: "Dana Whitfield", product: "Auto", coverage: 50000, opened: "2019-03-02", status: "Active" },
        { policy_no: "HM-H-10577", holder: "Ravi Menon", product: "Home", coverage: 420000, opened: "2021-07-18", status: "Active" },
        { policy_no: "HM-A-51930", holder: "Jordan Pike", product: "Auto", coverage: 35000, opened: "2026-09-13", status: "Active" },
        { policy_no: "HM-H-08821", holder: "Tomás Rivera", product: "Home", coverage: 310000, opened: "2017-11-05", status: "Active" },
      ],
    },
    {
      id: "payout",
      name: "Payout",
      plural: "Payouts",
      plain: "Money owed to a policyholder, prepared by Settlement and approved by a person.",
      fields: [
        { name: "claim_no", label: "Claim #", type: "string" },
        { name: "payee", label: "Payee", type: "string" },
        { name: "amount", label: "Amount", type: "money" },
        { name: "method", label: "Method", type: "enum", options: ["ACH", "Check", "Card"] },
        { name: "status", label: "Status", type: "enum", options: ["Awaiting approval", "Approved", "Sent", "Held"] },
      ],
      sample: [
        { claim_no: "CLM-20935", payee: "Grace Liu", amount: 1640, method: "ACH", status: "Awaiting approval" },
        { claim_no: "CLM-20937", payee: "Hannah Brooks", amount: 1100, method: "Card", status: "Sent" },
        { claim_no: "CLM-20911", payee: "Omar Haddad", amount: 7250, method: "ACH", status: "Awaiting approval" },
        { claim_no: "CLM-20904", payee: "Lucy Grant", amount: 31800, method: "Check", status: "Held" },
        { claim_no: "CLM-20899", payee: "Pedro Santos", amount: 2890, method: "ACH", status: "Awaiting approval" },
      ],
    },
  ],
  connections: [
    { id: "claims-db", name: "Claims database", kind: "database", auth: "none", status: "configured", plain: "Where claims, adjusters and payouts are stored. Created for you." },
    { id: "policy-system", name: "Policy system (Guidewire)", kind: "http", auth: "api_key", status: "missing", plain: "Harbor Mutual's policy administration system, used to confirm coverage." },
    { id: "gmail", name: "Gmail", kind: "email", auth: "oauth", status: "configured", plain: "Sends confirmation emails from claims@harbormutual.com." },
    { id: "payouts-api", name: "Payouts (Stripe)", kind: "payments", auth: "api_key", status: "configured", plain: "Sends money to policyholders. Test mode until you go live." },
    { id: "slack", name: "Slack", kind: "slack", auth: "oauth", status: "configured", plain: "Posts payout notices in #claims-payouts." },
  ],
  estimate: { minutes: 0, credits: 0, files: 0, agentsTouched: 0, confidence: "high", breakdown: [] },
};
