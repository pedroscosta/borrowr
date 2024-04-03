import chalk from 'chalk';
import { Command } from 'commander';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import ora from 'ora';
import path from 'path';
import prompts from 'prompts';
import { z } from 'zod';
import { DEFAULT_CONFIG_FILE, configSchema, getCwdProjectJson } from '../utils/config';
import { logger } from '../utils/logger';

const initOptionsSchema = z.object({
  cwd: z.string(),
  yes: z.boolean(),
  defaults: z.boolean(),
});

export const init = new Command()
  .name('init')
  .description('initialize your project and install dependencies')
  .option('-y, --yes', 'skip confirmation prompt.', false)
  .option('-d, --defaults,', 'use default configuration.', false)
  .option(
    '-c, --cwd <cwd>',
    'the working directory. defaults to the current directory.',
    process.cwd(),
  )
  .action(async (_options) => {
    const initOptions = initOptionsSchema.parse(_options);
    const cwd = path.resolve(initOptions.cwd);
    const skip = initOptions.yes;

    // Ensure target directory exists.
    if (!existsSync(cwd)) {
      logger.error(`The path ${cwd} does not exist. Please try again.`);
      process.exit(1);
    }

    const highlight = (text: string) => chalk.cyan(text);
    const packageJson = await getCwdProjectJson(cwd);

    // Prompt for project information.
    const options = await prompts([
      {
        type: 'text',
        name: 'repositoryUrl',
        message: `What's the link for your ${highlight('repository')}?`,
        initial:
          typeof packageJson?.repository === 'string'
            ? packageJson?.repository
            : packageJson?.repository?.url,
      },
    ]);

    // Validate config schema.
    const config = configSchema.parse({
      repository: {
        mode: 'raw-github',
        url: options.repositoryUrl,
      },
    } as z.infer<typeof configSchema>);

    // Prompt for confirmation.
    if (!skip) {
      const { proceed } = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: `Write configuration to ${highlight(DEFAULT_CONFIG_FILE)}. Proceed?`,
        initial: true,
      });

      if (!proceed) {
        process.exit(0);
      }
    }

    // Write to file.
    logger.break();
    const spinner = ora(`Writing ${DEFAULT_CONFIG_FILE}...`).start();
    const targetPath = path.resolve(cwd, DEFAULT_CONFIG_FILE);
    await writeFile(targetPath, JSON.stringify(config, null, 2), 'utf8');
    spinner.succeed();
  });
