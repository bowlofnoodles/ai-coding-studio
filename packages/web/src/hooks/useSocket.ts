import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { CodingEvent } from '@ai-coding-studio/shared';

interface TaskEvent {
  taskId: number;
  event: CodingEvent;
  timestamp: number;
}

interface TaskStatus {
  taskId: number;
  status: string;
  previewUrl?: string;
  timestamp: number;
}

interface TaskError {
  taskId: number;
  message: string;
  timestamp: number;
}

interface TaskBranch {
  taskId: number;
  branchName: string;
  timestamp: number;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket'],
    });
    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const subscribe = useCallback((taskId: number) => {
    socketRef.current?.emit('subscribe', String(taskId));
  }, []);

  const unsubscribe = useCallback((taskId: number) => {
    socketRef.current?.emit('unsubscribe', String(taskId));
  }, []);

  const onTaskEvent = useCallback(
    (callback: (data: TaskEvent) => void) => {
      socketRef.current?.on('task:event', callback);
      return () => {
        socketRef.current?.off('task:event', callback);
      };
    },
    [],
  );

  const onTaskStatus = useCallback(
    (callback: (data: TaskStatus) => void) => {
      socketRef.current?.on('task:status', callback);
      return () => {
        socketRef.current?.off('task:status', callback);
      };
    },
    [],
  );

  const onTaskError = useCallback(
    (callback: (data: TaskError) => void) => {
      socketRef.current?.on('task:error', callback);
      return () => {
        socketRef.current?.off('task:error', callback);
      };
    },
    [],
  );

  const onTaskBranch = useCallback(
    (callback: (data: TaskBranch) => void) => {
      socketRef.current?.on('task:branch', callback);
      return () => {
        socketRef.current?.off('task:branch', callback);
      };
    },
    [],
  );

  return { subscribe, unsubscribe, onTaskEvent, onTaskStatus, onTaskError, onTaskBranch };
}
