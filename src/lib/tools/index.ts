import type { ToolSpec } from "./types";
import { clickupTools } from "./clickup";
import { githubTools } from "./github";
import { gmailTools } from "./gmail";
import { reportingTools } from "./reporting";
import { knowledgeTools } from "./knowledge";

/** The full project-manager toolset, defined once, used by either provider. */
export const allTools: ToolSpec[] = [
  ...clickupTools,
  ...githubTools,
  ...gmailTools,
  ...reportingTools,
  ...knowledgeTools,
];

export * from "./types";
