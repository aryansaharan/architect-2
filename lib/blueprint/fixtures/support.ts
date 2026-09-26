import type { BlueprintInput } from "../schema";

/**
 * Support demo: a B2B SaaS support inbox.
 * PagerDuty starts "missing" on purpose: Escalation's third rehearsal
 * checks that it falls back to Slack and tells the team the page didn't go out.
 */
export const supportBrief =
  "A support inbox for Northwind Cloud: read every incoming ticket, draft answers from our help centre, escalate outages to on-call, and let the team approve replies before they go out.";

export const supportFixture: BlueprintInput = {
  version: 1,
  meta: {
    name: "Support Inbox",
    tagline: "Every ticket read, answered from the help centre, and approved before it goes out.",
    vertical: "support",
    plain:
      "An internal inbox for Northwind Cloud's support team. Every new ticket is read and prioritised by one agent, a second drafts a reply using only what's in Northwind's help centre, and a third watches for many customers reporting the same problem at once and gets on-call involved. No reply reaches a customer until a person approves it.",
    theme: { primary: "#4F46E5", radius: "md", density: "comfortable", mode: "light" },
    auth: { enabled: true, providers: ["google", "sso"] },
    region: "us",
  },
  screens: [
    {
      id: "inbox",
      slug: "inbox",
      title: "Inbox",
      icon: "inbox",
      purpose: "See every open ticket, how urgent it is, and what's waiting on a person.",
      plain:
        "The screen the support team lives in. It lists open tickets with the priority Ticket Triage gave each one, shows which replies are waiting for approval, and highlights anything close to missing its response-time promise.",
      layout: "dashboard",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "inbox-kpis",
            items: [
              { label: "Open tickets", value: "47", delta: "+6 since 9am", tone: "neutral" },
              { label: "Median first response", value: "11m", delta: "−63%", tone: "good" },
              { label: "Replies awaiting approval", value: "8", tone: "neutral" },
              { label: "SLA at risk", value: "3", tone: "bad" },
              { label: "CSAT (7 days)", value: "94%", delta: "+2 pts", tone: "good" },
            ],
          },
          {
            type: "table",
            id: "inbox-table",
            title: "Open tickets",
            entityId: "ticket",
            columns: ["ticket_no", "subject", "customer", "category", "priority", "status", "sla_due"],
            filters: ["status", "priority", "category"],
            rowAction: { kind: "navigate", screenId: "ticket-detail" },
            pageSize: 8,
          },
        ],
        side: [
          {
            type: "chat",
            id: "inbox-chat",
            agentId: "ticket-triage",
            title: "Ask Ticket Triage",
            placeholder: "Ask about today's tickets…",
            starters: [
              "What's urgent right now?",
              "Summarise today's tickets from Enterprise customers",
              "Which tickets are close to breaching SLA?",
            ],
          },
        ],
      },
    },
    {
      id: "ticket-detail",
      slug: "ticket",
      title: "Ticket",
      icon: "ticket",
      purpose: "Everything about one ticket, what the agents did, and the reply waiting to go out.",
      plain:
        "Opens when someone clicks a ticket. Shows the customer's message, the category and priority with the reason behind them, everything that has happened so far, and buttons to have a reply drafted or to escalate to the on-call engineer.",
      layout: "split",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "detail",
            id: "ticket-detail-card",
            title: "Ticket",
            entityId: "ticket",
            fields: ["ticket_no", "subject", "customer", "category", "priority", "status", "channel", "assignee", "sla_due", "opened", "summary"],
            actions: [
              {
                label: "Draft a reply",
                variant: "primary",
                action: { kind: "agent", agentId: "reply-drafter", prompt: "Draft a reply to this ticket from the help centre." },
              },
              {
                label: "Escalate to on-call",
                variant: "danger",
                action: { kind: "agent", agentId: "escalation", prompt: "Check whether this ticket is part of an outage and escalate if so." },
              },
            ],
          },
          {
            type: "timeline",
            id: "ticket-timeline",
            title: "History",
            items: [
              { title: "Ticket received by email from Pinecrest Bank", when: "14:07", state: "done" },
              { title: "Triaged · Outage · Urgent (Enterprise, production down)", when: "14:07", state: "done" },
              { title: "Escalation matched 3 similar tickets in 20 minutes", when: "14:09", state: "done" },
              { title: "On-call paged · approved by J. Alvarez", when: "14:11", state: "done" },
              { title: "Status posted in #support-incidents", when: "14:12", state: "done" },
              { title: "Reply drafted · waiting for approval", when: "In progress", state: "active" },
              { title: "Reply sent to customer", when: "Pending", state: "pending" },
            ],
          },
        ],
        side: [
          {
            type: "chat",
            id: "ticket-chat",
            agentId: "reply-drafter",
            title: "Reply Drafter",
            placeholder: "Ask for a change to the draft…",
            starters: ["Make the reply shorter", "Which help centre articles did you use?", "Rewrite it for a non-technical reader"],
          },
        ],
      },
    },
    {
      id: "reply-approvals",
      slug: "approvals",
      title: "Reply Approvals",
      icon: "send",
      purpose: "Read and approve every reply before it is emailed to a customer.",
      plain:
        "Every reply Reply Drafter writes waits here with the articles it used and how confident it is. Nothing is emailed to a customer until someone on the team presses Approve, or sends it back with a note.",
      layout: "single",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "approval-kpis",
            items: [
              { label: "Awaiting approval", value: "8", tone: "neutral" },
              { label: "Approved today", value: "31", delta: "+9 vs. yesterday", tone: "good" },
              { label: "Sent without edits", value: "78%", tone: "good" },
              { label: "Sent back", value: "2", tone: "bad" },
            ],
          },
          {
            type: "table",
            id: "reply-table",
            title: "Drafted replies",
            entityId: "reply",
            columns: ["ticket_no", "customer", "subject", "sources", "confidence", "status"],
            filters: ["status"],
            rowAction: { kind: "openDetail", entityId: "reply" },
            pageSize: 8,
          },
          {
            type: "actions",
            id: "reply-actions",
            buttons: [
              { label: "Approve & send selected", variant: "primary", action: { kind: "toast", message: "Approved. 3 replies are on their way from support@northwind.cloud." } },
              { label: "Send back with a note", variant: "secondary", action: { kind: "toast", message: "Sent back. Reply Drafter will revise and return it here." } },
            ],
          },
        ],
        side: [],
      },
    },
    {
      id: "customers",
      slug: "customers",
      title: "Customers",
      icon: "building-2",
      purpose: "See which accounts are raising tickets and which ones are at risk.",
      plain:
        "A view for team leads and account managers. It shows each customer's plan, how many tickets they have open and how happy they've been recently, so the team knows who needs extra care.",
      layout: "dashboard",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "kpis",
            id: "customer-kpis",
            items: [
              { label: "Accounts with open tickets", value: "31" },
              { label: "At-risk accounts", value: "4", delta: "+1 this week", tone: "bad" },
              { label: "Enterprise tickets (7 days)", value: "23", tone: "neutral" },
              { label: "CSAT (30 days)", value: "93%", delta: "+1 pt", tone: "good" },
            ],
          },
          {
            type: "table",
            id: "customer-table",
            title: "Customers",
            entityId: "customer",
            columns: ["name", "plan", "arr", "csm", "open_tickets", "csat", "health"],
            filters: ["plan", "health"],
            pageSize: 8,
          },
        ],
        side: [
          {
            type: "text",
            id: "customer-note",
            title: "How plan affects priority",
            markdown:
              "Ticket Triage treats any **Enterprise** customer who says they're blocked as at least **High**. Accounts marked **At risk** by their CSM are bumped one level, and their CSM is copied on the reply.",
          },
        ],
      },
    },
    {
      id: "help-centre",
      slug: "help-centre",
      title: "Help Centre",
      icon: "book-open",
      purpose: "See which articles the drafter relies on and where the help centre has gaps.",
      plain:
        "Reply Drafter only answers from Northwind's help centre. This screen shows which articles it uses most, which ones need a refresh, and lets you ask it which customer questions had no good article to answer from.",
      layout: "split",
      audience: "team",
      status: "planned",
      regions: {
        main: [
          {
            type: "list",
            id: "article-list",
            title: "Articles used in replies",
            entityId: "article",
            titleField: "title",
            subtitleField: "section",
            badgeField: "times_used",
          },
          {
            type: "actions",
            id: "help-centre-actions",
            buttons: [
              {
                label: "Find gaps in the help centre",
                variant: "primary",
                action: { kind: "agent", agentId: "reply-drafter", prompt: "Which customer questions from the last 7 days had no matching help centre article?" },
              },
              {
                label: "List articles to refresh",
                variant: "secondary",
                action: { kind: "agent", agentId: "reply-drafter", prompt: "List articles marked Needs review that were used in replies this week." },
              },
            ],
          },
        ],
        side: [
          {
            type: "text",
            id: "help-centre-note",
            title: "How drafts use the help centre",
            markdown:
              "Reply Drafter searches published articles, quotes only what they say, and links every article it used. If nothing matches, it **doesn't guess**. It leaves an internal note and suggests an article to write.\n\nArticles marked **Needs review** are still used, but the draft is flagged so you check it more carefully.",
          },
        ],
      },
    },
  ],
  agents: [
    {
      id: "ticket-triage",
      name: "Ticket Triage",
      role: "Classifies and prioritises every new ticket",
      avatarHue: 239,
      plain:
        "Reads every new ticket the moment it lands in Zendesk, works out what it's about and how urgent it is, and sets the priority so the most serious problems and the biggest customers are seen first. It explains each decision in one line so the team can overrule it.",
      jobDescription:
        "You are Ticket Triage for Northwind Cloud's support team. For every new ticket: read the full thread, look up the customer's plan and account health, and classify it into exactly one category: Billing, Bug, How-to, Outage, Account access or Feature request. Set priority with this policy: Urgent for suspected outages, data loss, or any Enterprise customer who is blocked in production; High for Enterprise or Growth customers with a broken workflow or a billing error; Normal for how-to questions and non-blocking bugs; Low for feature requests. Write a one-line reason for every decision (for example 'Enterprise, webhooks failing in production'). If three or more tickets mention the same error within 30 minutes, tag each one 'possible-outage' so Escalation can look. You never reply to customers.",
      rules: [
        "Never reply to a customer. Only classify and prioritise.",
        "Any Enterprise customer who says they are blocked is at least High.",
        "Tag 'possible-outage' when 3+ tickets mention the same error within 30 minutes.",
        "Always give a one-line reason for the priority you set.",
        "If a ticket isn't in English, keep it in the queue and note the language.",
      ],
      tools: [
        { id: "read_ticket", name: "Read ticket", description: "Read a ticket, its full thread and attachments from Zendesk.", connectionId: "zendesk", access: "read", permission: "auto" },
        { id: "lookup_customer", name: "Look up customer", description: "Fetch the customer's plan, CSM and account health.", connectionId: "zendesk", access: "read", permission: "auto" },
        { id: "set_priority", name: "Set priority", description: "Set a ticket's category, priority and tags in Zendesk.", connectionId: "zendesk", access: "write", permission: "log" },
      ],
      supervision: "autonomous",
      knowledge: [
        { label: "Support priority policy", source: "document", ref: "support-priority-policy.md" },
        { label: "Customers", source: "entity", ref: "customer" },
      ],
      memory: { scope: "project", retentionDays: 90 },
      cost: { creditsPerRun: 1, model: "claude-opus-5" },
      triggers: ["on_create", "chat"],
      rehearsals: [
        { id: "r-enterprise-outage", name: "Enterprise webhooks down", input: "Pinecrest Bank (Enterprise): \"All our webhooks started returning 502 ten minutes ago. Payment reconciliation has stopped.\"", expect: "Category Outage, priority Urgent, tagged 'possible-outage'; reason mentions Enterprise and production impact.", history: [] },
        { id: "r-feature-request", name: "Feature request", input: "Starter customer asks whether the dashboard can have a dark mode.", expect: "Category Feature request, priority Low, no outage tag.", history: [] },
        { id: "r-double-charge", name: "Double charge", input: "Growth customer says their September invoice was charged twice ($1,188 each).", expect: "Category Billing, priority High; reason cites the duplicate charge.", history: [] },
      ],
      framework: "lyzr",
      origin: "generated",
    },
    {
      id: "reply-drafter",
      name: "Reply Drafter",
      role: "Drafts replies from the help centre",
      avatarHue: 262,
      plain:
        "Writes a reply to each ticket using only what's in Northwind's help centre, and links the articles it used. A person reads every draft and presses Approve before anything is emailed to a customer.",
      jobDescription:
        "You are Reply Drafter for Northwind Cloud support. For each triaged ticket, search the help centre and draft a reply that answers the customer's actual question in plain language. Use only facts from published help centre articles or the ticket itself, and cite each article you used by title and link. Match Northwind's voice: warm, direct, no jargon, no exclamation marks; sign off as 'The Northwind Support Team'. Keep replies under 180 words and put any steps in a numbered list. If no article covers the question, don't guess. Write an internal note saying so and suggest the article that should exist. Give every draft a confidence score from 0 to 1. Never send a reply without a person's approval.",
      rules: [
        "Only use facts from the help centre or the ticket. Never invent features, dates or prices.",
        "Cite every article you used.",
        "Never promise refunds, credits or fix dates.",
        "Every reply waits for a person to approve it before it is sent.",
        "Keep replies under 180 words.",
      ],
      tools: [
        { id: "read_ticket", name: "Read ticket", description: "Read a ticket, its full thread and attachments from Zendesk.", connectionId: "zendesk", access: "read", permission: "auto" },
        { id: "search_help_centre", name: "Search help centre", description: "Search published help centre articles and return matching passages.", connectionId: "help-centre", access: "read", permission: "auto" },
        { id: "send_reply", name: "Send reply", description: "Email the approved reply to the customer from support@northwind.cloud.", connectionId: "gmail", access: "irreversible", permission: "ask" },
      ],
      supervision: "approve_all",
      knowledge: [
        { label: "Help centre articles", source: "entity", ref: "article" },
        { label: "Northwind voice & tone guide", source: "document", ref: "voice-and-tone.pdf" },
        { label: "Public status page", source: "url", ref: "https://status.northwind.cloud" },
      ],
      memory: { scope: "project", retentionDays: 60 },
      cost: { creditsPerRun: 3, model: "claude-opus-5" },
      triggers: ["on_create", "manual", "chat"],
      rehearsals: [
        { id: "r-howto-article", name: "How-to with an article", input: "\"How do I rotate my API keys without any downtime?\"", expect: "Numbered steps from 'Rotating API keys safely', article linked, confidence ≥ 0.8, waiting for approval.", history: [] },
        { id: "r-no-article", name: "No matching article", input: "\"Can Northwind replicate our data to Azure Government regions?\"", expect: "No customer reply drafted; internal note says the help centre doesn't cover it and suggests an article.", history: [] },
        { id: "r-refund-demand", name: "Refund demand", input: "Growth customer demands a refund for yesterday's 40-minute outage.", expect: "Apologises, links 'Refunds and SLA credits', makes no refund promise.", history: [] },
      ],
      framework: "crewai",
      origin: "generated",
    },
    {
      id: "escalation",
      name: "Escalation",
      role: "Spots outages and gets on-call involved",
      avatarHue: 4,
      plain:
        "Watches the inbox for signs that something is broken for many customers at once: the same error from several accounts in a short time. When it spots one, it asks you before paging the on-call engineer, then posts an update in Slack so the whole company knows.",
      jobDescription:
        "You are Escalation for Northwind Cloud support. Watch new tickets tagged 'possible-outage' and search for others describing the same symptom. Declare a suspected incident when 3 or more customers (or any 2 Enterprise customers) report the same error within 30 minutes. For a suspected incident: write a four-line summary (what customers are seeing, first report time, affected customers and plans, likely component), request approval to page the on-call engineer in PagerDuty, and post the summary in #support-incidents. Link all related tickets to the first one. Describe symptoms only; never guess at a root cause or a fix time. If PagerDuty can't be reached, say so clearly in Slack so a person can phone on-call.",
      rules: [
        "Always get approval before paging on-call.",
        "Only page when 3+ customers (or 2 Enterprise customers) report the same symptom within 30 minutes.",
        "Post one Slack message per incident. Update it rather than posting again.",
        "Never tell anyone a cause or a fix time.",
      ],
      tools: [
        { id: "search_tickets", name: "Search tickets", description: "Find recent tickets that mention the same error or symptom.", connectionId: "zendesk", access: "read", permission: "auto" },
        { id: "page_on_call", name: "Page on-call", description: "Open a PagerDuty incident and page the on-call engineer.", connectionId: "pagerduty", access: "irreversible", permission: "ask" },
        { id: "post_status", name: "Post status", description: "Post or update the incident summary in #support-incidents.", connectionId: "slack", access: "write", permission: "log" },
      ],
      supervision: "spot_check",
      knowledge: [
        { label: "Incident runbook", source: "document", ref: "incident-runbook.md" },
        { label: "Tickets", source: "entity", ref: "ticket" },
      ],
      memory: { scope: "org", retentionDays: 180 },
      cost: { creditsPerRun: 2, model: "claude-opus-5" },
      triggers: ["on_create", "schedule", "chat"],
      rehearsals: [
        { id: "r-webhook-outage", name: "Webhook outage", input: "Four customers report webhook 502 errors within 18 minutes; two are on Enterprise.", expect: "Suspected incident declared; the page waits for approval; one message in #support-incidents listing all 4 tickets.", history: [] },
        { id: "r-coincidence", name: "Unrelated reports", input: "Two Starter customers report slow dashboards three hours apart.", expect: "No page and no Slack post; tickets stay with Triage.", history: [] },
        { id: "r-pagerduty-missing", name: "PagerDuty not connected", input: "Clear outage pattern across 5 customers, but the PagerDuty connection is missing.", expect: "Posts in Slack and says the page couldn't be sent and why.", history: [] },
      ],
      framework: "mastra",
      origin: "generated",
    },
  ],
  entities: [
    {
      id: "ticket",
      name: "Ticket",
      plural: "Tickets",
      plain: "A question or problem a customer has sent to Northwind support.",
      fields: [
        { name: "ticket_no", label: "Ticket #", type: "string" },
        { name: "subject", label: "Subject", type: "string" },
        { name: "customer", label: "Customer", type: "string" },
        { name: "category", label: "Category", type: "enum", options: ["Billing", "Bug", "How-to", "Outage", "Account access", "Feature request"] },
        { name: "priority", label: "Priority", type: "enum", options: ["Urgent", "High", "Normal", "Low"] },
        { name: "status", label: "Status", type: "enum", options: ["New", "Triaged", "Awaiting approval", "Replied", "Escalated", "Solved"] },
        { name: "channel", label: "Channel", type: "enum", options: ["Email", "Chat", "Web form"] },
        { name: "assignee", label: "Assignee", type: "string" },
        { name: "sla_due", label: "SLA due", type: "string" },
        { name: "opened", label: "Opened", type: "date" },
        { name: "summary", label: "Summary", type: "text" },
      ],
      sample: [
        { ticket_no: "NW-48211", subject: "Webhooks returning 502 since 14:05 UTC", customer: "Pinecrest Bank", category: "Outage", priority: "Urgent", status: "Escalated", channel: "Email", assignee: "J. Alvarez", sla_due: "in 12m", opened: "2026-09-25", summary: "All webhook deliveries to their payments endpoint fail with 502; reconciliation jobs have stopped. Matches 3 other reports in 20 minutes." },
        { ticket_no: "NW-48212", subject: "Webhook deliveries failing for us too", customer: "Orbital Freight", category: "Outage", priority: "Urgent", status: "Escalated", channel: "Chat", assignee: "J. Alvarez", sla_due: "in 18m", opened: "2026-09-25", summary: "Same 502 errors on webhook deliveries since about 14:10 UTC; linked to NW-48211." },
        { ticket_no: "NW-48214", subject: "Query API latency spikes in eu-west", customer: "Copperleaf Retail", category: "Bug", priority: "High", status: "New", channel: "Email", assignee: "Unassigned", sla_due: "in 3h 50m", opened: "2026-09-25", summary: "p95 latency on the Query API jumped from 180 ms to 1.9 s since this morning in eu-west-1." },
        { ticket_no: "NW-48207", subject: "September invoice charged twice", customer: "Verdant Foods", category: "Billing", priority: "High", status: "Awaiting approval", channel: "Email", assignee: "S. Kaur", sla_due: "in 2h 10m", opened: "2026-09-25", summary: "Two identical charges of $1,188 on the same card on 1 September; customer wants one refunded." },
        { ticket_no: "NW-48203", subject: "How do I rotate API keys without downtime?", customer: "Kestrel Labs", category: "How-to", priority: "Normal", status: "Awaiting approval", channel: "Web form", assignee: "Unassigned", sla_due: "in 5h", opened: "2026-09-25", summary: "Wants to rotate production keys this week; draft uses 'Rotating API keys safely'." },
        { ticket_no: "NW-48199", subject: "SSO login loop for Okta users", customer: "Tidewater Health", category: "Account access", priority: "High", status: "Triaged", channel: "Email", assignee: "M. Brennan", sla_due: "in 1h 05m", opened: "2026-09-25", summary: "About 40 users stuck in a redirect loop after an Okta certificate renewal; admins can still sign in with passwords." },
        { ticket_no: "NW-48194", subject: "CSV export times out on large projects", customer: "Blue Fjord Media", category: "Bug", priority: "Normal", status: "Triaged", channel: "Web form", assignee: "M. Brennan", sla_due: "in 6h", opened: "2026-09-24", summary: "Exports over ~200k rows fail after 60 seconds; the async export API is a known workaround." },
        { ticket_no: "NW-48190", subject: "Request: dark mode for the dashboard", customer: "Sable & Co.", category: "Feature request", priority: "Low", status: "Replied", channel: "Web form", assignee: "Unassigned", sla_due: "Met", opened: "2026-09-24", summary: "Asked for a dark mode; reply thanked them and linked the public roadmap." },
        { ticket_no: "NW-48186", subject: "Can't add a new seat: 'plan limit reached'", customer: "Juniper Robotics", category: "Billing", priority: "Normal", status: "Solved", channel: "Chat", assignee: "S. Kaur", sla_due: "Met", opened: "2026-09-24", summary: "Growth plan capped at 25 seats; customer upgraded to 50 after the reply explained the options." },
      ],
    },
    {
      id: "customer",
      name: "Customer",
      plural: "Customers",
      plain: "A company that pays for Northwind Cloud.",
      fields: [
        { name: "name", label: "Company", type: "string" },
        { name: "plan", label: "Plan", type: "enum", options: ["Starter", "Growth", "Enterprise"] },
        { name: "arr", label: "Annual revenue", type: "money" },
        { name: "csm", label: "CSM", type: "string" },
        { name: "open_tickets", label: "Open tickets", type: "number" },
        { name: "csat", label: "CSAT %", type: "number" },
        { name: "health", label: "Health", type: "enum", options: ["Healthy", "Watch", "At risk"] },
        { name: "customer_since", label: "Customer since", type: "date" },
      ],
      sample: [
        { name: "Pinecrest Bank", plan: "Enterprise", arr: 186000, csm: "Rachel Moss", open_tickets: 3, csat: 91, health: "Watch", customer_since: "2021-04-12" },
        { name: "Orbital Freight", plan: "Enterprise", arr: 142000, csm: "Rachel Moss", open_tickets: 2, csat: 96, health: "Healthy", customer_since: "2022-01-20" },
        { name: "Tidewater Health", plan: "Enterprise", arr: 238000, csm: "Aiko Tanaka", open_tickets: 4, csat: 82, health: "At risk", customer_since: "2020-09-03" },
        { name: "Copperleaf Retail", plan: "Enterprise", arr: 96000, csm: "Aiko Tanaka", open_tickets: 1, csat: 89, health: "Watch", customer_since: "2023-06-15" },
        { name: "Verdant Foods", plan: "Growth", arr: 14256, csm: "Owen Price", open_tickets: 1, csat: 93, health: "Watch", customer_since: "2024-02-28" },
        { name: "Blue Fjord Media", plan: "Growth", arr: 21600, csm: "Owen Price", open_tickets: 2, csat: 95, health: "Healthy", customer_since: "2023-11-07" },
        { name: "Kestrel Labs", plan: "Growth", arr: 9600, csm: "Owen Price", open_tickets: 1, csat: 98, health: "Healthy", customer_since: "2025-03-19" },
        { name: "Juniper Robotics", plan: "Growth", arr: 18000, csm: "Aiko Tanaka", open_tickets: 0, csat: 97, health: "Healthy", customer_since: "2024-08-01" },
        { name: "Sable & Co.", plan: "Starter", arr: 1188, csm: "None", open_tickets: 0, csat: 100, health: "Healthy", customer_since: "2026-05-10" },
      ],
    },
    {
      id: "article",
      name: "Article",
      plural: "Articles",
      plain: "A page in Northwind's public help centre that replies can quote from.",
      fields: [
        { name: "title", label: "Title", type: "string" },
        { name: "section", label: "Section", type: "enum", options: ["Getting started", "Billing", "API & webhooks", "SSO & security", "Troubleshooting"] },
        { name: "status", label: "Status", type: "enum", options: ["Published", "Needs review", "Draft"] },
        { name: "updated", label: "Last updated", type: "date" },
        { name: "times_used", label: "Used in replies (30d)", type: "number" },
        { name: "url", label: "Link", type: "string" },
      ],
      sample: [
        { title: "Rotating API keys safely", section: "API & webhooks", status: "Published", updated: "2026-08-14", times_used: 142, url: "help.northwind.cloud/api/rotate-keys" },
        { title: "Troubleshooting webhook delivery failures", section: "API & webhooks", status: "Published", updated: "2026-07-30", times_used: 118, url: "help.northwind.cloud/api/webhook-failures" },
        { title: "Understanding your invoice", section: "Billing", status: "Published", updated: "2026-06-02", times_used: 97, url: "help.northwind.cloud/billing/invoices" },
        { title: "Setting up SSO with Okta", section: "SSO & security", status: "Published", updated: "2026-09-02", times_used: 88, url: "help.northwind.cloud/security/okta-sso" },
        { title: "Adding and removing seats", section: "Billing", status: "Published", updated: "2026-05-21", times_used: 73, url: "help.northwind.cloud/billing/seats" },
        { title: "Refunds and SLA credits", section: "Billing", status: "Needs review", updated: "2026-03-11", times_used: 64, url: "help.northwind.cloud/billing/sla-credits" },
        { title: "Getting started with Northwind Cloud", section: "Getting started", status: "Published", updated: "2026-09-10", times_used: 55, url: "help.northwind.cloud/start" },
        { title: "Exporting large projects", section: "Troubleshooting", status: "Needs review", updated: "2025-12-19", times_used: 41, url: "help.northwind.cloud/troubleshooting/large-exports" },
      ],
    },
    {
      id: "reply",
      name: "Reply",
      plural: "Replies",
      plain: "A reply Reply Drafter has written for a ticket, waiting for a person to approve it.",
      fields: [
        { name: "ticket_no", label: "Ticket #", type: "string" },
        { name: "customer", label: "Customer", type: "string" },
        { name: "subject", label: "Subject", type: "string" },
        { name: "draft", label: "Draft", type: "text" },
        { name: "sources", label: "Articles used", type: "string" },
        { name: "confidence", label: "Confidence", type: "number" },
        { name: "status", label: "Status", type: "enum", options: ["Awaiting approval", "Approved", "Sent", "Sent back"] },
        { name: "drafted", label: "Drafted", type: "date" },
      ],
      sample: [
        { ticket_no: "NW-48211", customer: "Pinecrest Bank", subject: "Webhooks returning 502 since 14:05 UTC", draft: "We know webhook deliveries are failing for some customers and our engineers are working on it now. Failed deliveries are queued and will retry automatically once this is resolved. Live updates: status.northwind.cloud.", sources: "Troubleshooting webhook delivery failures", confidence: 0.88, status: "Awaiting approval", drafted: "2026-09-25" },
        { ticket_no: "NW-48207", customer: "Verdant Foods", subject: "September invoice charged twice", draft: "I can see two identical charges of $1,188 on 1 September. I've passed this to our billing team to confirm, and they'll reply within one business day. 'Understanding your invoice' explains how each charge appears.", sources: "Understanding your invoice", confidence: 0.74, status: "Awaiting approval", drafted: "2026-09-25" },
        { ticket_no: "NW-48203", customer: "Kestrel Labs", subject: "How do I rotate API keys without downtime?", draft: "You can rotate keys with no downtime by running two keys side by side: 1. Create a new key in Settings → API keys. 2. Deploy it alongside the old one. 3. Revoke the old key once traffic has moved over.", sources: "Rotating API keys safely", confidence: 0.93, status: "Awaiting approval", drafted: "2026-09-25" },
        { ticket_no: "NW-48194", customer: "Blue Fjord Media", subject: "CSV export times out on large projects", draft: "Exports above about 200,000 rows can time out in the browser. The async export API handles large projects and emails you a link when the file is ready.", sources: "Exporting large projects", confidence: 0.61, status: "Sent back", drafted: "2026-09-24" },
        { ticket_no: "NW-48190", customer: "Sable & Co.", subject: "Request: dark mode for the dashboard", draft: "Thank you for the suggestion. We've added your vote to dark mode on our public roadmap, where you can follow its progress.", sources: "Public roadmap", confidence: 0.9, status: "Sent", drafted: "2026-09-24" },
        { ticket_no: "NW-48186", customer: "Juniper Robotics", subject: "Can't add a new seat: 'plan limit reached'", draft: "The Growth plan includes up to 25 seats. To add more, an admin can move to the 50-seat tier in Settings → Billing; the change is pro-rated from today.", sources: "Adding and removing seats", confidence: 0.91, status: "Sent", drafted: "2026-09-24" },
      ],
    },
  ],
  connections: [
    { id: "zendesk", name: "Zendesk", kind: "http", auth: "api_key", status: "configured", plain: "Where tickets arrive. Agents read tickets and set their priority and tags here." },
    { id: "help-centre", name: "Help centre", kind: "docs", auth: "none", status: "configured", plain: "Northwind's public help centre at help.northwind.cloud. Replies may only quote from here." },
    { id: "gmail", name: "Gmail", kind: "email", auth: "oauth", status: "configured", plain: "Sends approved replies from support@northwind.cloud." },
    { id: "slack", name: "Slack", kind: "slack", auth: "oauth", status: "configured", plain: "Posts incident summaries in #support-incidents." },
    { id: "pagerduty", name: "PagerDuty", kind: "http", auth: "api_key", status: "missing", plain: "Pages the on-call engineer when many customers report the same problem." },
  ],
  estimate: { minutes: 0, credits: 0, files: 0, agentsTouched: 0, confidence: "high", breakdown: [] },
};
