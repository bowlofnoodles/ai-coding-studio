import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { TaskMessageEntity } from './task-message.entity';

@Entity('tasks')
export class TaskEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'repo_url', length: 500 })
  repoUrl: string;

  @Column({ name: 'branch_name', length: 200 })
  branchName: string;

  @Column({ name: 'base_branch', length: 200, default: 'main' })
  baseBranch: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ length: 30, default: 'pending' })
  status: string;

  @Column({ name: 'preview_url', length: 500, nullable: true })
  previewUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.tasks)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @OneToMany(() => TaskMessageEntity, (message) => message.task)
  messages: TaskMessageEntity[];
}
