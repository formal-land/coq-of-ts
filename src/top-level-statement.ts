import * as ts from 'typescript';
import * as Doc from './doc';
import * as Error from './error';
import * as Expression from './expression';
import * as Identifier from './identifier';
import * as Typ from './typ';
import * as TypDefinition from './typ-definition';

export type t =
  | {
      type: 'Definition';
      arguments: Expression.FunArgument[];
      body: Expression.t;
      name: string;
      returnTyp: Typ.t | null;
      typParameters: string[];
    }
  | {
      type: 'TypeDefinition';
      name: string;
      typDefinition: TypDefinition.t;
    };

export function compile(node: ts.Statement): t[] {
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.map((declaration) => ({
      type: 'Definition',
      arguments: [],
      body: Expression.compile(declaration.initializer!, declaration.type),
      name: Identifier.compile(declaration.name),
      returnTyp: null,
      typParameters: [],
    }));
  }

  if (ts.isFunctionDeclaration(node)) {
    return [
      {
        type: 'Definition',
        arguments: node.parameters.map((parameter) => ({
          name: Identifier.compile(parameter.name),
          typ: parameter.type ? Typ.compile(parameter.type) : null,
        })),
        body: Expression.compileStatements(node.body!.statements.slice()),
        name: node.name ? Identifier.compile(node.name) : 'anonymousFunction',
        returnTyp: null,
        typParameters: node.typeParameters ? node.typeParameters.map((param) => Identifier.compile(param.name)) : [],
      },
    ];
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return [
      {
        type: 'TypeDefinition',
        name: Identifier.compile(node.name),
        typDefinition: TypDefinition.compile(node.type),
      },
    ];
  }

  return Error.raise([], node, 'Expected a top-level statement');
}

export function print(declaration: t): Doc.t {
  switch (declaration.type) {
    case 'Definition':
      return Doc.group([
        Doc.group(['Definition', Doc.line, declaration.name]),
        Doc.indent([
          ...(declaration.typParameters.length !== 0
            ? [Doc.line, Typ.printImplicitTyps(declaration.typParameters)]
            : []),
          Expression.printFunArguments(declaration.arguments),
          Doc.line,
          Typ.printReturnTyp(declaration.returnTyp, ':='),
          Doc.hardline,
          Expression.print(false, declaration.body),
          '.',
        ]),
      ]);
    case 'TypeDefinition':
      return TypDefinition.print(declaration.name, declaration.typDefinition);
  }
}
