import { Command } from 'commander';
import prompts from 'prompts';
import { z } from 'zod';
import { getConfig, writeOrCreateConfig } from '../utils/config';
import { logger } from '../utils/logger';

const addOptionsSchema = z.object({
  url: z.string({
    required_error: 'URL is required',
  }),
  name: z.string().optional(),
  cwd: z.string(),
});

const add = new Command()
  .name('add')
  .description('add a remote repository')
  .argument('<url>', 'the url of the repository')
  .argument('[name]', 'the name of the repository')
  .option(
    '-c, --cwd <cwd>',
    'the working directory. defaults to the current directory.',
    process.cwd(),
  )
  .action(async (_url, _name, _options) => {
    const parsedArgs = addOptionsSchema.safeParse({ url: _url, name: _name, ..._options });

    if (!parsedArgs.success) {
      logger.error(parsedArgs.error.issues[0].message);
      process.exit(1);
    }

    const { name, url, cwd } = parsedArgs.data;

    const prevConfig = await getConfig(cwd);

    let parsedName = name ?? url.replace(/^https?:\/\//, '').split('/')[2];

    if (!name) {
      const { name: givenName } = await prompts({
        type: 'text',
        name: 'name',
        message: `What is the name of the remote repository?`,
        initial: parsedName,
      });

      if (!givenName) {
        process.exit(0);
      }

      parsedName = givenName;
    }

    await writeOrCreateConfig(cwd, {
      ...prevConfig,
      remotes: { ...prevConfig?.remotes, [parsedName]: { url, type: 'github-raw' } },
    });
  });

export const remote = new Command()
  .name('remote')
  .description('manages remote repositories')
  .action(async () => {
    logger.info('Remote repositories:');
  });

remote.addCommand(add);
