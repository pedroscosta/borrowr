#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../../package.json';
import { init } from './commands/init.js';

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

const main = async () => {
  const program = new Command()
    .name('borrowr')
    .description('A tool for creating a code borrower cli')
    .version(version, '-v, --version', 'display the version number');

  program.addCommand(init);

  program.parse();
};

main();
