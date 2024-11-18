import ts from 'typescript';
import { z } from 'zod';

import { getNodeName } from './get-node-name';
import { logger } from './logger';

const enumFormatterSchema = z.function().args(z.string()).returns(z.string());
const compositeTypeFormatterSchema = z
  .function()
  .args(z.string())
  .returns(z.string());
const functionFormatterSchema = z
  .function()
  .args(z.string(), z.string())
  .returns(z.string());
const tableOrViewFormatterSchema = z
  .function()
  .args(z.string(), z.string())
  .returns(z.string());

export const transformTypesOptionsSchema = z.object({
  sourceText: z.string(),
  schema: z.string().default(''),
  processDependencies: z.boolean().default(true),
  enumFormatter: enumFormatterSchema.default(
    () => (name: string) => toCamelCase([name]),
  ),
  compositeTypeFormatter: compositeTypeFormatterSchema.default(
    () => (name: string) => toCamelCase([name]),
  ),
  functionFormatter: functionFormatterSchema.default(
    () => (name: string, type: string) => `${toCamelCase([name, type])}`,
  ),
  tableOrViewFormatter: tableOrViewFormatterSchema.default(
    () => (name: string, operation: string) =>
      `${toCamelCase([name, operation])}`,
  ),
});

export type TransformTypesOptions = z.infer<typeof transformTypesOptionsSchema>;

interface TypeCollector {
  typeStrings: string[];
  enumNames: {
    name: string;
    formattedName: string;
    schema?: string;
  }[];
  compositeTypeNames: { name: string; formattedName: string }[];
}

interface NodeProcessorContext {
  sourceFile: ts.SourceFile;
  schema: string;
  collector: TypeCollector;
  processDependencies: boolean;
  formatters: {
    tableOrView: (name: string, operation: string) => string;
    enum: (name: string) => string;
    compositeType: (name: string) => string;
    function: (name: string, type: string) => string;
  };
}

export const transformTypes = z
  .function()
  .args(transformTypesOptionsSchema)
  .returns(z.string())
  .implement((opts) => {
    const sourceFile = ts.createSourceFile(
      'index.ts',
      opts.sourceText,
      ts.ScriptTarget.Latest,
    );

    const collector: TypeCollector = {
      typeStrings: [],
      enumNames: [],
      compositeTypeNames: [],
    };

    const context: NodeProcessorContext = {
      sourceFile,
      schema: opts.schema,
      collector,
      processDependencies: opts.processDependencies ?? true,
      formatters: {
        tableOrView: opts.tableOrViewFormatter,
        enum: opts.enumFormatter,
        compositeType: opts.compositeTypeFormatter,
        function: opts.functionFormatter,
      },
    };

    processSourceFile(sourceFile, context);
    return formatOutput(collector, opts.schema);
  });

function processSourceFile(
  sourceFile: ts.SourceFile,
  context: NodeProcessorContext,
) {
  sourceFile.forEachChild((node) => {
    if (isDatabaseDefinition(node)) {
      processDatabaseNode(node, context);
    } else if (isJsonTypeAlias(node)) {
      context.collector.typeStrings.push(node.getText(context.sourceFile));
    }
  });
}

function isDatabaseDefinition(
  node: ts.Node,
): node is ts.TypeAliasDeclaration | ts.InterfaceDeclaration {
  return (
    (ts.isTypeAliasDeclaration(node) &&
      ts.isTypeLiteralNode(node.type) &&
      node.name.text === 'Database') ||
    (ts.isInterfaceDeclaration(node) && node.name.text === 'Database')
  );
}

function isJsonTypeAlias(node: ts.Node): node is ts.TypeAliasDeclaration {
  return ts.isTypeAliasDeclaration(node) && node.name.text === 'Json';
}

function processDatabaseNode(
  node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
  context: NodeProcessorContext,
) {
  if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
    node.type.members.forEach((member: ts.TypeElement) =>
      processSchemaNode(member, context),
    );
  } else {
    node.forEachChild((child) => processSchemaNode(child, context));
  }
}

function processSchemaNode(node: ts.Node, context: NodeProcessorContext) {
  if (!ts.isPropertySignature(node)) return;

  const schemaName = getNodeName(node);

  if (schemaName === context.schema) {
    node.forEachChild((child) => {
      if (ts.isTypeLiteralNode(child)) {
        processSchemaMembers(child, context);
      }
    });
  }

  if (context.processDependencies) {
    node.forEachChild((child) => {
      if (ts.isTypeLiteralNode(child)) {
        processOtherSchemaDependencies(child, schemaName, context);
      }
    });
  }
}

