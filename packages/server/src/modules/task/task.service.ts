import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskEntity, TaskMessageEntity } from '../../entities';
import { TaskStatus } from '@ai-coding-studio/shared';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,
    @InjectRepository(TaskMessageEntity)
    private readonly messageRepo: Repository<TaskMessageEntity>,
  ) {}

  async create(data: {
    userId: number;
    repoUrl: string;
    branchName: string;
    baseBranch: string;
    prompt: string;
  }): Promise<TaskEntity> {
    const task = this.taskRepo.create({
      ...data,
      status: TaskStatus.PENDING,
    });
    return this.taskRepo.save(task);
  }

  async findById(id: number): Promise<TaskEntity | null> {
    return this.taskRepo.findOne({
      where: { id },
      relations: ['messages'],
    });
  }

  async findByUserId(userId: number): Promise<TaskEntity[]> {
    return this.taskRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByBranch(userId: number, branchName: string): Promise<TaskEntity[]> {
    return this.taskRepo.find({
      where: { userId, branchName },
      relations: ['messages'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateBranchName(id: number, branchName: string): Promise<void> {
    await this.taskRepo.update(id, { branchName });
  }

  async updateStatus(
    id: number,
    status: string,
    previewUrl?: string,
  ): Promise<void> {
    const update: Partial<TaskEntity> = { status };
    if (previewUrl !== undefined) {
      update.previewUrl = previewUrl;
    }
    await this.taskRepo.update(id, update);
  }

  async addMessage(data: {
    taskId: number;
    role: string;
    content: string;
    eventsJson?: string;
  }): Promise<TaskMessageEntity> {
    const message = this.messageRepo.create(data);
    return this.messageRepo.save(message);
  }
}
