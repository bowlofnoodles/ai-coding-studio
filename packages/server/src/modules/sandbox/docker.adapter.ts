import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { SandboxProvider, Sandbox, ExecResult } from './sandbox.interface';

const DEFAULT_IMAGE = 'ai-coding-studio-sandbox:latest';
const DEFAULT_TIMEOUT = 600_000; // 10 minutes

@Injectable()
export class DockerAdapter implements SandboxProvider {
  private readonly logger = new Logger(DockerAdapter.name);
  private docker: Docker;
  private readonly defaultImage: string;

  constructor(private readonly configService: ConfigService) {
    const socketPath = this.configService.get<string>('DOCKER_SOCKET', '');
    this.docker = socketPath ? new Docker({ socketPath }) : new Docker();
    this.defaultImage = this.configService.get<string>('SANDBOX_IMAGE', DEFAULT_IMAGE);
  }

  async create(config: {
    image?: string;
    timeout?: number;
  }): Promise<Sandbox> {
    const image = config.image ?? this.defaultImage;
    const workDir = '/workspace';

    // Check if image exists locally
    try {
      await this.docker.getImage(image).inspect();
    } catch {
      throw new Error(
        `Sandbox image "${image}" not found locally. ` +
        `Please build it first: docker build -f docker/sandbox.Dockerfile -t ${image} .`,
      );
    }

    const container = await this.docker.createContainer({
      Image: image,
      Cmd: ['sleep', String((config.timeout ?? DEFAULT_TIMEOUT) / 1000)],
      WorkingDir: workDir,
      HostConfig: {
        Memory: 2 * 1024 * 1024 * 1024, // 2GB
        CpuPeriod: 100_000,
        CpuQuota: 200_000, // 2 CPU cores
        NetworkMode: 'bridge',
      },
    });

    await container.start();
    this.logger.log(`Sandbox created: ${container.id.substring(0, 12)}`);

    return {
      id: container.id,
      workDir,
    };
  }

  async exec(sandbox: Sandbox, command: string): Promise<ExecResult> {
    const container = this.docker.getContainer(sandbox.id);

    const exec = await container.exec({
      Cmd: ['sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: sandbox.workDir,
    });

    const stream = await exec.start({ Detach: false, Tty: false });
    const output = await this.collectOutput(stream);

    const inspect = await exec.inspect();

    return {
      exitCode: inspect.ExitCode ?? 1,
      stdout: output.stdout,
      stderr: output.stderr,
    };
  }

  async copyTo(
    sandbox: Sandbox,
    localPath: string,
    containerPath: string,
  ): Promise<void> {
    await this.exec(sandbox, `mkdir -p ${containerPath}`);

    const { execSync } = await import('child_process');
    execSync(
      `docker cp ${localPath}/. ${sandbox.id}:${containerPath}`,
      { stdio: 'pipe' },
    );
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    const container = this.docker.getContainer(sandbox.id);
    try {
      await container.stop({ t: 5 });
    } catch {
      // container might already be stopped
    }
    await container.remove({ force: true });
    this.logger.log(`Sandbox destroyed: ${sandbox.id.substring(0, 12)}`);
  }

  private collectOutput(
    stream: NodeJS.ReadableStream,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let stdout = '';
        let stderr = '';
        let offset = 0;

        while (offset < buffer.length) {
          if (offset + 8 > buffer.length) break;
          const streamType = buffer[offset];
          const length = buffer.readUInt32BE(offset + 4);
          offset += 8;

          if (offset + length > buffer.length) break;
          const payload = buffer.subarray(offset, offset + length).toString();
          if (streamType === 1) stdout += payload;
          else if (streamType === 2) stderr += payload;
          offset += length;
        }

        resolve({ stdout, stderr });
      });
      stream.on('error', reject);
    });
  }
}
