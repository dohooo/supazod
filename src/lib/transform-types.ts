import ts from 'typescript';
import { z } from 'zod';

import { getNodeName } from './get-node-name';

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
  schema: z.string().default('public'),
  enumFormatter: enumFormatterSchema.default(() => (name: string) => name),
  compositeTypeFormatter: compositeTypeFormatterSchema.default(
    () => (name: string) => name,
  ),
  functionFormatter: functionFormatterSchema.default(
    () => (name: string, type: string) => `${name}${type}`,
  ),
  tableOrViewFormatter: tableOrViewFormatterSchema.default(
    () => (name: string, operation: string) => `${name}${operation}`,
  ),
});

export type TransformTypesOptions = z.infer<typeof transformTypesOptionsSchema>;

function getBuiltinTypeDefinition(typeName: string): string {
  if (typeName === 'PropertyKey') {
    return `type ${typeName} = string | number | never`;
  }
  return '';
}

interface TypeCollector {
  typeStrings: string[];
  enumNames: Array<{ name: string; formattedName: string }>;
  compositeTypeNames: Array<{ name: string; formattedName: string }>;
}

interface NodeProcessorContext {
  sourceFile: ts.SourceFile;
  schema: string;
  collector: TypeCollector;
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
  if (schemaName !== context.schema) return;

  node.forEachChild((child) => {
    if (ts.isTypeLiteralNode(child)) {
      processSchemaMembers(child, context);
    }
  });
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
          const formattedName = context.formatters.tableOrView(
            tableName,
            operation,
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
      if (!ts.isPropertySignature(enumNode)) return;

      enumNode.forEachChild((typeNode) => {
        if (ts.isUnionTypeNode(typeNode) || ts.isLiteralTypeNode(typeNode)) {
          const formattedName = context.formatters.enum(enumName);
          const typeText = typeNode.getText(context.sourceFile);
          context.collector.typeStrings.push(
            `export type ${formattedName} = ${typeText}`,
          );
          context.collector.enumNames.push({
            name: enumName,
            formattedName,
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

      const functionName = getNodeName(funcNode);
      funcNode.forEachChild((n) => {
        if (ts.isTypeLiteralNode(n)) {
          n.forEachChild((argNode) => {
            if (ts.isPropertySignature(argNode)) {
              const argType = getNodeName(argNode);
              argNode.forEachChild((typeNode) => {
                if (ts.isTypeReferenceNode(typeNode)) {
                  const formattedName = context.formatters.function(
                    functionName,
                    argType,
                  );
                  const typeText = typeNode.getText(context.sourceFile);
                  context.collector.typeStrings.push(
                    `export type ${formattedName} = ${typeText}`,
                  );
                }
              });
            }
          });
        }
      });
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
  // First process enums since they might be dependencies for other types
  const enumTypes = collector.typeStrings
    .filter((s) => s.includes(' = "'))
    .join(';\n');

  // Then process other types
  const otherTypes = collector.typeStrings
    .filter((s) => !s.includes(' = "'))
    .filter((s) => !s.includes('Record<number'))
    .join(';\n');

  let parsedTypes = `${enumTypes}\n\n${otherTypes}`;

  // Add builtin types
  const builtinTypes = ['PropertyKey'];
  for (const typeName of builtinTypes) {
    parsedTypes = `${getBuiltinTypeDefinition(typeName)}\n${parsedTypes}`;
  }

  // Replace enum references
  for (const { name, formattedName } of collector.enumNames) {
    parsedTypes = replaceTypeReferences(
      parsedTypes,
      schema,
      'Enums',
      name,
      formattedName,
    );
  }

  // Replace composite type references
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
  return types
    .replaceAll(
      `Database["${schema}"]["${category}"]["${name}"]`,
      formattedName,
    )
    .replaceAll(
      `Database['${schema}']['${category}']['${name}']`,
      formattedName,
    );
}
