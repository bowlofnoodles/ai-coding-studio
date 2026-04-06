import { Controller, Get, Post, Put, Body, Param, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body()
    body: {
      username: string;
      gitPlatform: string;
      gitToken: string;
      aiEnginePreference?: string;
    },
  ) {
    return this.authService.createUser(body);
  }

  @Post('login')
  async login(@Body() body: { username: string }) {
    const user = await this.authService.findByUsername(body.username);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { id: user.id, username: user.username };
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    const user = await this.authService.findById(Number(id));
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { gitToken, ...rest } = user;
    return rest;
  }

  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      gitPlatform: string;
      gitToken: string;
      aiEnginePreference: string;
    }>,
  ) {
    const user = await this.authService.updateUser(Number(id), body);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { gitToken, ...rest } = user;
    return rest;
  }
}
