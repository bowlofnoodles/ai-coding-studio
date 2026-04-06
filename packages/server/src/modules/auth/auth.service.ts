import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async findById(id: number): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async createUser(data: {
    username: string;
    gitPlatform: string;
    gitToken: string;
    aiEnginePreference?: string;
  }): Promise<UserEntity> {
    const user = this.userRepo.create({
      username: data.username,
      gitPlatform: data.gitPlatform,
      gitToken: data.gitToken,
      aiEnginePreference: data.aiEnginePreference ?? 'claude-code',
    });
    return this.userRepo.save(user);
  }

  async updateUser(
    id: number,
    data: Partial<{
      gitPlatform: string;
      gitToken: string;
      aiEnginePreference: string;
    }>,
  ): Promise<UserEntity | null> {
    await this.userRepo.update(id, data);
    return this.findById(id);
  }
}
