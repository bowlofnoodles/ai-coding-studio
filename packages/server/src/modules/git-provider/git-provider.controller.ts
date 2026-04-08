import {
  Controller,
  Get,
  Query,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GitProviderFactory } from './git-provider.factory';
import { AuthService } from '../auth';

@Controller('repos')
export class GitProviderController {
  constructor(
    private readonly gitProviderFactory: GitProviderFactory,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listRepos(@Query('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const user = await this.authService.findById(Number(userId));
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.gitToken) {
      throw new BadRequestException('Git token not configured');
    }

    const provider = this.gitProviderFactory.create(
      user.gitPlatform,
      user.gitToken,
    );
    return provider.listRepos();
  }

  @Get('branches')
  async listBranches(
    @Query('repo') repoFullName: string,
    @Query('userId') userId: string,
  ) {
    if (!userId || !repoFullName) {
      throw new BadRequestException('userId and repo are required');
    }

    const user = await this.authService.findById(Number(userId));
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const provider = this.gitProviderFactory.create(
      user.gitPlatform,
      user.gitToken,
    );
    return provider.listBranches(repoFullName);
  }
}
