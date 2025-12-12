import fs from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import prettier from 'prettier';
import { generate } from 'ts-to-zod';
import ts from 'typescript';
import { z } from 'zod';

import {
  transformTypes,
  getImportPath,
  transformTypesOptionsSchema,
  getAllSchemas,
  namingConfigSchema,
  defaultNamingConfig,
  toSchemaVariableName,
  type SchemaNameMapping,
} from './lib';
import { replaceGeneratedComment } from './lib/comment-utils';
import { validateFileEncoding } from './lib/encoding-utils';
import { logger } from './lib/logger';
import { defaultTypeNameTransformer } from './lib/transform-name-utils';
import { transformTypeNames } from './lib/transform-type-names';

const simplifiedJSDocTagSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
});

const getSchemaNameSchema = z.function({
  input: [z.string()],
  output: z.string(),
});

const nameFilterSchema = z.function({
  input: [z.string()],
  output: z.boolean(),
});

const jSDocTagFilterSchema = z.function({
  input: [z.array(simplifiedJSDocTagSchema)],
  output: z.boolean(),
});

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
      .function({
        input: [z.string()],
        output: z.string(),
      })
      .optional()
      .default(() => defaultTypeNameTransformer),
    namingConfig: namingConfigSchema.optional().default(defaultNamingConfig),
  });

export type SupabaseToZodOptions = z.infer<typeof supabaseToZodOptionsSchema>;

