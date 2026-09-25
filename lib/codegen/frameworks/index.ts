import type { Framework } from "@/lib/blueprint/schema";
import type { FrameworkModule } from "../types";
import { crewai } from "./crewai";
import { googleAdk } from "./googleAdk";
import { langgraph } from "./langgraph";
import { lyzr } from "./lyzr";
import { mastra } from "./mastra";
import { openaiAgents } from "./openaiAgents";

export const FRAMEWORKS: Record<Framework, FrameworkModule> = {
  lyzr,
  langgraph,
  crewai,
  openai_agents: openaiAgents,
  google_adk: googleAdk,
  mastra,
};

export function frameworkFor(id: Framework): FrameworkModule {
  return FRAMEWORKS[id] ?? FRAMEWORKS.lyzr;
}
