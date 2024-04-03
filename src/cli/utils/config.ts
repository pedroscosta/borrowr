import { cosmiconfig } from 'cosmiconfig';
import { readFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';

export const CLI_NAME = 'borrowr';
export const DEFAULT_CONFIG_FILE = `.${CLI_NAME}rc`;

const explorer = cosmiconfig(CLI_NAME);

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

export const getConfig = async (cwd: string) => {
  const configResult = await explorer.search(cwd);

  if (!configResult) throw new Error(`Configuration file not found in ${cwd}`);

  try {
    return configSchema.parse(configResult.config);
  } catch (error) {
    throw new Error(`Invalid configuration found in ${cwd}/${configResult.filepath}`);
  }
};
