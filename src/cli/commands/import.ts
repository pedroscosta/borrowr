import chalk from 'chalk';
import { Command } from 'commander';
import { execa } from 'execa';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import ora from 'ora';
import path from 'path';
import prompts from 'prompts';
import { z } from 'zod';
import { BlockSpec, parseBlockSpec } from '../utils/block-spec';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { getPackageManager } from '../utils/package-manager';
import { fetchTree, getRegistrySpec, RegistrySpec, resolveTree } from '../utils/registry';

const addOptionsSchema = z.object({
  ids: z.array(z.string()),
  yes: z.boolean(),
  overwrite: z.boolean(),
  all: z.boolean(),
  cwd: z.string(),
  path: z.string().optional(),
});

export const importCommand = new Command()
  .name('import')
  .alias('i')
  .description('imports a block(s) from a remote repository')
  .argument('<block-spec...>', 'blocks to add')
  .option('-y, --yes', 'skip confirmation prompt', false)
  .option('-o, --overwrite', 'overwrite existing files', false)
  .option('-a, --all', 'add all available blocks from the repository', false)
  .option(
    '-c, --cwd <cwd>',
    'the working directory. defaults to the current directory',
    process.cwd(),
  )
  .option('-p, --path <path>', 'the path to add the blocks(s) to')
  .action(async (ids, _options) => {
    const addOptions = addOptionsSchema.parse({
      ids,
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
        `Configuration is missing. Please run ${highlight(`remote add`)} to create a configuration file.`,
      );
      process.exit(1);
    }

    if (!config.remotes) {
      logger.warn(
        `No remote repositories found. Please run ${highlight(`remote add`)} to add one.`,
      );
      process.exit(1);
    }

    const fetchedRegistries: Record<string, RegistrySpec> = {};
    const blocksToInstall: Record<string, BlockSpec> = {};

    // Parse block-specs.
    for (const id of addOptions.ids) {
      let blockSpec: BlockSpec;

      try {
        blockSpec = parseBlockSpec(id);
      } catch (e) {
        logger.error(`Invalid block-spec: ${id}. ${(e as Error).message}.`);
        process.exit(1);
      }

      if (!config.remotes[blockSpec.remoteId]) {
        logger.error(`Remote ${blockSpec.remoteId} not found.`);
        process.exit(1);
      }

      const registry = await getRegistrySpec(config.remotes[blockSpec.remoteId].url);

      fetchedRegistries[blockSpec.remoteId] = registry;

      let selectedBlocks = blockSpec.blockId
        ? [blockSpec.blockId]
        : addOptions.all
          ? Object.keys(registry.registry)
          : addOptions.ids;

      if (!blockSpec.blockId && !addOptions.all) {
        const { blocks } = await prompts({
          type: 'multiselect',
          name: 'blocks',
          message: 'Which components would you like to add?',
          hint: 'Space to select. A to toggle all. Enter to submit.',
          instructions: false,
          choices: Object.entries(registry.registry).map(([id]) => ({
            title: id,
            value: id,
            selected: addOptions.all ? true : addOptions.ids?.includes(id),
          })),
        });

        selectedBlocks = blocks as string[];
      }

      selectedBlocks.forEach((blockId) => {
        blocksToInstall[`${blockSpec.remoteId}:${blockId}`] = blockSpec;
      });
    }

    if (!Object.keys(blocksToInstall)?.length) {
      logger.warn('No blocks selected. Exiting.');
      process.exit(0);
    }

    if (!addOptions.yes) {
      let promptMessage = 'Selected blocks: \n';

      Object.keys(blocksToInstall).forEach((blockId) => {
        promptMessage += ` - ${highlight(blockId)}; \n`;
      });

      promptMessage += `\n Ready to import blocks and dependencies. Proceed?`;

      const { proceed } = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: promptMessage,
        initial: true,
      });

      if (!proceed) {
        process.exit(0);
      }
    }

    const spinner = ora(`Importing blocks...`).start();

    const reducedBlocksToInstall = Object.values(blocksToInstall).reduce<
      Record<string, BlockSpec[]>
    >((acc, blockSpec) => {
      if (!acc[blockSpec.remoteId]) acc[blockSpec.remoteId] = [];
      acc[blockSpec.remoteId].push(blockSpec);
      return acc;
    }, {});

    for (const [remoteId, blocks] of Object.entries(reducedBlocksToInstall)) {
      const registry = fetchedRegistries[remoteId];

      const tree = await resolveTree(
        registry,
        blocks.flatMap((b) => (b.blockId ? [b.blockId] : [])),
      );

      const payload = await fetchTree(registry.baseUrl, tree);

      if (!Object.keys(payload).length) {
        logger.warn('Selected commands not found. Exiting.');
        process.exit(0);
      }

      for (const [id, item] of Object.entries(payload)) {
        const spinnerText = `Installing ${id}...`;
        spinner.text = spinnerText;

        for (let i = 0; i < item.files.length; i++) {
          const blockPathSegments = item.files[i].replace(registry.basePath, '').split('/');

          const targetDir = path.resolve(
            cwd,
            'src',
            'blocks',
            remoteId,
            ...blockPathSegments.slice(0, -1),
          );
          const filePath = path.resolve(targetDir, blockPathSegments.slice(-1)[0]);

          if (!targetDir) continue;

          if (!existsSync(targetDir)) await mkdir(targetDir, { recursive: true });

          const existingComponent = existsSync(filePath);

          if (existingComponent && !addOptions.overwrite) {
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
              spinner.start(spinnerText);
              continue;
            }

            spinner.start(spinnerText);
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
    }
    spinner.succeed(`Done.`);
  });
