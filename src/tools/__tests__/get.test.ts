import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { getMemoryFile } from '../get.js';
import { config } from '../../config.js';

vi.mock('../../config.js', () => ({
  config: {
    workspace: {
      root: '/mock/workspace/root',
    },
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
  };
});

describe('getMemoryFile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should prevent path traversal outside workspace', () => {
    const maliciousPaths = [
      '../etc/passwd',
      '../../etc/passwd',
      '/etc/passwd',
      '../../../something/else',
    ];

    for (const maliciousPath of maliciousPaths) {
      expect(() => {
        getMemoryFile({ path: maliciousPath });
      }).toThrow(`Path traversal detected: ${maliciousPath}`);
    }
  });

  it('should allow valid paths within workspace', () => {
    const validPath = 'valid/file.txt';
    const resolvedPath = path.resolve(config.workspace.root, validPath);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('line1\nline2\nline3');

    const result = getMemoryFile({ path: validPath });

    expect(fs.existsSync).toHaveBeenCalledWith(resolvedPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(resolvedPath, 'utf8');
    expect(result.path).toBe(validPath);
    expect(result.content).toBe('line1\nline2\nline3');
    expect(result.totalLines).toBe(3);
  });

  it('should throw an error if the file does not exist', () => {
    const missingPath = 'missing.txt';

    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => {
      getMemoryFile({ path: missingPath });
    }).toThrow(`File not found: ${missingPath}`);
  });
});
