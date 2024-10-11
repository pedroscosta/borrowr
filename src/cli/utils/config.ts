import chalk from 'chalk';
import { cosmiconfig } from 'cosmiconfig';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import ora from 'ora';
import path from 'path';
import prompts from 'prompts';
import { z } from 'zod';
import { logger } from './logger';

export const CLI_NAME = 'borrowr';
export const DEFAULT_CONFIG_FILE = `.${CLI_NAME}rc`;

const explorer = cosmiconfig(CLI_NAME);

export const configSchema = z
  .object({
    $schema: z.string().optional(),
    repository: z
      .object({
        mode: z.enum(['raw-github']),
        url: z.string(),
      })
      .optional(),
    remotes: z
      .record(
        z.string(),
        z.object({
          type: z.enum(['github-raw']),
          url: z.string(),
        }),
      )
      .optional(),
  })
  .strict();

export const getCwdProjectJson = async (cwd: string) => {
  return JSON.parse(
    (await readFile(path.resolve(cwd, 'package.json'), { encoding: 'utf-8' })) ?? '{}',
  );
};

export const getConfig = async (cwd: string) => {
  const configResult = await explorer.search(cwd);

  if (!configResult) return;

  try {
    return configSchema.parse(configResult.config);
  } catch (error) {
    throw new Error(`Invalid configuration found in ${cwd}/${configResult.filepath}`);
  }
};

export const writeOrCreateConfig = async (
  cwd: string,
  config: z.infer<typeof configSchema>,
  skip: boolean = false,
) => {
  // Ensure target directory exists.

  if (!existsSync(cwd)) {
    logger.error(`The path ${cwd} does not exist. Please try again.`);
    process.exit(1);
  }

  const targetPath = path.resolve(cwd, DEFAULT_CONFIG_FILE);

  if (!existsSync(cwd) && !skip) {
    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: `No configuration found. Would like to create one? (${chalk.cyan(DEFAULT_CONFIG_FILE)})`,
      initial: true,
    });

    if (!proceed) {
      process.exit(0);
    }
  }

  const spinner = ora(`Writing configuration to $${chalk.cyan(DEFAULT_CONFIG_FILE)}...`).start();
  await writeFile(targetPath, JSON.stringify(config, null, 2), 'utf8');
  spinner.succeed();
};
