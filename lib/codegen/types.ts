import type { Agent, Blueprint, Framework, ObjectRef } from "@/lib/blueprint/schema";

export type GeneratedFile = {
  path: string;
  lang: "ts" | "tsx" | "py" | "yaml" | "md" | "json" | "sql" | "sh" | "env" | "txt" | "toml";
  content: string;
  objectRef?: ObjectRef;
};

/**
 * One module per agent framework. `render` must be a pure function that returns
 * idiomatic, runnable-looking source for the given agent. `notes` is the honest
 * "what doesn't translate" list shown next to the code.
 */
export type FrameworkModule = {
  id: Framework;
  label: string;
  language: "python" | "typescript";
  fileName: (agent: Agent) => string; // e.g. "agent.py", relative to agents/<agent.id>/
  install: string; // e.g. "pip install lyzr-adk"
  render: (agent: Agent, bp: Blueprint) => string;
  notes: (agent: Agent, bp: Blueprint) => string[];
};
