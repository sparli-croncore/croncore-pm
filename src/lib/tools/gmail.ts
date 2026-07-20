import { z } from "zod";
import { google } from "googleapis";
import { defineTool, type ToolContext } from "./types";
import { pendingActions } from "@/lib/db/schema";

function gmailClient(ctx: ToolContext) {
  const { gmailClientId, gmailClientSecret, gmailRefreshToken } = ctx.credentials;
  if (!gmailClientId || !gmailClientSecret || !gmailRefreshToken) {
    throw new Error("Gmail not configured — add Gmail keys in the dashboard (Keys).");
  }
  const oauth2 = new google.auth.OAuth2(gmailClientId, gmailClientSecret);
  oauth2.setCredentials({ refresh_token: gmailRefreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

/** Build a base64url-encoded RFC 822 message. */
function rawMessage(ctx: ToolContext, to: string, subject: string, body: string): string {
  const from = ctx.credentials.gmailSender ?? "me";
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// gmail_create_draft creates a real Gmail draft (non-destructive — nothing is sent,
// you can review/edit it in Gmail). This is the default for client emails.
const createDraft = defineTool({
  name: "gmail_create_draft",
  description:
    "Create a Gmail DRAFT of a client email (nothing is sent — it appears in Gmail drafts for the user to review/edit). Use this by default for client-related emails.",
  schema: z.object({
    to: z.string().describe("Client email address"),
    subject: z.string(),
    body: z.string(),
  }),
  run: async ({ to, subject, body }, ctx) => {
    const gmail = gmailClient(ctx);
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: rawMessage(ctx, to, subject, body) } },
    });
    return `Created Gmail draft ${res.data.id} to ${to} ("${subject}"). Review it in Gmail.`;
  },
});

// gmail_send_email is gated: it queues a pending action that actually sends only
// after the user approves (matches the "send on command" requirement).
const sendEmail = defineTool({
  name: "gmail_send_email",
  description:
    "Queue a client email to be SENT (not just drafted). This requires the user's explicit approval before it goes out. Only use when the user has clearly asked to send a specific email.",
  schema: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  run: async ({ to, subject, body }, ctx) => {
    await ctx.db.insert(pendingActions).values({
      projectId: ctx.projectId,
      type: "email_send",
      summary: `Send email to ${to}: "${subject}"`,
      payload: { to, subject, body },
    });
    return `Queued an email to ${to} ("${subject}") for your approval before sending.`;
  },
});

export const gmailTools = [createDraft, sendEmail];

// ── Executor (called by the approval route once you approve a send) ────────────
export async function execEmailSend(ctx: ToolContext, payload: EmailSendPayload) {
  const gmail = gmailClient(ctx);
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: rawMessage(ctx, payload.to, payload.subject, payload.body) },
  });
  return { id: res.data.id, to: payload.to };
}

export interface EmailSendPayload {
  to: string;
  subject: string;
  body: string;
}
