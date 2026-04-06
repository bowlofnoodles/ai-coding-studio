export type CodingEvent =
  | { type: 'session_init'; sessionId: string; model: string }
  | { type: 'thinking'; content: string }
  | { type: 'text'; content: string }
  | { type: 'tool_use'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; output: string }
  | { type: 'complete'; result: string; durationMs: number; costUsd: number }
  | { type: 'error'; message: string; code?: string };