async function collectTypes(
  sourceText: string,
  opts: Omit<SupabaseToZodOptions, 'schema'> & { schema: string },
  schemaNameCollector?: (mapping: SchemaNameMapping) => void,
) {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  function transform(context: ts.TransformationContext) {
    return (node: ts.Node): ts.Node => {
      // Convert empty array types to unknown[]
      // This transformation handles two cases:
      // 1. Empty array type `[]`
      // 2. Empty tuple type `[]` (represented as TupleType in TypeScript AST)
      //
      // Examples:
      // - Relationships: [] -> Relationships: unknown[]
      // - EmptyList: [] -> EmptyList: unknown[]
      if (
        ts.isPropertySignature(node) &&
        node.type &&
        // Case 1: Check for empty array type
        ((ts.isArrayTypeNode(node.type) &&
          (!node.type.elementType ||
            node.type.elementType.kind === ts.SyntaxKind.LastTypeNode)) ||
          // Case 2: Check for empty tuple type
          (node.type.kind === ts.SyntaxKind.TupleType &&
            (node.type as ts.TupleTypeNode).elements.length === 0))
      ) {
        // Create new property signature with type unknown[]
        return ts.factory.updatePropertySignature(
          node,
          node.modifiers,
          node.name,
          node.questionToken,
          ts.factory.createArrayTypeNode(
            ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
          ),
        );
      }
      return ts.visitEachChild(node, transform(context), context);
    };
  }

  const result = ts.transform(sourceFile, [transform]);
  const transformedSourceFile = result.transformed[0];
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const processedSourceText = printer.printNode(
    ts.EmitHint.Unspecified,
    transformedSourceFile,
    sourceFile,
  );

  result.dispose();

  const schemaParsedTypes = transformTypes({
    sourceText: processedSourceText,
    ...opts,
    schemaNameCollector,
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

  logger.info('Validating file encoding...', '🔍');
  await validateFileEncoding(inputPath);

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
  const schemaNameMappings: SchemaNameMapping[] = [];

  logger.info('Transforming types...', '🔄');
  for (const schema of opts.schema) {
    const schemaParsedTypes = await collectTypes(
      sourceText,
      {
        ...opts,
        schema,
      },
      (mapping) => {
        schemaNameMappings.push(mapping);
      },
    );
    parsedTypes += schemaParsedTypes;
  }

  logger.info('Generating Zod schemas...', '📠');

  try {
    const { getZodSchemasFile, getInferredTypes, errors } = generate({
      sourceText: parsedTypes,
      ...opts,
    });

    const schemaNameOverrides = buildSchemaNameOverrides(schemaNameMappings);

    if (errors.length > 0) {
      logger.error('Schema generation failed with the following errors:');
      errors.forEach((error) => logger.error(`- ${error}`));
      throw new Error('Schema generation failed. See above for details.');
    }

    const zodSchemasFile = getZodSchemasFile(
      getImportPath(outputPath, inputPath),
    );

    const schemaContentWithOverrides = applySchemaNameOverrides(
      zodSchemasFile,
      schemaNameOverrides,
    );

    const contentWithNewComment = replaceGeneratedComment(
      schemaContentWithOverrides,
    );

    const formatterSchemasFileContent = await prettier.format(
      contentWithNewComment,
      {
        parser: 'babel-ts',
      },
    );

    if (opts.typesOutput) {
      const typesOutputPath = join(process.cwd(), opts.typesOutput);

      const zodSchemasImportPath = getImportPath(typesOutputPath, outputPath);
      let typesContent = getInferredTypes(zodSchemasImportPath);
      typesContent = applySchemaNameOverrides(
        typesContent,
        schemaNameOverrides,
      );

      const typeNameOverrides = buildTypeNameOverrides(
        schemaNameMappings,
        opts.typeNameTransformer,
      );
      typesContent = applyTypeNameOverrides(typesContent, typeNameOverrides);

      const preserveTypeNames = schemaNameMappings.some(({ typeName }) =>
        /[^A-Za-z0-9]/.test(typeName),
      );

      const typeNameTransformer = preserveTypeNames
        ? (name: string) => name
        : opts.typeNameTransformer;

      typesContent = transformTypeNames(typesContent, typeNameTransformer);

      const typesWithNewComment = replaceGeneratedComment(typesContent);

      const formatterTypesFileContent = await prettier.format(
        typesWithNewComment,
        {
          parser: 'babel-ts',
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

function buildSchemaNameOverrides(
  mappings: SchemaNameMapping[],
): Map<string, string> {
  const overrides = new Map<string, string>();

  for (const { typeName, schemaName } of mappings) {
    const defaultSchemaName = toSchemaVariableName(typeName);

    if (!defaultSchemaName || defaultSchemaName === schemaName) {
      continue;
    }

    if (!overrides.has(defaultSchemaName)) {
      overrides.set(defaultSchemaName, schemaName);
      continue;
    }

    const existing = overrides.get(defaultSchemaName);
    if (existing && existing !== schemaName) {
      logger.warn(
        `Conflicting schema naming overrides for ${defaultSchemaName}: keeping ${existing}, ignoring ${schemaName}`,
      );
    }
  }

  return overrides;
}

function applySchemaNameOverrides(
  content: string,
  overrides: Map<string, string>,
): string {
  if (!overrides.size) {
    return content;
  }

  let updatedContent = content;
  const entries = [...overrides.entries()].sort(
    ([a], [b]) => b.length - a.length,
  );

  for (const [from, to] of entries) {
    const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g');
    updatedContent = updatedContent.replace(pattern, to);
  }

  return updatedContent;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTypeNameOverrides(
  mappings: SchemaNameMapping[],
  typeNameTransformer: (name: string) => string,
): Map<string, string> {
  const overrides = new Map<string, string>();

  for (const { typeName } of mappings) {
    if (!/[^A-Za-z0-9]/.test(typeName)) continue;

    const defaultName = typeNameTransformer(typeName);

    if (!defaultName || defaultName === typeName) continue;

    if (!overrides.has(defaultName)) {
      overrides.set(defaultName, typeName);
      continue;
    }

    const existing = overrides.get(defaultName);
    if (existing && existing !== typeName) {
      logger.warn(
        `Conflicting type naming overrides for ${defaultName}: keeping ${existing}, ignoring ${typeName}`,
      );
    }
  }

  return overrides;
}

function applyTypeNameOverrides(
  content: string,
  overrides: Map<string, string>,
): string {
  if (!overrides.size) {
    return content;
  }

  let updatedContent = content;
  const entries = [...overrides.entries()].sort(
    ([a], [b]) => b.length - a.length,
  );

  for (const [from, to] of entries) {
    const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g');
    updatedContent = updatedContent.replace(pattern, to);
  }

  return updatedContent;
}
