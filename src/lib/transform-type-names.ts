import ts from 'typescript';

export function transformTypeNames(
  sourceText: string,
  transformer: (name: string) => string,
) {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  const transformerFactory: ts.TransformerFactory<ts.SourceFile> = (
    context,
  ) => {
    return (file) => {
      const visitor = (node: ts.Node): ts.Node => {
        if (ts.isTypeAliasDeclaration(node)) {
          const originalName = node.name.text;
          const transformedName = transformer(originalName);

          const newName = ts.factory.createIdentifier(transformedName);

          return ts.factory.updateTypeAliasDeclaration(
            node,
            node.modifiers,
            newName,
            node.typeParameters,
            node.type,
          );
        }
        return ts.visitEachChild(node, visitor, context);
      };

      return ts.visitNode(file, visitor) as ts.SourceFile;
    };
  };

  const result = ts.transform(sourceFile, [transformerFactory]);
  const transformedSourceFile = result.transformed[0];

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const output = printer.printFile(transformedSourceFile);

  result.dispose();

  return output;
}

// New transformer: strips schema prefix and overwrites on conflict
export function transformTypeNamesStripSchema(sourceText: string) {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  // Helper to strip schema prefix (PascalCase, e.g., 'PublicUser' -> 'User')
  function stripSchemaPrefix(name: string): string {
    // Remove leading capitalized word (schema) if followed by another capital
    return name.replace(/^[A-Z][a-z0-9]+(?=[A-Z])/, '');
  }

  // Collect type alias declarations, keeping only the latest for each name
  const typeMap = new Map<string, ts.TypeAliasDeclaration>();

  sourceFile.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node)) {
      const newName = stripSchemaPrefix(node.name.text);
      // Always overwrite: latest wins
      typeMap.set(
        newName,
        ts.factory.updateTypeAliasDeclaration(
          node,
          node.modifiers,
          ts.factory.createIdentifier(newName),
          node.typeParameters,
          node.type,
        ),
      );
    }
  });

  // Print all unique type aliases (latest wins)
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const output = Array.from(typeMap.values())
    .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile))
    .join('\n\n');

  return output;
}
