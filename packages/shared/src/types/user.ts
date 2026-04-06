export type GitPlatform = 'gitlab' | 'github';

export interface User {
  id: number;
  username: string;
  gitPlatform: GitPlatform;
  aiEnginePreference: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  username: string;
  gitPlatform: GitPlatform;
  gitToken: string;
  aiEnginePreference?: string;
}

export interface UpdateUserDto {
  gitPlatform?: GitPlatform;
  gitToken?: string;
  aiEnginePreference?: string;
}
