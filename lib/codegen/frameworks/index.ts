import { knownFramework, type Framework } from "@/lib/blueprint/schema";
import type { FrameworkModule } from "../types";
import { crewai } from "./crewai";
import { googleAdk } from "./googleAdk";
import { langgraph } from "./langgraph";
import { mastra } from "./mastra";
import { openaiAgents } from "./openaiAgents";

export const FRAMEWORKS: Record<Framework, FrameworkModule> = {
  langgraph,
  crewai,
  openai_agents: openaiAgents,
  google_adk: googleAdk,
  mastra,
};

/** The template for a framework id, falling back to the default for an id from an older plan. */
export function frameworkFor(id: string): FrameworkModule {
  return FRAMEWORKS[knownFramework(id)];
}
