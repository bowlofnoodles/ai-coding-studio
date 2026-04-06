import {
  Controller,
  Get,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GitHubAdapter } from './github.adapter';
import { AuthService } from '../auth';

@Controller('repos')
export class GitProviderController {
  constructor(
    private readonly gitHubAdapter: GitHubAdapter,
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

    this.gitHubAdapter.configure(user.gitToken);
    return this.gitHubAdapter.listRepos();
  }
}
