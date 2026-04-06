import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { TaskService } from './task.service';

@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  async listTasks(@Query('userId') userId: string) {
    return this.taskService.findByUserId(Number(userId));
  }

  @Get(':id')
  async getTask(@Param('id') id: string) {
    const task = await this.taskService.findById(Number(id));
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  @Get('branch/:branchName')
  async getTasksByBranch(
    @Param('branchName') branchName: string,
    @Query('userId') userId: string,
  ) {
    return this.taskService.findByBranch(Number(userId), branchName);
  }
}
