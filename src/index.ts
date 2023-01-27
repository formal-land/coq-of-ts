import * as ts from 'typescript';
import doc from 'prettier/doc';
import * as Error from './error';
import * as Global from './global';
import * as Program from './program';

function compile(fileName: string, options: ts.CompilerOptions): Program.t {
  let program = ts.createProgram([fileName], options);
  const sourceFile = program.getSourceFile(fileName);
  Global.state.typeChecker = program.getTypeChecker();

  if (!sourceFile) {
    console.log('Cannot compile');
    return [];
  }

  const output = Program.compile(sourceFile);

  console.error(Error.errors);

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
