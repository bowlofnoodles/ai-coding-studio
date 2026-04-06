import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { CodingEvent } from '@ai-coding-studio/shared';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class StreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(StreamGateway.name);
  private clientTaskMap = new Map<string, string>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    client.on('subscribe', (taskId: string) => {
      client.join(`task:${taskId}`);
      this.clientTaskMap.set(client.id, taskId);
      this.logger.log(`Client ${client.id} subscribed to task ${taskId}`);
    });

    client.on('unsubscribe', (taskId: string) => {
      client.leave(`task:${taskId}`);
      this.clientTaskMap.delete(client.id);
    });
  }

  handleDisconnect(client: Socket) {
    this.clientTaskMap.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitTaskEvent(taskId: number, event: CodingEvent) {
    this.server.to(`task:${taskId}`).emit('task:event', {
      taskId,
      event,
      timestamp: Date.now(),
    });
  }

  emitTaskBranchName(taskId: number, branchName: string) {
    this.server.to(`task:${taskId}`).emit('task:branch', {
      taskId,
      branchName,
      timestamp: Date.now(),
    });
  }

  emitTaskSummary(
    taskId: number,
    summary: {
      branch: string;
      baseBranch: string;
      diffUrl: string;
      changedFiles: string;
      repoFullName: string;
    },
  ) {
    this.server.to(`task:${taskId}`).emit('task:summary', {
      taskId,
      summary,
      timestamp: Date.now(),
    });
  }

  emitTaskStatus(taskId: number, status: string, previewUrl?: string) {
    this.server.to(`task:${taskId}`).emit('task:status', {
      taskId,
      status,
      previewUrl,
      timestamp: Date.now(),
    });
  }

  emitTaskError(taskId: number, message: string) {
    this.server.to(`task:${taskId}`).emit('task:error', {
      taskId,
      message,
      timestamp: Date.now(),
    });
  }
}
