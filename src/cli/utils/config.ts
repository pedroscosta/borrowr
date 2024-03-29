import { readFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';

export const configSchema = z
  .object({
    $schema: z.string().optional(),
    repository: z.object({
      mode: z.enum(['raw-github']),
      url: z.string(),
    }),
  })
  .strict();

export const getCwdProjectJson = async (cwd: string) => {
  return JSON.parse(
    (await readFile(path.resolve(cwd, 'package.json'), { encoding: 'utf-8' })) ?? '{}',
  );
};
