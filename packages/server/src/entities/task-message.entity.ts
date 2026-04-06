import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TaskEntity } from './task.entity';

@Entity('task_messages')
export class TaskMessageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  taskId: number;

  @Column({ length: 10 })
  role: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'events_json', type: 'longtext', nullable: true })
  eventsJson: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => TaskEntity, (task) => task.messages)
  @JoinColumn({ name: 'task_id' })
  task: TaskEntity;
}
