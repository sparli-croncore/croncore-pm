import type { TaskProvider } from "./types";
import { clickupProvider } from "./clickup";

/**
 * Registry of task-management providers. Add Slack/Trello/Linear here later:
 *   slack: slackProvider, trello: trelloProvider, ...
 */
const REGISTRY: Record<string, TaskProvider> = {
  clickup: clickupProvider,
};

export function getTaskProvider(name = "clickup"): TaskProvider {
  const provider = REGISTRY[name];
  if (!provider) throw new Error(`Unknown task provider: ${name}`);
  return provider;
}

export function availableTaskProviders(): string[] {
  return Object.keys(REGISTRY);
}

export type { TaskProvider };
