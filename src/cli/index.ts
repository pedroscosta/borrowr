#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../../package.json';
import { add } from './commands/add';
import { init } from './commands/init.js';
import { CLI_NAME } from './utils/config';

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

const main = async () => {
  const program = new Command()
    .name(CLI_NAME)
    .description('A tool for creating a code borrower cli')
    .version(version, '-v, --version', 'display the version number');

  program.addCommand(init).addCommand(add);

  program.parse();
};

main();
