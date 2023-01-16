import * as ts from "typescript";
import * as Global from "./global";
import * as TopLevelStatement from "./top-level-statement";

function compile(fileName: string, options: ts.CompilerOptions): TopLevelStatement.t[] {
  let program = ts.createProgram([fileName], options);
  const sourceFile = program.getSourceFile(fileName);
  Global.state.typeChecker = program.getTypeChecker();

  if (!sourceFile) {
    console.log("Cannot compile");
    return [];
  }

  const output: TopLevelStatement.t[] = []

  ts.forEachChild(sourceFile, untypedNode => {
    console.log(untypedNode.kind);
    switch (untypedNode.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
        const node = untypedNode as ts.FunctionDeclaration;
        output.push({
          type: "Definition",
          arguments: node.parameters.map(parameter => ({name: (parameter.name as ts.Identifier).text, typ: null})),
          body: "TODO",
          name: node.name?.escapedText || "anonymousFunction",
          returnTyp: null,
          typParameters: [],
        });
    }
  });

  return output;

  // let emitResult = program.emit();

  // let allDiagnostics = ts
  //   .getPreEmitDiagnostics(program)
  //   .concat(emitResult.diagnostics);

  // allDiagnostics.forEach(diagnostic => {
  //   if (diagnostic.file) {
  //     let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
  //     let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  //     console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
  //   } else {
  //     console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  //   }
  // });

  // let exitCode = emitResult.emitSkipped ? 1 : 0;
  // console.log(`Process exiting with code '${exitCode}'.`);
  // process.exit(exitCode);
}

console.log(JSON.stringify(
  compile(process.argv[2], {
    noEmitOnError: true,
    noImplicitAny: true,
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS
  }), null, 2
));