function processOtherSchemaDependencies(
  node: ts.TypeLiteralNode,
  schemaName: string,
  context: NodeProcessorContext,
) {
  if (schemaName === context.schema) return;

  node.forEachChild((member) => {
    if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name)) {
      return;
    }

    if (member.name.text === 'Enums') {
      visitTypeLiteralChild(member, (typeLiteral) => {
        typeLiteral.forEachChild((enumNode) => {
          if (!ts.isPropertySignature(enumNode)) return;

          const enumName = getNodeName(enumNode);
          enumNode.forEachChild((typeNode) => {
            if (
              ts.isUnionTypeNode(typeNode) ||
              ts.isLiteralTypeNode(typeNode)
            ) {
              const formattedName = `${schemaName}_${context.formatters.enum(enumName)}`;
              const typeText = typeNode.getText(context.sourceFile);

              if (isTypeReferenced(context.sourceFile, schemaName, enumName)) {
                context.collector.typeStrings.push(
                  `export type ${formattedName} = ${typeText}`,
                );
                context.collector.enumNames.push({
                  name: enumName,
                  formattedName,
                  schema: schemaName,
                });
              }
            }
          });
        });
      });
    }
  });
}

function isTypeReferenced(
  sourceFile: ts.SourceFile,
  schema: string,
  typeName: string,
): boolean {
  let isReferenced = false;

  function visit(node: ts.Node) {
    if (isReferenced) return;

    if (ts.isPropertySignature(node) && node.type) {
      const typeRef = node.type.getText(sourceFile);
      if (
        typeRef?.includes(`Database['${schema}']['Enums']['${typeName}']`) ||
        typeRef?.includes(`Database["${schema}"]["Enums"]["${typeName}"]`)
      ) {
        isReferenced = true;
        return;
      }
    }

    node.forEachChild(visit);
  }

  sourceFile.forEachChild(visit);
  return isReferenced;
}

function processSchemaMembers(
  node: ts.TypeLiteralNode,
  context: NodeProcessorContext,
) {
  node.forEachChild((member) => {
    if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name))
      return;

    switch (member.name.text) {
      case 'Tables':
      case 'Views':
        processTablesOrViews(member, context);
        break;
      case 'Enums':
        processEnums(member, context);
        break;
      case 'CompositeTypes':
        processCompositeTypes(member, context);
        break;
      case 'Functions':
        processFunctions(member, context);
        break;
    }
  });
}

function processTablesOrViews(
  node: ts.PropertySignature,
  context: NodeProcessorContext,
) {
  visitTypeLiteralChild(node, (typeLiteral) => {
    typeLiteral.forEachChild((tableNode) => {
      if (!ts.isPropertySignature(tableNode)) return;

      const tableName = getNodeName(tableNode);
      logger.debug(`Processing table/view: ${tableName}`, '📝');
      processTableOperations(tableNode, tableName, context);
    });
  });
}

function processTableOperations(
  node: ts.PropertySignature,
  tableName: string,
  context: NodeProcessorContext,
) {
  visitTypeLiteralChild(node, (typeLiteral) => {
    typeLiteral.forEachChild((operationNode) => {
      if (!ts.isPropertySignature(operationNode)) return;

      const operation = getNodeName(operationNode);
      if (!operation) return;

      operationNode.forEachChild((typeNode) => {
        if (ts.isTypeLiteralNode(typeNode) || ts.isTupleTypeNode(typeNode)) {
          const formattedName = `${toCamelCase([context.schema, tableName, operation])}Schema`;
          logger.debug(
            `Generated type name for table operation: ${formattedName}`,
            '🏷️',
          );
          const typeText = typeNode.getText(context.sourceFile);
          context.collector.typeStrings.push(
            `export type ${formattedName} = ${typeText}`,
          );
        }
      });
    });
  });
}

function processEnums(
  node: ts.PropertySignature,
  context: NodeProcessorContext,
) {
  visitTypeLiteralChild(node, (typeLiteral) => {
    typeLiteral.forEachChild((enumNode) => {
      const enumName = getNodeName(enumNode);
      logger.debug(`Processing enum: ${enumName}`, '🔤');
      if (!ts.isPropertySignature(enumNode)) return;

      enumNode.forEachChild((typeNode) => {
        if (ts.isUnionTypeNode(typeNode) || ts.isLiteralTypeNode(typeNode)) {
          const formattedName = `${toCamelCase([context.schema, enumName])}`;
          logger.debug(`Generated enum type name: ${formattedName}`, '🏷️');
          const typeText = typeNode.getText(context.sourceFile);
          context.collector.typeStrings.push(
            `export type ${formattedName} = ${typeText}`,
          );
          context.collector.enumNames.push({
            name: enumName,
            formattedName,
            schema: context.schema,
          });
        }
      });
    });
  });
}

function processCompositeTypes(
  node: ts.PropertySignature,
  context: NodeProcessorContext,
) {
  visitTypeLiteralChild(node, (typeLiteral) => {
    typeLiteral.forEachChild((typeNode) => {
      const typeName = getNodeName(typeNode);
      if (!ts.isPropertySignature(typeNode)) return;

      typeNode.forEachChild((n) => {
        if (ts.isTypeLiteralNode(n)) {
          const formattedName = context.formatters.compositeType(typeName);
          const typeText = n.getText(context.sourceFile);
          context.collector.typeStrings.push(
            `export type ${formattedName} = ${typeText}`,
          );
          context.collector.compositeTypeNames.push({
            name: typeName,
            formattedName,
          });
        }
      });
    });
  });
}

