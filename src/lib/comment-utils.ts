import ts from 'typescript';

export function replaceGeneratedComment(sourceText: string): string {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  let firstImport: ts.Node | undefined;

  const findFirstImport = (node: ts.Node) => {
    if (!firstImport && ts.isImportDeclaration(node)) {
      firstImport = node;
      return;
    }
    ts.forEachChild(node, findFirstImport);
  };

  ts.forEachChild(sourceFile, findFirstImport);

  if (!firstImport) {
    return sourceText;
  }

  const importStart = firstImport.getStart();

  const newComment = '// Generated by Supazod\n';

  const restContent = sourceText.slice(importStart);

  return newComment + restContent;
}