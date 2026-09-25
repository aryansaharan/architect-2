import { z } from "zod";

/**
 * What the model is asked to produce: the *decisions* (what data, which agents,
 * which tools and how risky they are, which screens). Layout, ids, sample-data
 * typing and estimates are filled in deterministically by expand.ts.
 * Kept free of min/max/records so it maps cleanly onto strict structured outputs.
 */
export const DraftSchema = z.object({
  name: z.string().describe("Short product name, 2–4 words, Title Case, no company name"),
  tagline: z.string().describe("One sentence, under 12 words, outcome-focused"),
  summary: z.string().describe("2–3 plain-English sentences a non-technical manager would understand"),
  vertical: z.enum(["claims", "support", "sales", "hr", "custom"]),
  company: z.string().describe("A fictional company name that fits the brief, or the one named in the brief"),
  entities: z
    .array(
      z.object({
        name: z.string().describe("Singular, Title Case, e.g. 'Ticket'"),
        plural: z.string(),
        description: z.string().describe("One plain sentence"),
        fields: z
          .array(
            z.object({
              name: z.string().describe("snake_case"),
              label: z.string(),
              type: z.enum(["string", "number", "boolean", "date", "enum", "money", "text"]),
              options: z.array(z.string()).describe("Only for enum fields (3–6 options); otherwise an empty array"),
            }),
          )
          .describe("4–8 fields; the first field is the human-readable identifier"),
        sampleRows: z
          .array(z.array(z.string()))
          .describe("5 realistic rows; each row lists one value per field, in the same order as fields. Dates as YYYY-MM-DD. Money and numbers as plain numbers. Fictional people only."),
      }),
    )
    .describe("2–4 kinds of data the app stores"),
  connections: z
    .array(
      z.object({
        name: z.string().describe("Product name, e.g. 'Gmail', 'Salesforce', 'Stripe'"),
        kind: z.enum(["database", "crm", "email", "http", "mcp", "slack", "calendar", "payments", "storage", "docs"]),
        auth: z.enum(["oauth", "api_key", "none"]),
        description: z.string().describe("One plain sentence about what it's used for"),
      }),
    )
    .describe("3–5 outside systems, including one 'database' connection for the app's own data"),
  agents: z
    .array(
      z.object({
        name: z.string().describe("Two words max, a job title, e.g. 'Reply Drafter'"),
        role: z.string().describe("Under 6 words"),
        description: z.string().describe("2 plain sentences: what it does and what it never does"),
        jobDescription: z.string().describe("The agent's system prompt, 3–5 sentences, second person"),
        rules: z.array(z.string()).describe("2–4 short guardrails, each under 12 words"),
        supervision: z.enum(["autonomous", "spot_check", "approve_all"]),
        memory: z.enum(["none", "session", "project", "org"]),
        tools: z
          .array(
            z.object({
              name: z.string().describe("Verb phrase, e.g. 'Send reply'"),
              description: z.string(),
              connection: z.string().describe("Exactly one of the connection names above"),
              access: z
                .enum(["read", "write", "irreversible"])
                .describe("read = looks things up; write = changes records inside the app (can be undone); irreversible = sends messages, moves money, creates or deletes outside accounts"),
            }),
          )
          .describe("2–4 tools; at least one agent in the project should have an irreversible tool"),
        rehearsals: z
          .array(z.object({ name: z.string(), input: z.string(), expect: z.string() }))
          .describe("2 test conversations: one typical case, one tricky edge case"),
      }),
    )
    .describe("2–3 agents with clearly separated jobs"),
  screens: z
    .array(
      z.object({
        title: z.string().describe("2–3 words"),
        purpose: z.string().describe("One sentence"),
        description: z.string().describe("2 plain sentences for a non-technical reader"),
        kind: z.enum(["queue", "dashboard", "detail", "form", "assistant", "report"]),
        entity: z.string().describe("Name of the main data type shown (one of the entity names), or empty"),
        agent: z.string().describe("Name of the agent available on this screen, or empty"),
        audience: z.enum(["team", "customer", "admin"]),
        metrics: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .describe("2–4 headline numbers for queue/dashboard/report screens; otherwise empty"),
      }),
    )
    .describe("3–5 screens; start with the screen people open first; include one 'detail' screen"),
});
export type Draft = z.infer<typeof DraftSchema>;

export const PLANNER_INSTRUCTIONS = `You are the planner inside Architect 2.0, a platform where people describe an agentic business app and it gets built for them.
Turn the user's brief into a concrete plan: the data the app stores, the outside systems it connects to, the AI agents that do the work (with the tools they may use and how risky each tool is), and the screens people use.

Principles:
- Serve two readers at once: every "description" is plain English for a non-technical manager; every "jobDescription" is a precise system prompt an engineer would respect.
- Be honest about risk. Mark any tool that sends a message, moves money, creates or deletes an outside account, or publishes anything as "irreversible". Changing a record inside the app is "write". Looking something up is "read".
- Prefer fewer, sharper agents with separated jobs over many overlapping ones.
- Sample data must be realistic and specific to the brief, with fictional names.
- Keep it buildable: 3–5 screens, 2–3 agents, 2–4 data types, 3–5 connections.`;
