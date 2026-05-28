import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export interface Config {
  workspace: {
    root: string;
    dailyDir: string;
    knowledgeDir: string;
    indexDir: string;
    worklogDir: string;
  };
  ollama: {
    url: string;
    embeddingModel: string;
  };
  search: {
    vectorWeight: number;
    textWeight: number;
    defaultMaxResults: number;
    temporalDecayHalfLifeDays: number;
  };
  promote: {
    recallThreshold: number;     // distinct sessions before auto-promote
    lookbackDays: number;
  };
}

function loadUserConfig(root: string): Partial<Config> {
  const cfgPath = path.join(root, 'config.json');
  if (!fs.existsSync(cfgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

function buildConfig(): Config {
  const root = process.env.MEMORY_WORKSPACE
    ? path.resolve(process.env.MEMORY_WORKSPACE)
    : path.join(os.homedir(), '.memory');

  const user = loadUserConfig(root);

  return {
    workspace: {
      root,
      dailyDir:    path.join(root, 'daily'),
      knowledgeDir: path.join(root, 'knowledge'),
      indexDir:    path.join(root, 'index'),
      worklogDir:  path.join(root, 'worklog'),
    },
    ollama: {
      url:            process.env.OLLAMA_URL ?? (user as any)?.ollama?.url ?? 'http://localhost:11434',
      embeddingModel: process.env.EMBEDDING_MODEL ?? (user as any)?.ollama?.embeddingModel ?? 'granite-embedding',
    },
    search: {
      vectorWeight:              0.7,
      textWeight:                0.3,
      defaultMaxResults:         10,
      temporalDecayHalfLifeDays: 30,
      ...(user as any)?.search,
    },
    promote: {
      recallThreshold: 3,
      lookbackDays:    7,
      ...(user as any)?.promote,
    },
  };
}

export const config = buildConfig();

export function ensureWorkspaceDirs(): void {
  for (const dir of [
    config.workspace.root,
    config.workspace.dailyDir,
    config.workspace.knowledgeDir,
    config.workspace.indexDir,
    config.workspace.worklogDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
