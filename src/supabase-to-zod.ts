import fs from 'node:fs/promises';
import { join } from 'node:path';
import prettier from 'prettier';
import { generate } from 'ts-to-zod';
import { z } from 'zod';

import {
  transformTypes,
  getImportPath,
  transformTypesOptionsSchema,
  getAllSchemas,
} from './lib';
import { logger } from './lib/logger';
import { transformTypeNames } from './lib/transform-type-names';
import { defaultTypeNameTransformer } from './lib/transform-name-utils';

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
    typesOutput: z.string().optional(),
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
    typeNameTransformer: z
      .function()
      .args(z.string())
      .returns(z.string())
      .optional()
      .default(() => defaultTypeNameTransformer),
  });

export type SupabaseToZodOptions = z.infer<typeof supabaseToZodOptionsSchema>;

async function collectTypes(
  sourceText: string,
  opts: Omit<SupabaseToZodOptions, 'schema'> & { schema: string },
) {
  const schemaParsedTypes = transformTypes({
    sourceText,
    ...opts,
  });

  return schemaParsedTypes;
}

export default async function supabaseToZod(opts: SupabaseToZodOptions) {
  logger.setVerbose(opts.verbose || false);

  const inputPath = join(process.cwd(), opts.input);
  const outputPath = join(process.cwd(), opts.output);

  logger.info('Reading input file...', '📦');
  const sourceText = await fs.readFile(inputPath, 'utf-8');

  if (!opts.schema.length) {
    logger.warn(`No schema specified, using all available schemas`, '🤖');
    opts.schema = getAllSchemas(sourceText);
  }

  if (!opts.schema.length) {
    throw new Error('No schemas specified');
  }

  logger.info(`Detected schemas: ${opts.schema.join(', ')}`, '📋');

  let parsedTypes = '';

  logger.info('Transforming types...', '🔄');
  for (const schema of opts.schema) {
    const schemaParsedTypes = await collectTypes(sourceText, {
      ...opts,
      schema,
    });
    parsedTypes += schemaParsedTypes;
  }

  logger.info('Generating Zod schemas...', '📠');

  try {
    const { getZodSchemasFile, getInferredTypes, errors } = generate({
      sourceText: parsedTypes,
      ...opts,
    });

    if (errors.length > 0) {
      logger.error('Schema generation failed with the following errors:');
      errors.forEach((error) => logger.error(`- ${error}`));
      throw new Error('Schema generation failed. See above for details.');
    }

    const zodSchemasFile = getZodSchemasFile(
      getImportPath(outputPath, inputPath),
    );

    const prettierConfig = await prettier.resolveConfig(process.cwd());

    logger.info('Writing schema file...', '💾');
    await fs.writeFile(
      outputPath,
      await prettier.format(zodSchemasFile, {
        parser: 'babel-ts',
        ...prettierConfig,
      }),
    );

    if (opts.typesOutput) {
      const typesOutputPath = join(process.cwd(), opts.typesOutput);
      logger.info('Writing types file...', '📝');

      const zodSchemasImportPath = getImportPath(typesOutputPath, outputPath);
      let typesContent = getInferredTypes(zodSchemasImportPath);

      typesContent = transformTypeNames(typesContent, opts.typeNameTransformer);

      await fs.writeFile(
        typesOutputPath,
        await prettier.format(typesContent, {
          parser: 'babel-ts',
          ...prettierConfig,
        }),
      );
    }

    logger.info('Successfully generated Zod schemas!', '✅');
  } catch (error) {
    logger.error(`Failed to generate schemas: ${error}`, '❌');
    throw new Error('Failed to generate schemas: ' + error);
  }
}