function processFunctions(
  node: ts.PropertySignature,
  context: NodeProcessorContext,
) {
  visitTypeLiteralChild(node, (typeLiteral) => {
    typeLiteral.forEachChild((funcNode) => {
      if (!ts.isPropertySignature(funcNode)) return;

      const funcName = getNodeName(funcNode);
      processFunctionDefinition(funcNode, funcName, context);
    });
  });
}

function processFunctionDefinition(
  node: ts.PropertySignature,
  funcName: string,
  context: NodeProcessorContext,
) {
  visitTypeLiteralChild(node, (typeLiteral) => {
    typeLiteral.forEachChild((memberNode) => {
      if (!ts.isPropertySignature(memberNode)) return;

      const memberName = getNodeName(memberNode);
      if (memberName === 'Args' || memberName === 'Returns') {
        memberNode.forEachChild((typeNode) => {
          const formattedName = `${toCamelCase([context.schema, funcName, memberName])}Schema`;

          logger.debug(
            `Processing function ${funcName}.${memberName}, node kind: ${ts.SyntaxKind[typeNode.kind]}`,
          );

          let typeText = typeNode.getText(context.sourceFile);
          logger.debug(`Original type text: ${typeText}`);

          if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
            typeText = 'boolean';
            logger.debug(`Converted to boolean type`);
          } else if (typeText.includes('Record<PropertyKey, never>')) {
            typeText = '{}';
          } else if (ts.isTypeReferenceNode(typeNode)) {
            typeText = typeNode.getText(context.sourceFile);
          } else if (ts.isTypeLiteralNode(typeNode)) {
            typeText = typeNode.getText(context.sourceFile);
          }

          logger.debug(`Final type text: ${typeText}`);

          if (memberName === 'Returns') {
            context.collector.typeStrings.push(
              `export type ${formattedName} = ${typeText};`,
            );
          } else {
            context.collector.typeStrings.push(
              `export type ${formattedName} = ${typeText};`,
            );
          }
        });
      }
    });
  });
}

function visitTypeLiteralChild(
  node: ts.Node,
  visitor: (typeLiteral: ts.TypeLiteralNode) => void,
) {
  node.forEachChild((child) => {
    if (ts.isTypeLiteralNode(child)) {
      visitor(child);
    }
  });
}

function formatOutput(collector: TypeCollector, schema: string): string {
  const enumTypes = collector.typeStrings
    .filter((s) => s.includes(' = "'))
    .join(';\n');

  const otherTypes = collector.typeStrings
    .filter((s) => !s.includes(' = "'))
    .filter((s) => !s.includes('Record<number'))
    .join(';\n');

  let parsedTypes = `${enumTypes}\n\n${otherTypes}`;

  for (const {
    name,
    formattedName,
    schema: enumSchema,
  } of collector.enumNames) {
    parsedTypes = replaceTypeReferences(
      parsedTypes,
      enumSchema || schema,
      'Enums',
      name,
      formattedName,
    );
  }

  for (const { name, formattedName } of collector.compositeTypeNames) {
    parsedTypes = replaceTypeReferences(
      parsedTypes,
      schema,
      'CompositeTypes',
      name,
      formattedName,
    );
  }

  return parsedTypes;
}

function replaceTypeReferences(
  types: string,
  schema: string,
  category: string,
  name: string,
  formattedName: string,
): string {
  const doubleQuotePattern = `Database["${schema}"]["${category}"]["${name}"]`;
  const singleQuotePattern = `Database['${schema}']['${category}']['${name}']`;

  return types
    .split('\n')
    .map((line) => {
      if (line.includes(doubleQuotePattern)) {
        return line.replace(doubleQuotePattern, formattedName);
      }
      if (line.includes(singleQuotePattern)) {
        return line.replace(singleQuotePattern, formattedName);
      }
      return line;
    })
    .join('\n');
}

function toCamelCase(parts: string[]): string {
  if (parts[0] === 'schema') {
    const schemaPrefix = `schema${parts[1].toUpperCase()}`;
    const rest = parts
      .slice(2)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    return schemaPrefix + rest;
  }

  return parts
    .map((word, index) => {
      const subParts = word.split('_');
      return subParts
        .map((subWord, subIndex) =>
          index === 0 && subIndex === 0
            ? subWord.toLowerCase()
            : subWord.charAt(0).toUpperCase() + subWord.slice(1).toLowerCase(),
        )
        .join('');
    })
    .join('');
}

export function getAllSchemas(sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  const schemas: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'Database') {
      logger.debug('Found Database type alias');

      if (ts.isTypeLiteralNode(node.type)) {
        node.type.members.forEach((member) => {
          if (ts.isPropertySignature(member) && member.name) {
            const schemaName = member.name.getText(sourceFile);
            logger.debug(`Found schema: ${schemaName}`);
            schemas.push(schemaName);
          } else {
            logger.debug(
              `Skipped member: ${ts.SyntaxKind[member.kind]} (not a property signature or no name)`,
            );
          }
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  logger.debug(`Found ${schemas.length} schemas: ${schemas.join(', ')}`);

  if (schemas.length === 0) {
    logger.debug('Source text preview:', sourceText.slice(0, 500));
  }

  return schemas;
}
