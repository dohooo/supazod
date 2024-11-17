import fs from 'node:fs/promises';
import { join } from 'node:path';
import prettier from 'prettier';
import { generate } from 'ts-to-zod';
import { z } from 'zod';

import {
  transformTypes,
  getImportPath,
  transformTypesOptionsSchema,
} from './lib';
import { logger } from './lib/logger';

const simplifiedJSDocTagSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
});

const getSchemaNameSchema = z.function().args(z.string()).returns(z.string());

const nameFilterSchema = z.function().args(z.string()).returns(z.boolean());

const jSDocTagFilterSchema = z
  .function()
  .args(z.array(simplifiedJSDocTagSchema))
  .returns(z.boolean());

export const supabaseToZodOptionsSchema = transformTypesOptionsSchema
  .omit({ sourceText: true })
  .extend({
    input: z.string(),
    output: z.string(),
    schema: z
      .union([z.string(), z.array(z.string())])
      .transform((val) => (Array.isArray(val) ? val : [val])),
    skipValidation: z.boolean().optional(),
    maxRun: z.number().optional(),
    nameFilter: nameFilterSchema.optional(),
    jsDocTagFilter: jSDocTagFilterSchema.optional(),
    getSchemaName: getSchemaNameSchema.optional(),
    keepComments: z.boolean().optional().default(false),
    skipParseJSDoc: z.boolean().optional().default(false),
    verbose: z.boolean().optional().default(false),
  });

export type SupabaseToZodOptions = z.infer<typeof supabaseToZodOptionsSchema>;

async function collectTypes(inputPath: string, opts: SupabaseToZodOptions) {
  logger.info('Reading input file...', '📦');
  const sourceText = await fs.readFile(inputPath, 'utf-8');

  logger.info('Transforming types...', '🔄');

  const allParsedTypes = await Promise.all(
    opts.schema.map(async (schema) => {
      const schemaParsedTypes = transformTypes({
        sourceText,
        ...opts,
        schema,
      });
      return schemaParsedTypes;
    }),
  );

  const combinedParsedTypes = allParsedTypes.join('\n\n');

  logger.debug(`Options: ${JSON.stringify({ sourceText, ...opts }, null, 2)}`);

  return combinedParsedTypes;
}

export default async function supabaseToZod(opts: SupabaseToZodOptions) {
  logger.setVerbose(opts.verbose || false);

  const inputPath = join(process.cwd(), opts.input);
  const outputPath = join(process.cwd(), opts.output);

  const parsedTypes = await collectTypes(inputPath, opts);

  logger.info('Generating Zod schemas...', '📠');

  try {
    const { getZodSchemasFile, transformedSourceText, errors } = generate({
      sourceText: parsedTypes,
      ...opts,
    });

    if (errors.length > 0) {
      logger.error('Schema generation failed with the following errors:');
      errors.forEach((error) => logger.error(`- ${error}`));
      throw new Error('Schema generation failed. See above for details.');
    }

    if (opts.verbose) {
      logger.debug('Parsed types:', parsedTypes);
      logger.debug('Transformed source:', transformedSourceText);
    }

    const zodSchemasFile = getZodSchemasFile(
      getImportPath(outputPath, inputPath),
    );

    const prettierConfig = await prettier.resolveConfig(process.cwd());

    logger.info('Writing output file...', '💾');
    await fs.writeFile(
      outputPath,
      await prettier.format(zodSchemasFile, {
        parser: 'babel-ts',
        ...prettierConfig,
      }),
    );

    logger.info('Successfully generated Zod schemas!', '✅');
  } catch (error) {
    logger.error(`Failed to generate schemas: ${error}`, '❌');
    throw new Error('Failed to generate schemas: ' + error);
  }
}
