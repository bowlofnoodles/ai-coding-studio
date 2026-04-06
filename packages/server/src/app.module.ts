import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth';
import { GitProviderModule } from './modules/git-provider';
import { SandboxModule } from './modules/sandbox';
import { EngineModule } from './modules/engine';
import { DeployModule } from './modules/deploy';
import { TaskModule } from './modules/task';
import { StreamModule } from './modules/stream';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD', 'root'),
        database: configService.get<string>('DB_DATABASE', 'ai_coding_studio'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
    }),
    StreamModule,
    AuthModule,
    GitProviderModule,
    SandboxModule,
    EngineModule,
    DeployModule,
    TaskModule,
  ],
})
export class AppModule {}
