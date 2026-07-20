import { z } from "zod";
import { defineTool } from "./types";
import { knowledgeSources } from "@/lib/db/schema";

const saveKnowledge = defineTool({
  name: "save_knowledge",
  description:
    "Save an entry to this project's knowledge base (architecture summary from a repo, conventions, domain facts). Use kind='repo' for repo summaries. The knowledge base is loaded into your context on every future run.",
  schema: z.object({
    kind: z.enum(["repo", "file", "text", "markdown"]).default("text"),
    title: z.string(),
    content: z.string().describe("The knowledge content (markdown ok)"),
    sourceRef: z.string().optional().describe("e.g. 'owner/repo' or a filename"),
  }),
  run: async ({ kind, title, content, sourceRef }, ctx) => {
    await ctx.db.insert(knowledgeSources).values({
      projectId: ctx.projectId,
      kind,
      title,
      content,
      sourceRef,
    });
    return `Saved knowledge: "${title}" (${kind}).`;
  },
});

export const knowledgeTools = [saveKnowledge];
