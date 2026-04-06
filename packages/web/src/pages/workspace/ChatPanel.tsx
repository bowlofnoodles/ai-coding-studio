import { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspace';
import { EventBlock } from './EventBlock';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export function ChatPanel({ messages }: { messages: Message[] }) {
  const events = useWorkspaceStore((s) => s.events);
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);
  const taskStatus = useWorkspaceStore((s) => s.taskStatus);
  const error = useWorkspaceStore((s) => s.error);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 mb-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${
                msg.role === 'user' ? 'bg-purple-500' : 'bg-amber-500'
              }`}
            >
              {msg.role === 'user' ? 'U' : 'AI'}
            </div>
            <span className="text-xs text-gray-500">
              {msg.role === 'user' ? '你' : 'AI'}
            </span>
          </div>
          <div className="ml-8 bg-gray-800/50 rounded-lg p-3 text-sm text-gray-200">
            {msg.content}
          </div>
        </div>
      ))}

      {/* AI execution events */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs text-white">
              AI
            </div>
            <span className="text-xs text-gray-500">Claude Code</span>
            {isExecuting && (
              <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">
                执行中
              </span>
            )}
          </div>
          <div className="ml-8">
            {events.map((event, i) => (
              <EventBlock key={i} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="ml-8 bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Status display */}
      {taskStatus && !isExecuting && !error && (
        <div className="ml-8 text-xs text-gray-500">
          状态: {taskStatus}
        </div>
      )}
    </div>
  );
}
