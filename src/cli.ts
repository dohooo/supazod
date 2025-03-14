#!/usr/bin/env node

import { program } from 'commander';
import fsSync from 'node:fs';
import { join } from 'node:path';
import * as url from 'url';

import supabaseToZod, { supabaseToZodOptionsSchema } from './supabase-to-zod';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const defaultPackageJsonPath = join(__dirname, 'package.json');
const packageJsonPath = fsSync.existsSync(defaultPackageJsonPath)
  ? defaultPackageJsonPath
  : join(__dirname, '../package.json');

const packageJson = JSON.parse(
  fsSync.readFileSync(packageJsonPath, {}).toString(),
);

program
  .name(packageJson.name)
  .version(packageJson.version)
  .option('-i, --input <input>', 'Path to the types generated by supabase cli')
  .option('-o, --output <output>', 'Path to the output file')
  .option(
    '-t, --types-output [types-output]',
    'Path to output inferred types file',
  )
  .option('-s, --schema [schema]', 'Specify schemas (comma-separated)', '')
  .option('-v, --verbose', 'Enable verbose logging')
  .parse(process.argv);

const opts = supabaseToZodOptionsSchema.parse({
  ...program.opts(),
  schema: program
    .opts()
    .schema.split(',')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length),
});

(async () => {
  try {
    await supabaseToZod(opts);
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
