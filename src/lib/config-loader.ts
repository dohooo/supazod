import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
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
  configPathOverride?: string,
): Promise<SupazodConfig> {
  if (configPathOverride) {
    const resolvedPath = isAbsolute(configPathOverride)
      ? configPathOverride
      : resolve(cwd, configPathOverride);

    if (!existsSync(resolvedPath)) {
      throw new Error(`Configuration file not found: ${resolvedPath}`);
    }

    return loadConfigFromPath(resolvedPath);
  }

  for (const configFileName of CONFIG_FILE_NAMES) {
    const configPath = join(cwd, configFileName);

    if (existsSync(configPath)) {
      return loadConfigFromPath(configPath);
    }
  }

  logger.debug('No config file found, using defaults', '⚙️');
  return {};
}

async function loadConfigFromPath(configPath: string): Promise<SupazodConfig> {
  logger.debug(`Loading config file: ${configPath}`, '⚙️');

  try {
    let config: SupazodConfig | (() => SupazodConfig);

    if (
      configPath.endsWith('.json') ||
      configPath.endsWith('.rc') ||
      configPath.endsWith('.rc.json') ||
      configPath.endsWith('.supazodrc')
    ) {
      const configContent = readFileSync(configPath, 'utf-8');
      config = JSON.parse(configContent);
    } else {
      const configUrl = pathToFileURL(configPath).href;
      const configModule = await import(configUrl);
      config = configModule.default || configModule;
    }

    const finalConfig = typeof config === 'function' ? config() : config;

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
    logger.error(`Failed to load config from ${configPath}: ${error}`, '❌');
    throw new Error(`Invalid configuration file: ${configPath}`);
  }
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

  if (args.tableSchemaPattern) {
    namingConfig.tableSchemaPattern = args.tableSchemaPattern;
  }

  if (args.enumPattern) {
    namingConfig.enumPattern = args.enumPattern;
  }

  if (args.enumSchemaPattern) {
    namingConfig.enumSchemaPattern = args.enumSchemaPattern;
  }

  if (args.compositeTypePattern) {
    namingConfig.compositeTypePattern = args.compositeTypePattern;
  }

  if (args.compositeTypeSchemaPattern) {
    namingConfig.compositeTypeSchemaPattern = args.compositeTypeSchemaPattern;
  }

  if (args.functionArgsPattern) {
    namingConfig.functionArgsPattern = args.functionArgsPattern;
  }

  if (args.functionArgsSchemaPattern) {
    namingConfig.functionArgsSchemaPattern = args.functionArgsSchemaPattern;
  }

  if (args.functionReturnsPattern) {
    namingConfig.functionReturnsPattern = args.functionReturnsPattern;
  }

  if (args.functionReturnsSchemaPattern) {
    namingConfig.functionReturnsSchemaPattern =
      args.functionReturnsSchemaPattern;
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
