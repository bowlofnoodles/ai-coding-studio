import { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspace';
import { EventBlock } from './EventBlock';
import type { CodingEvent } from '@ai-coding-studio/shared';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

function EventGroup({ events, isLive }: { events: CodingEvent[]; isLive: boolean }) {
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs text-white">
          AI
        </div>
        <span className="text-xs text-gray-500">Claude Code</span>
        {isLive && isExecuting && (
          <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">
            执行中
          </span>
        )}
        {!isLive && (
          <span className="text-xs text-gray-600">已完成</span>
        )}
      </div>
      <div className="ml-8">
        {events.map((event, i) => (
          <EventBlock key={i} event={event} />
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({ messages }: { messages: Message[] }) {
  const events = useWorkspaceStore((s) => s.events);
  const pastEventGroups = useWorkspaceStore((s) => s.pastEventGroups);
  const error = useWorkspaceStore((s) => s.error);
  const taskStatus = useWorkspaceStore((s) => s.taskStatus);
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, messages, pastEventGroups]);

  // Interleave messages and past event groups by index
  // messages[0] (user) → pastEventGroups[0] (ai response) → messages[1] (user) → ...
  const renderItems: JSX.Element[] = [];
  const maxLen = Math.max(messages.length, pastEventGroups.length + (events.length > 0 ? 1 : 0));

  for (let i = 0; i < maxLen; i++) {
    // User message
    if (i < messages.length) {
      const msg = messages[i];
      renderItems.push(
        <div key={`msg-${i}`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-xs text-white">
              U
            </div>
            <span className="text-xs text-gray-500">你</span>
          </div>
          <div className="ml-8 bg-gray-800/50 rounded-lg p-3 text-sm text-gray-200">
            {msg.content}
          </div>
        </div>,
      );
    }

    // Past event group (completed task)
    if (i < pastEventGroups.length) {
      renderItems.push(
        <EventGroup key={`past-${i}`} events={pastEventGroups[i]} isLive={false} />,
      );
    }
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {renderItems}

      {/* Current live events */}
      {events.length > 0 && (
        <EventGroup events={events} isLive={true} />
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
