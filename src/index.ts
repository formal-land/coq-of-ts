import * as ts from 'typescript';
import doc from 'prettier/doc';
import * as Error from './error';
import * as Global from './global';
import * as Program from './program';

function compile(fileName: string, options: ts.CompilerOptions): Program.t {
  let program = ts.createProgram([fileName], options);
  const sourceFile = program.getSourceFile(fileName);
  Global.initTypeChecker(program.getTypeChecker());

  if (!sourceFile) {
    console.log('Cannot compile');
    return [];
  }

  const output = Program.compile(sourceFile);

  Error.errors.forEach((error) =>
    console.error(
      error.message,
      error.node.getSourceFile().fileName,
      error.node.getStart(),
      error.node.getFullText(),
      error.node,
    ),
  );

  return output;
}

if (process.argv[2]) {
  console.log(
    doc.printer.printDocToString(
      Program.print(
        compile(process.argv[2], {
          noEmitOnError: true,
          noImplicitAny: true,
          target: ts.ScriptTarget.ES5,
          module: ts.ModuleKind.CommonJS,
        }),
        true,
      ),
      {
        printWidth: 80,
        tabWidth: 2,
        useTabs: false,
      },
    ).formatted,
  );
} else {
  console.log('Please provide a file name');
}
