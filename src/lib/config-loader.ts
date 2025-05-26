import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { logger } from './logger';
import {
  namingConfigSchema,
  type NamingConfig,
  type SupazodConfig,
  defaultNamingConfig,
} from './naming-config';

const CONFIG_FILE_NAMES = [
  'supazod.config.ts',
  'supazod.config.js',
  'supazod.config.mjs',
  'supazod.config.json',
  '.supazodrc.ts',
  '.supazodrc.js',
  '.supazodrc.mjs',
  '.supazodrc.json',
  '.supazodrc',
];

/**
 * Load configuration from config file
 */
export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<SupazodConfig> {
  for (const configFileName of CONFIG_FILE_NAMES) {
    const configPath = join(cwd, configFileName);

    if (existsSync(configPath)) {
      logger.debug(`Found config file: ${configPath}`, '⚙️');

      try {
        let config: SupazodConfig | (() => SupazodConfig);

        // Handle JSON files
        if (
          configFileName.endsWith('.json') ||
          configFileName === '.supazodrc'
        ) {
          const configContent = readFileSync(configPath, 'utf-8');
          config = JSON.parse(configContent);
        } else {
          // Handle JS/TS/MJS files
          const configUrl = pathToFileURL(configPath).href;
          const configModule = await import(configUrl);
          config = configModule.default || configModule;
        }

        // If config is a function (from defineConfig), call it
        let finalConfig: SupazodConfig;
        if (typeof config === 'function') {
          finalConfig = config();
        } else {
          finalConfig = config;
        }

        // Validate naming config if provided
        if (finalConfig.namingConfig) {
          const validatedNamingConfig = namingConfigSchema.parse({
            ...defaultNamingConfig,
            ...finalConfig.namingConfig,
          });

          return {
            ...finalConfig,
            namingConfig: validatedNamingConfig,
          };
        }

        return finalConfig;
      } catch (error) {
        logger.error(
          `Failed to load config from ${configPath}: ${error}`,
          '❌',
        );
        throw new Error(`Invalid configuration file: ${configPath}`);
      }
    }
  }

  logger.debug('No config file found, using defaults', '⚙️');
  return {};
}

/**
 * Parse CLI naming config arguments
 */
export function parseCliNamingConfig(
  args: Record<string, any>,
): Partial<NamingConfig> {
  const namingConfig: Partial<NamingConfig> = {};

  if (args.tableOperationPattern) {
    namingConfig.tableOperationPattern = args.tableOperationPattern;
  }

  if (args.enumPattern) {
    namingConfig.enumPattern = args.enumPattern;
  }

  if (args.compositeTypePattern) {
    namingConfig.compositeTypePattern = args.compositeTypePattern;
  }

  if (args.functionArgsPattern) {
    namingConfig.functionArgsPattern = args.functionArgsPattern;
  }

  if (args.functionReturnsPattern) {
    namingConfig.functionReturnsPattern = args.functionReturnsPattern;
  }

  if (typeof args.capitalizeSchema === 'boolean') {
    namingConfig.capitalizeSchema = args.capitalizeSchema;
  }

  if (typeof args.capitalizeNames === 'boolean') {
    namingConfig.capitalizeNames = args.capitalizeNames;
  }

  if (args.separator) {
    namingConfig.separator = args.separator;
  }

  return namingConfig;
}
