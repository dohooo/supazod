import fs from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import prettier from 'prettier';
import { generate } from 'ts-to-zod';
import { z } from 'zod';

import {
  transformTypes,
  getImportPath,
  transformTypesOptionsSchema,
  getAllSchemas,
} from './lib';
import { replaceGeneratedComment } from './lib/comment-utils';
import { logger } from './lib/logger';
import { defaultTypeNameTransformer } from './lib/transform-name-utils';
import { transformTypeNames } from './lib/transform-type-names';

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
  const result = await generateContent(opts);

  if (!result) {
    logger.error('Failed to generate schemas', '❌');
    return;
  }

  logger.info('Writing schema file...', '💾');
  await fs.writeFile(opts.output, result.formatterSchemasFileContent);

  if (opts.typesOutput && result.formatterTypesFileContent) {
    logger.info('Writing types file...', '📝');
    await fs.writeFile(opts.typesOutput, result.formatterTypesFileContent);
  }

  logger.info('Successfully generated Zod schemas!', '✅');
}

export async function generateContent(opts: SupabaseToZodOptions) {
  logger.setVerbose(opts.verbose || false);

  const inputPath = isAbsolute(opts.input)
    ? opts.input
    : join(process.cwd(), opts.input);
  const outputPath = isAbsolute(opts.output)
    ? opts.output
    : join(process.cwd(), opts.output);

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

    const contentWithNewComment = replaceGeneratedComment(zodSchemasFile);

    const prettierConfig = await prettier.resolveConfig(process.cwd());

    const formatterSchemasFileContent = await prettier.format(
      contentWithNewComment,
      {
        parser: 'babel-ts',
        ...prettierConfig,
      },
    );

    if (opts.typesOutput) {
      const typesOutputPath = join(process.cwd(), opts.typesOutput);

      const zodSchemasImportPath = getImportPath(typesOutputPath, outputPath);
      let typesContent = getInferredTypes(zodSchemasImportPath);

      typesContent = transformTypeNames(typesContent, opts.typeNameTransformer);

      const typesWithNewComment = replaceGeneratedComment(typesContent);

      const formatterTypesFileContent = await prettier.format(
        typesWithNewComment,
        {
          parser: 'babel-ts',
          ...prettierConfig,
        },
      );

      return {
        rawSchemasFileContent: contentWithNewComment,
        rawTypesFileContent: typesWithNewComment,
        formatterSchemasFileContent,
        formatterTypesFileContent,
      };
    }

    return {
      rawSchemasFileContent: contentWithNewComment,
      formatterSchemasFileContent,
    };
  } catch (error) {
    throw new Error('Failed to generate schemas: ' + error);
  }
}
