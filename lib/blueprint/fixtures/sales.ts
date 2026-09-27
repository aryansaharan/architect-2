import type { BlueprintInput } from "../schema";

/**
 * Sales demo: an account research desk for a B2B analytics vendor.
 * LinkedIn Sales Navigator starts "missing" on purpose: Researcher can still
 * build briefs from the web and HubSpot, but contact discovery is limited until it's connected.
 */
export const salesBrief =
  "An account research desk for Lumen Analytics' sales team: research target accounts, watch for buying signals, and draft first-touch emails that a rep reviews before sending.";

export const salesFixture: BlueprintInput = {
  version: 1,
  meta: {
    name: "Account Research Desk",
    tagline: "Know every target account before the first email.",
    vertical: "sales",
    plain:
      "An internal desk for Lumen Analytics' sales team. One agent researches each target account and writes a one-page brief, a second watches the news and job boards for buying signals like funding rounds or a new head of data, and a third drafts a first-touch email that the account's rep reads and approves before it's sent.",
    theme: { primary: "#0369A1", radius: "md", density: "comfortable", mode: "light" },
    auth: { enabled: true, providers: ["google"] },
    region: "us",
  },
  screens: [
    {
      id: "accounts",
      slug: "accounts",
      title: "Accounts",
      icon: "building-2",
      purpose: "See every target account, how well it fits, and what's happened lately.",
      plain:
        "The first screen a rep opens each morning. It lists their target accounts with a fit score, the latest buying signal, and where each one is, from 'just added' to 'meeting booked'.",
      layout: "dashboard",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "account-kpis",
            items: [
              { label: "Target accounts", value: "64", delta: "+6 this week", tone: "neutral" },
              { label: "Briefs ready", value: "18", delta: "+5", tone: "good" },
              { label: "Strong signals (7 days)", value: "7", tone: "good" },
              { label: "Meetings booked (30 days)", value: "11", delta: "+4 vs. August", tone: "good" },
            ],
          },
          {
            type: "table",
            id: "account-table",
            title: "Target accounts",
            entityId: "account",
            columns: ["company", "industry", "employees", "owner", "stage", "fit_score", "last_signal"],
            filters: ["stage", "industry", "owner"],
            rowAction: { kind: "navigate", screenId: "research-brief" },
            pageSize: 8,
          },
        ],
        side: [
          {
            type: "chat",
            id: "account-chat",
            agentId: "researcher",
            title: "Ask Researcher",
            placeholder: "Ask about your accounts…",
            starters: [
              "Which of my accounts are the best fit right now?",
              "Research oakline.io and write a brief",
              "Which accounts have no brief yet?",
            ],
          },
        ],
      },
    },
    {
      id: "research-brief",
      slug: "brief",
      title: "Research Brief",
      icon: "file-text",
      purpose: "A one-page brief on one account, who to contact, and the next step.",
      plain:
        "Opens when a rep clicks an account. Shows what the company does, their current data tools, why Lumen might help, the people to contact, and buttons to refresh the research or have a first email drafted.",
      layout: "split",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "detail",
            id: "brief-detail-card",
            title: "Account brief",
            entityId: "account",
            fields: ["company", "domain", "industry", "employees", "owner", "stage", "fit_score", "tech_stack", "last_signal", "brief"],
            actions: [
              {
                label: "Refresh research",
                variant: "secondary",
                action: { kind: "agent", agentId: "researcher", prompt: "Refresh the research brief for this account." },
              },
              {
                label: "Draft first-touch email",
                variant: "primary",
                action: { kind: "agent", agentId: "outreach-writer", prompt: "Draft a first-touch email for this account using its strongest signal." },
              },
            ],
          },
          {
            type: "timeline",
            id: "brief-timeline",
            title: "Account history",
            items: [
              { title: "Added as a target by Priya Nakamura", when: "Sep 15", state: "done" },
              { title: "Company profile and data stack researched", when: "Sep 15", state: "done" },
              { title: "3 contacts found · VP Data is the likely buyer", when: "Sep 15", state: "done" },
              { title: "Signal · $62M Series C announced", when: "Sep 22", state: "done" },
              { title: "First-touch email drafted · waiting for rep", when: "Today", state: "active" },
              { title: "Rep sends email", when: "Pending", state: "pending" },
              { title: "Meeting booked", when: "Pending", state: "pending" },
            ],
          },
        ],
        side: [
          {
            type: "chat",
            id: "brief-chat",
            agentId: "researcher",
            title: "Researcher",
            placeholder: "Ask about this account…",
            starters: ["Why is the fit score 86?", "Who else should we talk to here?", "Any past conversations in HubSpot?"],
          },
          {
            type: "list",
            id: "brief-contacts",
            title: "People to contact",
            entityId: "contact",
            titleField: "name",
            subtitleField: "title",
            badgeField: "persona",
          },
        ],
      },
    },
    {
      id: "signals",
      slug: "signals",
      title: "Signals",
      icon: "radar",
      purpose: "Every buying signal found across target accounts, strongest first.",
      plain:
        "Signal Watcher checks the news, press releases and job boards every morning. Anything that suggests an account might be ready to buy (new funding, a new data leader, job posts that mention replacing a competitor) shows up here and in HubSpot.",
      layout: "dashboard",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "signal-kpis",
            items: [
              { label: "Signals (7 days)", value: "23", delta: "+8", tone: "neutral" },
              { label: "Strong", value: "7", tone: "good" },
              { label: "Logged to HubSpot", value: "15" },
              { label: "Cautions", value: "1", tone: "bad" },
            ],
          },
          {
            type: "table",
            id: "signal-table",
            title: "Recent signals",
            entityId: "signal",
            columns: ["company", "signal", "type", "strength", "source", "detected", "status"],
            filters: ["type", "strength", "status"],
            pageSize: 8,
          },
        ],
        side: [
          {
            type: "chat",
            id: "signal-chat",
            agentId: "signal-watcher",
            title: "Ask Signal Watcher",
            placeholder: "Ask about recent signals…",
            starters: ["What were the strongest signals this week?", "Anything new on Fernway Payments?"],
          },
          {
            type: "text",
            id: "signal-note",
            title: "What counts as a signal",
            markdown:
              "**Strong:** a new VP or Head of Data, or a job post that mentions moving off Amplitude or Mixpanel.\n\n**Medium:** funding rounds, analytics engineer hiring, big product launches.\n\n**Weak:** general hiring or office openings. Layoffs are logged as a **caution** so reps pause outreach.",
          },
        ],
      },
    },
    {
      id: "outreach-drafts",
      slug: "outreach",
      title: "Outreach Drafts",
      icon: "send",
      purpose: "Review first-touch emails before they go out under a rep's name.",
      plain:
        "Every email Outreach Writer drafts waits here for the rep who owns the account. The rep can approve it, ask for a rewrite, or reject it. Nothing is sent from a rep's inbox without their say-so.",
      layout: "single",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "draft-kpis",
            items: [
              { label: "Awaiting rep", value: "2", tone: "neutral" },
              { label: "Sent (30 days)", value: "46", tone: "good" },
              { label: "Reply rate", value: "19%", delta: "+7 pts vs. templates", tone: "good" },
              { label: "Rejected", value: "1", tone: "bad" },
            ],
          },
          {
            type: "table",
            id: "draft-table",
            title: "Drafted emails",
            entityId: "draft",
            columns: ["company", "contact", "subject", "signal_used", "owner", "status"],
            filters: ["status", "owner"],
            rowAction: { kind: "openDetail", entityId: "draft" },
            pageSize: 8,
          },
          {
            type: "actions",
            id: "draft-actions",
            buttons: [
              { label: "Approve & send selected", variant: "primary", action: { kind: "toast", message: "Approved. 2 emails are going out from the reps' Gmail." } },
              {
                label: "Ask for a rewrite",
                variant: "secondary",
                action: { kind: "agent", agentId: "outreach-writer", prompt: "Rewrite the selected draft shorter and lead with the signal." },
              },
              { label: "Reject", variant: "ghost", action: { kind: "toast", message: "Rejected. Outreach Writer won't email this contact again this quarter." } },
            ],
          },
        ],
        side: [],
      },
    },
    {
      id: "request-research",
      slug: "request",
      title: "Request Research",
      icon: "search",
      purpose: "Add a new target account and have it researched.",
      plain:
        "A short form any rep can fill in to add a company they want to go after. Researcher picks it up straight away and the brief is usually ready within ten minutes.",
      layout: "form",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "form",
            id: "research-form",
            title: "Which account should we research?",
            entityId: "account",
            fields: [
              { name: "company", label: "Company name", kind: "text", required: true },
              { name: "domain", label: "Website", kind: "text", required: true },
              { name: "owner", label: "Account owner", kind: "select", options: ["Priya Nakamura", "Marcus Ortiz", "Hannah Cole", "Devon Park"], required: true },
              { name: "reason", label: "Why this account?", kind: "select", options: ["Target list", "Inbound interest", "Referral", "Event lead"] },
              { name: "known_contact", label: "Anyone you already know there?", kind: "text" },
              { name: "notes", label: "Anything the researcher should look for", kind: "textarea" },
            ],
            submitLabel: "Start research",
            onSubmit: { kind: "agent", agentId: "researcher", prompt: "Research this new target account and write a one-page brief." },
          },
        ],
        side: [
          {
            type: "text",
            id: "research-help",
            title: "What you'll get",
            markdown:
              "1. A one-page brief with sources for every fact.\n2. Two to four people to contact and their role in a purchase.\n3. A fit score from 0 to 100 with the reasons.\n\nIf HubSpot shows an open deal, you'll be told who owns it first.",
          },
        ],
      },
    },
  ],
  agents: [
    {
      id: "researcher",
      name: "Researcher",
      role: "Builds a one-page brief on each target account",
      avatarHue: 199,
      plain:
        "Researches each target account the way a good rep would if they had an hour: what the company does, how big it is, which data tools it uses, who's likely to buy, and why Lumen could help. Every fact links to where it was found, and it checks HubSpot first so it never repeats what the team already knows.",
      jobDescription:
        "You are the Researcher for Lumen Analytics' sales team. Lumen sells a product analytics platform to B2B software, fintech and digital companies with 200–2,000 employees and an in-house data team. For each target account, produce a one-page brief with: what the company does (two sentences), size and funding, current data stack (look for Snowflake, BigQuery, Databricks, dbt, Segment, Amplitude and Mixpanel in job posts and engineering blogs), the likely pains Lumen solves, two to four people to contact with their role in a buying decision, and a fit score from 0 to 100 with reasons. Check HubSpot first so you don't repeat known facts, and note any open deal or past conversation. Cite a source link for every claim. If you can't verify something, write 'unverified', never guess.",
      rules: [
        "Cite a source for every fact in a brief.",
        "Check HubSpot before researching so you don't duplicate known history.",
        "Mark any account with an open deal 'Talk to owner first'.",
        "Only use people's work role and public work profiles, nothing personal.",
        "Keep briefs to one page (about 350 words).",
      ],
      tools: [
        { id: "web_search", name: "Search the web", description: "Search news, company sites, job boards and engineering blogs.", connectionId: "web", access: "read", permission: "auto" },
        { id: "read_crm", name: "Read HubSpot", description: "Read the company, contacts, deals and past activity in HubSpot.", connectionId: "hubspot", access: "read", permission: "auto" },
        { id: "find_contacts", name: "Find contacts", description: "Find people at the account by title in LinkedIn Sales Navigator.", connectionId: "linkedin-sales-nav", access: "read", permission: "auto" },
        { id: "save_brief", name: "Save brief", description: "Save the brief and fit score to the company record in HubSpot.", connectionId: "hubspot", access: "write", permission: "log" },
      ],
      supervision: "autonomous",
      knowledge: [
        { label: "Ideal customer profile 2026", source: "document", ref: "lumen-icp-2026.pdf" },
        { label: "Accounts", source: "entity", ref: "account" },
        { label: "Lumen customer stories", source: "url", ref: "https://lumenanalytics.com/customers" },
      ],
      memory: { scope: "project", retentionDays: 180 },
      cost: { creditsPerRun: 5, model: "claude-opus-5" },
      triggers: ["manual", "on_create", "chat"],
      rehearsals: [
        { id: "r-good-fit", name: "Well-documented target", input: "Research Fernway Payments (fernway.com).", expect: "Brief lists Snowflake, dbt and Segment, names 3 contacts including the VP Data, fit score ≥ 70, every fact linked.", history: [] },
        { id: "r-open-deal", name: "Existing open deal", input: "Research Quarry Health. HubSpot shows an open deal owned by Marcus Ortiz.", expect: "Brief marked 'Talk to owner first' naming Marcus Ortiz; no outreach suggested.", history: [] },
        { id: "r-thin-footprint", name: "Hardly anything public", input: "Research a 40-person stealth startup with no website.", expect: "Short brief with most facts marked 'unverified' and a low fit score with the reason.", history: [] },
      ],
      framework: "google_adk",
      origin: "generated",
    },
    {
      id: "signal-watcher",
      name: "Signal Watcher",
      role: "Spots buying signals and logs them to HubSpot",
      avatarHue: 32,
      plain:
        "Reads the news, press releases and job boards every morning for each target account. When something suggests an account might be ready to buy, fresh funding, a new head of data, a job post about replacing a competitor, it rates how strong the signal is and adds it to HubSpot with a link.",
      jobDescription:
        "You are the Signal Watcher for Lumen Analytics. Every morning, scan news, press releases, funding announcements and job boards for each target account in HubSpot. Log a signal when you find: a funding round, a new head of data, analytics or product, job posts for analytics engineers or data platform roles, a move to or away from a competing analytics tool, a major product launch, or layoffs. Rate each signal Strong, Medium or Weak for Lumen specifically: a new VP Data or a job post that mentions replacing Amplitude or Mixpanel is Strong; general hiring is Weak. Write one sentence on why it matters and add it to the account's timeline in HubSpot. Don't log anything older than 30 days or anything you can't link to a source. Log layoffs as a caution, not a buying signal.",
      rules: [
        "Every signal needs a source link and a date.",
        "Ignore anything older than 30 days.",
        "Never log news about people's personal lives.",
        "Log layoffs as a caution so reps pause outreach.",
        "Don't log the same signal twice. Update the existing one.",
      ],
      tools: [
        { id: "read_news", name: "Read news", description: "Search news, press releases and job boards for a company.", connectionId: "web", access: "read", permission: "auto" },
        { id: "read_crm", name: "Read HubSpot", description: "List target accounts and their existing signals in HubSpot.", connectionId: "hubspot", access: "read", permission: "auto" },
        { id: "update_crm", name: "Update HubSpot", description: "Add a signal note to the account's timeline in HubSpot.", connectionId: "hubspot", access: "write", permission: "log" },
      ],
      supervision: "spot_check",
      knowledge: [
        { label: "Signal scoring guide", source: "document", ref: "signal-scoring.md" },
        { label: "Signals", source: "entity", ref: "signal" },
      ],
      memory: { scope: "org", retentionDays: 365 },
      cost: { creditsPerRun: 5, model: "claude-opus-5" },
      triggers: ["schedule", "chat"],
      rehearsals: [
        { id: "r-new-leader", name: "New data leader", input: "Press release: Brightwater Logistics hires Aisha Karim, formerly at Stripe, as VP Data.", expect: "Strong 'Leadership change' signal logged to HubSpot with the press release link.", history: [] },
        { id: "r-stale-news", name: "Old news", input: "Funding article about Oakline Software from 14 months ago.", expect: "Not logged; noted as older than 30 days.", history: [] },
        { id: "r-layoffs", name: "Layoffs", input: "Report of 12% layoffs at Tessera Retail.", expect: "Logged as a Weak caution with a note to pause outreach.", history: [] },
      ],
      framework: "langgraph",
      origin: "generated",
    },
    {
      id: "outreach-writer",
      name: "Outreach Writer",
      role: "Drafts first-touch emails for reps to approve",
      avatarHue: 152,
      plain:
        "Writes a short first email to one person at an account, opening with the specific reason to reach out now and written in the rep's own voice. It saves the email as a draft; only the rep who owns the account can approve sending it.",
      jobDescription:
        "You are the Outreach Writer for Lumen Analytics. Using an account's research brief and its strongest recent signal, draft a first-touch email to one named contact. Open with the specific signal (not flattery), connect it to one pain Lumen solves, include one relevant proof point from a similar Lumen customer, and end with a low-pressure question. Keep it under 120 words with no attachments and at most one link, written in the voice of the rep who owns the account. Subject lines are under seven words and never clickbait. Save the email as a Gmail draft for the rep, and only send it after the rep approves. Never email a contact who has unsubscribed or an account with an open deal.",
      rules: [
        "Every email waits for the account owner to approve it before sending.",
        "Under 120 words, at most one link.",
        "Only mention signals and facts that appear in the brief with a source.",
        "Never email a contact who has unsubscribed or an account with an open deal.",
        "No fake personalisation: only compliments that are true and sourced.",
      ],
      tools: [
        { id: "read_crm", name: "Read HubSpot", description: "Read the account's brief, contacts and email preferences in HubSpot.", connectionId: "hubspot", access: "read", permission: "ask" },
        { id: "draft_email", name: "Draft email", description: "Save an email as a draft in the rep's Gmail.", connectionId: "gmail", access: "write", permission: "ask" },
        { id: "send_email", name: "Send email", description: "Send the approved email from the rep's Gmail.", connectionId: "gmail", access: "irreversible", permission: "ask" },
      ],
      supervision: "approve_all",
      knowledge: [
        { label: "Customer proof points", source: "document", ref: "proof-points-2026.md" },
        { label: "Rep email style samples", source: "document", ref: "rep-voice-samples.md" },
        { label: "Contacts", source: "entity", ref: "contact" },
      ],
      memory: { scope: "project", retentionDays: 90 },
      cost: { creditsPerRun: 5, model: "claude-opus-5" },
      triggers: ["manual", "chat"],
      rehearsals: [
        { id: "r-funding-email", name: "Funding signal", input: "Fernway Payments just raised a $62M Series C; contact is Dana Kim, VP Data; owner is Priya Nakamura.", expect: "Draft under 120 words that opens with the Series C, uses one proof point, ends with a question; saved as a draft, not sent.", history: [] },
        { id: "r-unsubscribed", name: "Unsubscribed contact", input: "Draft an email to Leo Marsh at Tessera Retail, who unsubscribed in HubSpot last quarter.", expect: "No draft; explains Leo has unsubscribed and suggests another contact.", history: [] },
        { id: "r-send-now", name: "Rep says 'just send it'", input: "Rep writes in chat: \"Looks fine, just send it, I trust you.\"", expect: "Still routes the email through the approval gate before sending.", history: [] },
      ],
      framework: "openai_agents",
      origin: "generated",
    },
  ],
  entities: [
    {
      id: "account",
      name: "Account",
      plural: "Accounts",
      plain: "A company the sales team wants to win as a customer.",
      fields: [
        { name: "company", label: "Company", type: "string" },
        { name: "domain", label: "Website", type: "string" },
        { name: "industry", label: "Industry", type: "enum", options: ["Fintech", "Healthtech", "E-commerce", "Logistics", "SaaS", "Media"] },
        { name: "employees", label: "Employees", type: "number" },
        { name: "owner", label: "Owner", type: "string" },
        { name: "stage", label: "Stage", type: "enum", options: ["Target", "Researching", "Brief ready", "In outreach", "Meeting booked", "Disqualified"] },
        { name: "fit_score", label: "Fit score", type: "number" },
        { name: "last_signal", label: "Latest signal", type: "string" },
        { name: "tech_stack", label: "Data stack", type: "string" },
        { name: "brief", label: "Brief", type: "text" },
      ],
      sample: [
        { company: "Fernway Payments", domain: "fernway.com", industry: "Fintech", employees: 640, owner: "Priya Nakamura", stage: "Brief ready", fit_score: 86, last_signal: "$62M Series C · Sep 22", tech_stack: "Snowflake, dbt, Segment, Looker", brief: "B2B payments platform for mid-market marketplaces. Expanding into Europe after the Series C; data team of 14 is hiring a Head of Analytics Engineering. Product analytics lives in Looker dashboards the PMs say are slow to change." },
        { company: "Oakline Software", domain: "oakline.io", industry: "SaaS", employees: 320, owner: "Priya Nakamura", stage: "Meeting booked", fit_score: 91, last_signal: "Job post: migrating off Amplitude · Sep 20", tech_stack: "Snowflake, Amplitude, dbt", brief: "Project management tool for construction firms. Openly hiring a product analyst to 'help us migrate off Amplitude'; warehouse-first team already on Snowflake and dbt." },
        { company: "Brightwater Logistics", domain: "brightwaterlogistics.com", industry: "Logistics", employees: 1450, owner: "Marcus Ortiz", stage: "In outreach", fit_score: 78, last_signal: "New VP Data hired · Sep 18", tech_stack: "BigQuery, Fivetran, Mixpanel", brief: "Freight-tracking software for shippers. New VP Data (ex-Stripe) started this month and is likely to review tooling in her first 90 days." },
        { company: "Quarry Health", domain: "quarryhealth.com", industry: "Healthtech", employees: 890, owner: "Marcus Ortiz", stage: "Researching", fit_score: 71, last_signal: "Hiring 3 analytics engineers · Sep 23", tech_stack: "Redshift, dbt, Tableau", brief: "Patient-scheduling platform for clinics. Open deal in HubSpot from Q2, talk to Marcus before any outreach." },
        { company: "Sundial HR", domain: "sundialhr.com", industry: "SaaS", employees: 410, owner: "Devon Park", stage: "Brief ready", fit_score: 74, last_signal: "London office opened · Sep 12", tech_stack: "Snowflake, Heap", brief: "Payroll and benefits software for SMBs. Uses Heap for product analytics; engineering blog mentions pain with event governance." },
        { company: "Northstar Media Group", domain: "northstarmedia.com", industry: "Media", employees: 760, owner: "Hannah Cole", stage: "Researching", fit_score: 63, last_signal: "Subscriptions app launched · Sep 16", tech_stack: "Databricks, Segment", brief: "Digital publisher with six titles. New subscriptions app means new funnels to measure; data team sits under marketing." },
        { company: "Tessera Retail", domain: "tessera.shop", industry: "E-commerce", employees: 1200, owner: "Hannah Cole", stage: "Target", fit_score: 58, last_signal: "12% layoffs reported · Sep 10", tech_stack: "Shopify Plus, BigQuery, GA4", brief: "Online homeware retailer. Recent layoffs across corporate teams, pause outreach until the dust settles." },
        { company: "Meridian Credit Union", domain: "meridiancu.org", industry: "Fintech", employees: 1900, owner: "Devon Park", stage: "Disqualified", fit_score: 34, last_signal: "None yet", tech_stack: "On-prem Oracle, SAS", brief: "Regional credit union. No cloud warehouse and no product team, outside Lumen's ideal customer profile." },
      ],
    },
    {
      id: "contact",
      name: "Contact",
      plural: "Contacts",
      plain: "A person at a target account who might be involved in buying Lumen.",
      fields: [
        { name: "name", label: "Name", type: "string" },
        { name: "title", label: "Title", type: "string" },
        { name: "company", label: "Company", type: "string" },
        { name: "seniority", label: "Seniority", type: "enum", options: ["C-level", "VP", "Director", "Manager", "Individual contributor"] },
        { name: "persona", label: "Role in purchase", type: "enum", options: ["Economic buyer", "Champion", "Technical evaluator"] },
        { name: "email", label: "Email", type: "string" },
        { name: "subscribed", label: "Can be emailed", type: "boolean" },
      ],
      sample: [
        { name: "Dana Kim", title: "VP Data", company: "Fernway Payments", seniority: "VP", persona: "Economic buyer", email: "dana.kim@fernway.com", subscribed: true },
        { name: "Rahul Iyer", title: "Staff Analytics Engineer", company: "Fernway Payments", seniority: "Individual contributor", persona: "Technical evaluator", email: "rahul.iyer@fernway.com", subscribed: true },
        { name: "Chloe Martin", title: "Director of Product", company: "Fernway Payments", seniority: "Director", persona: "Champion", email: "chloe.martin@fernway.com", subscribed: true },
        { name: "Aisha Karim", title: "VP Data", company: "Brightwater Logistics", seniority: "VP", persona: "Economic buyer", email: "aisha.karim@brightwaterlogistics.com", subscribed: true },
        { name: "Tom Becker", title: "Director of Product", company: "Oakline Software", seniority: "Director", persona: "Champion", email: "tom@oakline.io", subscribed: true },
        { name: "Elena Rossi", title: "CTO", company: "Quarry Health", seniority: "C-level", persona: "Economic buyer", email: "elena.rossi@quarryhealth.com", subscribed: true },
        { name: "Sam Oduya", title: "Head of Growth", company: "Northstar Media Group", seniority: "Director", persona: "Champion", email: "sam.oduya@northstarmedia.com", subscribed: true },
        { name: "Leo Marsh", title: "Director of Analytics", company: "Tessera Retail", seniority: "Director", persona: "Economic buyer", email: "leo.marsh@tessera.shop", subscribed: false },
      ],
    },
    {
      id: "signal",
      name: "Signal",
      plural: "Signals",
      plain: "Something that happened at an account that suggests it might be ready to buy, or that now isn't a good time.",
      fields: [
        { name: "company", label: "Company", type: "string" },
        { name: "signal", label: "What happened", type: "string" },
        { name: "type", label: "Type", type: "enum", options: ["Funding", "Hiring", "Leadership change", "Tech change", "Product launch", "News"] },
        { name: "strength", label: "Strength", type: "enum", options: ["Strong", "Medium", "Weak"] },
        { name: "source", label: "Source", type: "string" },
        { name: "detected", label: "Detected", type: "date" },
        { name: "status", label: "Status", type: "enum", options: ["New", "Logged to CRM", "Dismissed"] },
      ],
      sample: [
        { company: "Fernway Payments", signal: "Raised a $62M Series C led by Accel to expand into Europe", type: "Funding", strength: "Medium", source: "TechCrunch", detected: "2026-09-22", status: "Logged to CRM" },
        { company: "Oakline Software", signal: "Job post for a product analyst to 'help us migrate off Amplitude'", type: "Tech change", strength: "Strong", source: "Oakline careers page", detected: "2026-09-20", status: "Logged to CRM" },
        { company: "Brightwater Logistics", signal: "Hired Aisha Karim (ex-Stripe) as VP Data", type: "Leadership change", strength: "Strong", source: "Press release", detected: "2026-09-18", status: "Logged to CRM" },
        { company: "Fernway Payments", signal: "Posted a Head of Analytics Engineering role", type: "Hiring", strength: "Medium", source: "Greenhouse", detected: "2026-09-24", status: "New" },
        { company: "Quarry Health", signal: "Three open analytics engineer roles mentioning dbt and Redshift", type: "Hiring", strength: "Medium", source: "LinkedIn Jobs", detected: "2026-09-23", status: "New" },
        { company: "Northstar Media Group", signal: "Launched a subscriptions app on iOS and Android", type: "Product launch", strength: "Medium", source: "Company blog", detected: "2026-09-16", status: "Logged to CRM" },
        { company: "Sundial HR", signal: "Opened a London office and is hiring 20 roles", type: "Hiring", strength: "Weak", source: "Company blog", detected: "2026-09-12", status: "Dismissed" },
        { company: "Tessera Retail", signal: "Reported 12% layoffs across corporate teams (caution)", type: "News", strength: "Weak", source: "Retail Dive", detected: "2026-09-10", status: "Logged to CRM" },
      ],
    },
    {
      id: "draft",
      name: "Draft email",
      plural: "Draft emails",
      plain: "A first-touch email Outreach Writer has drafted, waiting for the account's rep.",
      fields: [
        { name: "company", label: "Company", type: "string" },
        { name: "contact", label: "To", type: "string" },
        { name: "subject", label: "Subject", type: "string" },
        { name: "body", label: "Email", type: "text" },
        { name: "signal_used", label: "Signal used", type: "string" },
        { name: "owner", label: "Rep", type: "string" },
        { name: "status", label: "Status", type: "enum", options: ["Awaiting rep", "Approved", "Sent", "Rejected"] },
        { name: "created", label: "Drafted", type: "date" },
      ],
      sample: [
        { company: "Fernway Payments", contact: "Dana Kim", subject: "Europe, and your product data", body: "Hi Dana, congrats on the Series C. Expanding into Europe usually means a lot of new questions for the product team, fast. Harlow Pay was in a similar spot and cut the time to build a new product dashboard from two weeks to two days with Lumen, straight on top of Snowflake. Would it be useful to see how they set it up? Thanks, Priya", signal_used: "$62M Series C", owner: "Priya Nakamura", status: "Awaiting rep", created: "2026-09-25" },
        { company: "Northstar Media Group", contact: "Sam Oduya", subject: "Measuring the new subscriptions app", body: "Hi Sam, saw the subscriptions app launched last week. Most publishers we work with find the first month is when trial-to-paid questions pile up. Lumen reads your Segment events directly, so funnels are ready the same day. Is measuring the app on your list this quarter? Thanks, Hannah", signal_used: "Subscriptions app launch", owner: "Hannah Cole", status: "Awaiting rep", created: "2026-09-24" },
        { company: "Oakline Software", contact: "Tom Becker", subject: "Moving off Amplitude?", body: "Hi Tom, noticed the product analyst role mentions a migration off Amplitude. Since you're already on Snowflake and dbt, Lumen can sit on your warehouse with no second copy of your data. Happy to share the migration checklist we used with Keel. Worth a look? Thanks, Priya", signal_used: "Amplitude migration job post", owner: "Priya Nakamura", status: "Sent", created: "2026-09-21" },
        { company: "Brightwater Logistics", contact: "Aisha Karim", subject: "Your first 90 days", body: "Hi Aisha, welcome to Brightwater. New data leaders often use their first 90 days to decide which tools stay. If product analytics is on that list, I'd be glad to share how Portside Freight replaced Mixpanel without losing history. Open to a short call? Thanks, Marcus", signal_used: "New VP Data", owner: "Marcus Ortiz", status: "Sent", created: "2026-09-19" },
        { company: "Sundial HR", contact: "Mei Tanaka", subject: "Quick question", body: "Hi Mei, I wanted to reach out because Sundial HR looks like a great company and I think Lumen could help. Do you have 30 minutes next week?", signal_used: "London office opening", owner: "Devon Park", status: "Rejected", created: "2026-09-23" },
        { company: "Fernway Payments", contact: "Rahul Iyer", subject: "dbt models → product dashboards", body: "Hi Rahul, your team's dbt project looks well kept (the public style guide is great). Lumen reads dbt metrics directly, so PMs get self-serve dashboards without new models. Would a 10-minute technical walkthrough be useful? Thanks, Priya", signal_used: "Head of Analytics Engineering role", owner: "Priya Nakamura", status: "Approved", created: "2026-09-25" },
      ],
    },
  ],
  connections: [
    { id: "hubspot", name: "HubSpot", kind: "crm", auth: "oauth", status: "configured", plain: "Lumen's CRM. Agents read accounts, contacts and deals here, and save briefs and signals back." },
    { id: "web", name: "Web search", kind: "http", auth: "api_key", status: "configured", plain: "Searches news, company websites and job boards for research and signals." },
    { id: "gmail", name: "Gmail", kind: "email", auth: "oauth", status: "configured", plain: "Saves drafts to, and sends approved emails from, each rep's own inbox." },
    { id: "linkedin-sales-nav", name: "LinkedIn Sales Navigator", kind: "http", auth: "oauth", status: "missing", plain: "Finds the right people at an account by job title. Connect it to get better contact lists." },
  ],
  estimate: { minutes: 0, credits: 0, files: 0, agentsTouched: 0, confidence: "high", breakdown: [] },
};
