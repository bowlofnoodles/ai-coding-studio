import type { CodingEvent } from '@ai-coding-studio/shared';

const EVENT_STYLES: Record<string, { border: string; icon: string; label: string }> = {
  thinking: { border: 'border-purple-500', icon: '💭', label: '思考' },
  text: { border: 'border-blue-500', icon: '💬', label: '回复' },
  tool_use: { border: 'border-amber-500', icon: '🔧', label: '工具调用' },
  tool_result: { border: 'border-green-500', icon: '📄', label: '执行结果' },
  complete: { border: 'border-green-500', icon: '✅', label: '完成' },
  error: { border: 'border-red-500', icon: '❌', label: '错误' },
  session_init: { border: 'border-gray-500', icon: '🚀', label: '会话启动' },
};

export function EventBlock({ event }: { event: CodingEvent }) {
  const style = EVENT_STYLES[event.type] ?? EVENT_STYLES.text;

  return (
    <div
      className={`bg-gray-900/50 border-l-2 ${style.border} rounded-r px-3 py-2 mb-2`}
    >
      <div className="text-xs text-gray-500 mb-1">
        {style.icon} {style.label}
      </div>
      <div className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-all">
        {renderContent(event)}
      </div>
    </div>
  );
}

function renderContent(event: CodingEvent): string {
  switch (event.type) {
    case 'thinking':
      return event.content;
    case 'text':
      return event.content;
    case 'tool_use':
      return `${event.toolName}\n${JSON.stringify(event.input, null, 2)}`;
    case 'tool_result':
      return `${event.toolName}: ${event.output}`;
    case 'complete':
      return `${event.result}\n耗时: ${(event.durationMs / 1000).toFixed(1)}s | 费用: $${event.costUsd.toFixed(4)}`;
    case 'error':
      return event.message;
    case 'session_init':
      return `模型: ${event.model} | 会话: ${event.sessionId}`;
    default:
      return JSON.stringify(event);
  }
}
