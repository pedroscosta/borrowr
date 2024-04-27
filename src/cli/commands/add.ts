import chalk from 'chalk';
import { Command } from 'commander';
import { execa } from 'execa';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import ora from 'ora';
import path from 'path';
import prompts from 'prompts';
import { z } from 'zod';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { getPackageManager } from '../utils/package-manager';
import {
  fetchTree,
  getRegistryBasePathFromConfig,
  getRegistryIndex,
  resolveTree,
} from '../utils/registry';

const addOptionsSchema = z.object({
  commands: z.array(z.string()).optional(),
  yes: z.boolean(),
  overwrite: z.boolean(),
  cwd: z.string(),
  all: z.boolean(),
  path: z.string().optional(),
});

export const add = new Command()
  .name('add')
  .description('initialize your project and install dependencies')
  .argument('[commands...]', 'the commands to add')
  .option('-y, --yes', 'skip confirmation prompt', true)
  .option('-o, --overwrite', 'overwrite existing files', false)
  .option(
    '-c, --cwd <cwd>',
    'the working directory. defaults to the current directory',
    process.cwd(),
  )
  .option('-a, --all', 'add all available commands', false)
  .option('-p, --path <path>', 'the path to add the command(s) to')
  .action(async (commands, _options) => {
    const addOptions = addOptionsSchema.parse({
      commands,
      ..._options,
    });
    const cwd = path.resolve(addOptions.cwd);

    // Ensure target directory exists.
    if (!existsSync(cwd)) {
      logger.error(`The path ${cwd} does not exist. Please try again.`);
      process.exit(1);
    }

    const highlight = (text: string) => chalk.cyan(text);

    // Get current config.
    const config = await getConfig(cwd);

    if (!config) {
      logger.warn(
        `Configuration is missing. Please run ${highlight(`init`)} to create a configuration file.`,
      );
      process.exit(1);
    }

    // Get commands registry.
    const repositoryBasePath = await getRegistryBasePathFromConfig(cwd);
    const registryIndex = await getRegistryIndex(repositoryBasePath);

    let selectedCommands = addOptions.all
      ? Object.entries(registryIndex.registry).map(([id]) => id)
      : addOptions.commands;

    if (!addOptions.commands?.length && !addOptions.all) {
      const { components: commands } = await prompts({
        type: 'multiselect',
        name: 'components',
        message: 'Which components would you like to add?',
        hint: 'Space to select. A to toggle all. Enter to submit.',
        instructions: false,
        choices: Object.entries(registryIndex.registry).map(([id]) => ({
          title: id,
          value: id,
          selected: addOptions.all ? true : addOptions.commands?.includes(id),
        })),
      });

      selectedCommands = commands;
    }

    if (!selectedCommands?.length) {
      logger.warn('No commands selected. Exiting.');
      process.exit(0);
    }

    const tree = await resolveTree(registryIndex, selectedCommands);
    const payload = await fetchTree(repositoryBasePath, tree);

    if (!Object.keys(payload).length) {
      logger.warn('Selected commands not found. Exiting.');
      process.exit(0);
    }

    if (!addOptions.yes) {
      const { proceed } = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: `Ready to install commands and dependencies. Proceed?`,
        initial: true,
      });

      if (!proceed) {
        process.exit(0);
      }
    }

    const spinner = ora(`Installing components...`).start();

    for (const [id, item] of Object.entries(payload)) {
      const spinnerText = `Installing ${id}...`;
      spinner.text = spinnerText;

      for (let i = 0; i < item.files.length; i++) {
        const pathSegments = item.files[i].replace('cli/', '').split('/'); // TODO: Allow destination folders on config

        const targetDir = path.resolve(cwd, ...pathSegments.slice(0, -1));
        const filePath = path.resolve(targetDir, pathSegments.slice(-1)[0]);

        if (!targetDir) continue;

        if (!existsSync(targetDir)) await mkdir(targetDir, { recursive: true });

        const existingComponent = existsSync(filePath);

        if (existingComponent && !addOptions.overwrite) {
          if (selectedCommands.includes(id)) {
            spinner.stop();
            const { overwrite } = await prompts({
              type: 'confirm',
              name: 'overwrite',
              message: `File ${filePath} already exists. Would you like to overwrite?`,
              initial: false,
            });

            if (!overwrite) {
              logger.info(
                `Skipped ${filePath}. To overwrite, run with the ${chalk.green('--overwrite')} flag.`,
              );
              continue;
            }

            spinner.start(spinnerText);
          } else continue;
        }

        const content = item.rawFiles[i]; // TODO: Transform into JS and fix imports

        await writeFile(filePath, content);
      }

      const packageManager = await getPackageManager(cwd);

      if (item.dependencies?.length) {
        await execa(
          packageManager,
          [packageManager === 'npm' ? 'install' : 'add', ...item.dependencies],
          {
            cwd,
          },
        );
      }
    }

    spinner.succeed(`Done.`);
  });
