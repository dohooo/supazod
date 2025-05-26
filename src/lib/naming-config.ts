import { z } from 'zod';

/**
 * Available placeholders for naming patterns
 */
export type Placeholder =
  | 'schema'
  | 'table'
  | 'operation'
  | 'function'
  | 'name'
  | 'type';

/**
 * Template literal type for naming patterns
 * Provides better TypeScript intellisense for placeholders
 */
export type NamingPattern<T extends Placeholder[]> = string & {
  __placeholders?: T;
};

/**
 * Table operation pattern with schema, table, and operation placeholders
 */
export type TableOperationPattern = NamingPattern<
  ['schema', 'table', 'operation']
>;

/**
 * Enum pattern with schema and name placeholders
 */
export type EnumPattern = NamingPattern<['schema', 'name']>;

/**
 * Composite type pattern with schema and name placeholders
 */
export type CompositeTypePattern = NamingPattern<['schema', 'name']>;

/**
 * Function args pattern with schema and function placeholders
 */
export type FunctionArgsPattern = NamingPattern<['schema', 'function']>;

/**
 * Function returns pattern with schema and function placeholders
 */
export type FunctionReturnsPattern = NamingPattern<['schema', 'function']>;

/**
 * Schema naming pattern configuration with typed templates
 */
export interface NamingConfig {
  /** Pattern for table operations (Row, Insert, Update) */
  tableOperationPattern: TableOperationPattern;
  /** Pattern for enum types */
  enumPattern: EnumPattern;
  /** Pattern for composite types */
  compositeTypePattern: CompositeTypePattern;
  /** Pattern for function arguments */
  functionArgsPattern: FunctionArgsPattern;
  /** Pattern for function returns */
  functionReturnsPattern: FunctionReturnsPattern;
  /** Whether to capitalize schema names */
  capitalizeSchema: boolean;
  /** Whether to capitalize table/type names */
  capitalizeNames: boolean;
  /** Separator to use when joining parts (empty string for no separator) */
  separator: string;
}

/**
 * Partial naming configuration for user input
 */
export type UserNamingConfig = Partial<NamingConfig>;

/**
 * Complete Supazod configuration
 */
export interface SupazodConfig {
  /** Naming configuration for generated schemas */
  namingConfig?: UserNamingConfig;
}

/**
 * Schema for validating naming configuration
 */
export const namingConfigSchema = z.object({
  /** Pattern for table operations (Row, Insert, Update) */
  tableOperationPattern: z.string().default('{schema}{table}{operation}'),
  /** Pattern for enum types */
  enumPattern: z.string().default('{schema}{name}'),
  /** Pattern for composite types */
  compositeTypePattern: z.string().default('{schema}{name}'),
  /** Pattern for function arguments */
  functionArgsPattern: z.string().default('{schema}{function}Args'),
  /** Pattern for function returns */
  functionReturnsPattern: z.string().default('{schema}{function}Returns'),
  /** Whether to capitalize schema names */
  capitalizeSchema: z.boolean().default(true),
  /** Whether to capitalize table/type names */
  capitalizeNames: z.boolean().default(true),
  /** Separator to use when joining parts (empty string for no separator) */
  separator: z.string().default(''),
});

export const defaultNamingConfig: NamingConfig = {
  tableOperationPattern: '{schema}{table}{operation}' as TableOperationPattern,
  enumPattern: '{schema}{name}' as EnumPattern,
  compositeTypePattern: '{schema}{name}' as CompositeTypePattern,
  functionArgsPattern: '{schema}{function}Args' as FunctionArgsPattern,
  functionReturnsPattern: '{schema}{function}Returns' as FunctionReturnsPattern,
  capitalizeSchema: true,
  capitalizeNames: true,
  separator: '',
};

/**
 * Define Supazod configuration with TypeScript support
 *
 * @example
 * ```typescript
 * // supazod.config.ts
 * import { defineConfig } from 'supazod';
 *
 * export default defineConfig({
 *   namingConfig: {
 *     tableOperationPattern: '{schema}_{table}_{operation}', // TypeScript will provide autocomplete
 *     enumPattern: '{schema}_{name}_Enum',
 *     capitalizeSchema: true,
 *   }
 * });
 * ```
 */
export function defineConfig(config: SupazodConfig): SupazodConfig {
  return config;
}

/**
 * Formats a name according to the naming configuration
 */
export function formatName(
  pattern: string,
  placeholders: Record<string, string>,
  config: Pick<
    NamingConfig,
    'capitalizeSchema' | 'capitalizeNames' | 'separator'
  >,
): string {
  let result = pattern;

  for (const [key, value] of Object.entries(placeholders)) {
    const placeholder = `{${key}}`;
    let formattedValue = value;

    // Apply capitalization rules
    if (key === 'schema' && config.capitalizeSchema) {
      formattedValue = toCamelCase(value);
    } else if (key !== 'schema' && config.capitalizeNames) {
      formattedValue = toCamelCase(value);
    }

    result = result.replace(new RegExp(placeholder, 'g'), formattedValue);
  }

  return result;
}

/**
 * Convert snake_case or regular string to PascalCase
 */
function toCamelCase(input: string): string {
  if (input.includes('_')) {
    return input
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}
