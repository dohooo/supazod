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
