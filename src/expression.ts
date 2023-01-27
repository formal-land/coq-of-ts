import * as ts from 'typescript';
import * as Doc from './doc';
import * as Error from './error';
import * as Identifier from './identifier';
import * as Typ from './typ';

type LeftValueRecordField = {
  name: string;
  variable: string;
};

type LeftValue =
  | {
      type: 'Record';
      fields: LeftValueRecordField[];
      record: string;
    }
  | {
      type: 'Variable';
      name: string;
    };

export type FunArgument = {
  name: string;
  typ: Typ.t | null;
};

type Fun = {
  arguments: FunArgument[];
  body: t;
  returnTyp: Typ.t | null;
  typParameters: string[];
};

type RecordField = {
  name: string;
  value: t;
};

export type t =
  | {
      type: 'ArrayExpression';
      elements: t[];
    }
  | {
      type: 'BinaryExpression';
      left: t;
      operator: string;
      right: t;
    }
  | {
      type: 'CallExpression';
      arguments: t[];
      callee: t;
    }
  | {
      type: 'ConditionalExpression';
      alternate: t;
      consequent: t;
      test: t;
    }
  | {
      type: 'Constant';
      value: boolean | number | string;
    }
  | {
      type: 'EnumDestruct';
      branches: { body: t; names: string[] }[];
      defaultBranch: t | null;
      discriminant: t;
      typName: string;
    }
  | {
      type: 'EnumInstance';
      instance: string;
      typName: string;
    }
  | {
      type: 'FunctionExpression';
      // eslint-disable-next-line no-use-before-define
      value: Fun;
    }
  | {
      type: 'Let';
      body: t;
      lval: LeftValue;
      value: t;
    }
  | {
      type: 'RecordInstance';
      // eslint-disable-next-line no-use-before-define
      fields: RecordField[];
      record: string;
    }
  | {
      type: 'RecordProjection';
      field: string;
      object: t;
      record: string;
    }
  | {
      type: 'RecordUpdate';
      field: string;
      object: t;
      record: string;
      update: t;
    }
  | {
      type: 'SumDestruct';
      branches: { body: t; fields: LeftValueRecordField[]; name: string }[];
      defaultBranch: t | null;
      discriminant: t;
      sum: string;
    }
  | {
      type: 'SumInstance';
      constr: string;
      // eslint-disable-next-line no-use-before-define
      fields: RecordField[];
      sum: string;
    }
  | {
      type: 'TypeCastExpression';
      expression: t;
      typeAnnotation: Typ.t;
    }
  | {
      type: 'UnaryExpression';
      argument: t;
      operator: string;
    }
  | {
      type: 'Variable';
      name: string;
    };

export const tt: t = {
  type: 'Variable',
  name: 'tt',
};

function getLeftValueRecordFields(pattern: ts.ObjectBindingPattern): LeftValueRecordField[] {
  const defaultErrorValue = { name: 'name', variable: 'variable' };

  return pattern.elements.map((property) => {
    if (property.dotDotDotToken) {
      return Error.raise(defaultErrorValue, property, 'Unhandled rest element for record destructuring');
    }

    if (ts.isBindingName(property.name)) {
      const name = Identifier.compile(property.name);

      return {
        name: property.propertyName ? Identifier.compile(property.propertyName) : name,
        variable: name,
      };
    }

    return Error.raise(defaultErrorValue, property.name, 'Expected an identifier');
  });
}

function compileLVal(lval: ts.BindingName): LeftValue {
  if (ts.isArrayBindingPattern(lval)) {
    return Error.raise({ type: 'Variable', name: 'array' }, lval, 'Unhandled array patterns');
  }

  if (ts.isIdentifier(lval)) {
    return {
      type: 'Variable',
      name: Identifier.compile(lval),
    };
  }

  // Object pattern case
  const typName = Typ.getTypName(lval);
  const fields = getLeftValueRecordFields(lval);

  return {
    type: 'Record',
    fields,
    record: typName,
  };
}

function getStringOfStringLiteral(expression: ts.Expression): string {
  if (ts.isStringLiteral(expression)) {
    return expression.text;
  }

  return Error.raise('expected_string', expression, 'Expected a string literal');
}

type FieldsDestructuringFromHeadStatement = {
  fields: LeftValueRecordField[];
  trailingStatements: ts.Statement[];
};

function getFieldsDestructuringFromHeadStatement(
  statements: ts.Statement[],
  discriminantName: string,
): FieldsDestructuringFromHeadStatement {
  const noDestructuring = { fields: [], trailingStatements: statements };

  const headStatement = statements[0];

  if (headStatement === undefined) {
    return noDestructuring;
  }

  if (ts.isBlock(headStatement)) {
    return getFieldsDestructuringFromHeadStatement(
      [...headStatement.statements, ...statements.slice(1)],
      discriminantName,
    );
  }

  if (ts.isVariableStatement(headStatement)) {
    const declaration = headStatement.declarationList.declarations[0];

    if (declaration === undefined) {
      return Error.raise(noDestructuring, headStatement, 'Expected at least one definition');
    }

    if (headStatement.declarationList.declarations.length >= 2) {
      return Error.raise(noDestructuring, headStatement, 'Expected a single definition of variable');
    }

    if (declaration.initializer) {
      if (ts.isIdentifier(declaration.initializer)) {
        const name = Identifier.compile(declaration.initializer);

        if (name === discriminantName) {
          if (ts.isObjectBindingPattern(declaration.name)) {
            const fields = getLeftValueRecordFields(declaration.name);

            return {
              fields,
              trailingStatements: statements.slice(1),
            };
          }

          return Error.raise(noDestructuring, declaration.name, 'Expected an object pattern to destructure a sum type');
        }
      }
    }

    return noDestructuring;
  }

  return noDestructuring;
}

export function compileStatements(statements: ts.Statement[]): t {
  const statement = statements[0];

  if (statement === undefined) {
    return tt;
  }

  if (ts.isBlock(statement)) {
    return compileStatements([...statement.statements, ...statements.slice(1)]);
  }

  if (ts.isReturnStatement(statement)) {
    return statement.expression ? compile(statement.expression) : tt;
  }

  if (ts.isSwitchStatement(statement)) {
    // Destructuring of sum type
    if (ts.isPropertyAccessExpression(statement.expression)) {
      const field = Identifier.compile(statement.expression.name);

      if (field !== 'type') {
        return Error.raise(
          compileStatements(statements.slice(1)),
          statement,
          'Expected an access on the `type` field to destructure a sum type',
        );
      }

      const { expression } = statement.expression;

      if (ts.isIdentifier(expression)) {
        const discriminantName = Identifier.compile(expression);
        const { clauses } = statement.caseBlock;
        const caseClauses = clauses.flatMap((clause) => {
          if (ts.isCaseClause(clause)) {
            const { fields, trailingStatements } = getFieldsDestructuringFromHeadStatement(
              clause.statements.slice(),
              discriminantName,
            );

            return [
              {
                body: compileStatements(trailingStatements),
                fields,
                name: getStringOfStringLiteral(clause.expression),
              },
            ];
          }

          // "default" clause
          return [];
        });

        const defaultClauses = clauses.flatMap((clause) => (ts.isDefaultClause(clause) ? [clause] : []));

        return {
          type: 'SumDestruct',
          branches: caseClauses,
          defaultBranch:
            defaultClauses[0] !== undefined ? compileStatements(defaultClauses[0].statements.slice()) : null,
          discriminant: compile(expression),
          sum: Typ.getTypName(expression),
        };
      }

      return Error.raise(
        compileStatements(statements.slice(1)),
        expression,
        'Expected a switch on an identifier to destructure a sum type',
      );
    }

    // Otherwise, destructuring of enum type
    const { clauses } = statement.caseBlock;
    const { accumulatedNames, caseClauses } = clauses.reduce(
      (
        {
          accumulatedNames,
          caseClauses,
        }: {
          accumulatedNames: string[];
          caseClauses: { body: t; names: string[] }[];
        },
        clause,
      ) => {
        if (ts.isDefaultClause(clause)) {
          return { accumulatedNames: [], caseClauses };
        }

        const name = getStringOfStringLiteral(clause.expression);
        const currentAccumulatedNames = [...accumulatedNames, name];

        if (clause.statements.length === 0) {
          return { accumulatedNames: currentAccumulatedNames, caseClauses };
        }

        return {
          accumulatedNames: [],
          caseClauses: [
            ...caseClauses,
            {
              body: compileStatements(clause.statements.slice()),
              names: currentAccumulatedNames,
            },
          ],
        };
      },
      { accumulatedNames: [], caseClauses: [] },
    );
    const defaultClauses = clauses.flatMap((clause) => (ts.isDefaultClause(clause) ? [clause] : []));

    return {
      type: 'EnumDestruct',
      branches: [...caseClauses, ...(accumulatedNames.length !== 0 ? [{ body: tt, names: accumulatedNames }] : [])],
      defaultBranch: defaultClauses[0] !== undefined ? compileStatements(defaultClauses[0].statements.slice()) : null,
      discriminant: compile(statement.expression),
      typName: Typ.getTypName(statement.expression),
    };
  }

  if (ts.isVariableStatement(statement)) {
    const { declarations } = statement.declarationList;
    const declaration = declarations[0];

    if (declaration === undefined) {
      return Error.raise(compileStatements(statements.slice(1)), statement, 'Expected at least one definition');
    }

    if (declarations.length >= 2) {
      return Error.raise(compileStatements(statements.slice(1)), statement, 'Expected exactly one definition');
    }

    return {
      type: 'Let',
      body: compileStatements(statements.slice(1)),
      lval: compileLVal(declaration.name),
      value: declaration.initializer
        ? compile(declaration.initializer)
        : Error.raise(tt, declaration, 'Expected a definition with a value'),
    };
  }

  return Error.raise(compileStatements(statements.slice(1)), statement, 'Unhandled statement');
}

export function compileFun(fun: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction): Fun {
  const returnTyp = null; /* TODO */

  return {
    arguments: fun.parameters.map((parameter) => ({
      name: Identifier.compile(parameter.name),
      typ: parameter.type ? Typ.compile(parameter.type) : null,
    })),
    body: ts.isBlock(fun.body!) ? compileStatements(fun.body!.statements.slice()) : compile(fun.body!),
    returnTyp: returnTyp && Typ.compile(returnTyp),
    typParameters: fun.typeParameters
      ? fun.typeParameters.map((typParameter) => Identifier.compile(typParameter.name))
      : [],
  };
}

function compilePrefixUnaryOperator(operator: ts.PrefixUnaryOperator): string {
  switch (operator) {
    case ts.SyntaxKind.PlusPlusToken:
      return '++';
    case ts.SyntaxKind.MinusMinusToken:
      return '--';
    case ts.SyntaxKind.ExclamationToken:
      return '!';
    case ts.SyntaxKind.TildeToken:
      return '~';
    case ts.SyntaxKind.PlusToken:
      return '+';
    case ts.SyntaxKind.MinusToken:
      return '-';
  }
}

export function compile(expression: ts.Expression, expectedAsTyp?: ts.TypeNode): t {
  if (ts.isArrayLiteralExpression(expression)) {
    return {
      type: 'ArrayExpression',
      elements: expression.elements.map((element) => compile(element)),
    };
  }

  if (ts.isArrowFunction(expression)) {
    return {
      type: 'FunctionExpression',
      value: compileFun(expression),
    };
  }

  if (ts.isAsExpression(expression)) {
    return compile(expression.expression, expression.type);
  }

  if (ts.isBinaryExpression(expression)) {
    return {
      type: 'BinaryExpression',
      left: compile(expression.left),
      operator: expression.operatorToken.getText(),
      right: compile(expression.right),
    };
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return {
      type: 'Constant',
      value: false,
    };
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return {
      type: 'Constant',
      value: true,
    };
  }

  if (ts.isCallExpression(expression)) {
    return {
      type: 'CallExpression',
      arguments: expression.arguments.map((argument) => compile(argument)),
      callee: compile(expression.expression),
    };
  }

  if (ts.isConditionalExpression(expression)) {
    return {
      type: 'ConditionalExpression',
      alternate: compile(expression.whenFalse),
      consequent: compile(expression.whenTrue),
      test: compile(expression.condition),
    };
  }

  if (ts.isFunctionExpression(expression)) {
    return {
      type: 'FunctionExpression',
      value: compileFun(expression),
    };
  }

  if (ts.isIdentifier(expression)) {
    return {
      type: 'Variable',
      name: expression.text,
    };
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return {
      type: 'RecordProjection',
      field: Identifier.compile(expression.name),
      object: compile(expression.expression),
      record: Typ.getTypName(expression.expression),
    };
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return tt;
  }

  if (ts.isNumericLiteral(expression)) {
    return {
      type: 'Constant',
      value: Number(expression.text),
    };
  }

  if (ts.isObjectLiteralExpression(expression)) {
    if (expression.properties.length === 0) {
      return tt;
    }

    const [names, fields, spreads] = expression.properties.reduce(
      ([names, fields, spreads], property) => {
        if (ts.isPropertyAssignment(property)) {
          const name = Identifier.compile(property.name);

          if (name === 'type') {
            return [[...names, getStringOfStringLiteral(property.initializer)], fields, spreads];
          }

          return [
            names,
            [
              ...fields,
              {
                name,
                value: compile(property.initializer),
              },
            ],
            spreads,
          ];
        }

        if (ts.isShorthandPropertyAssignment(property)) {
          const name = Identifier.compile(property.name);
          const field: RecordField = {
            name,
            value: { type: 'Variable', name },
          };

          return [names, [...fields, field], spreads];
        }

        if (ts.isSpreadAssignment(property)) {
          if (names.length !== 0 || fields.length !== 0) {
            return Error.raise(
              [names, fields, spreads],
              property,
              'Spread element must be the first element of the object',
            );
          }

          return [names, fields, [...spreads, compile(property.expression)]];
        }

        return Error.raise([names, fields, spreads], property, 'Unhandled kind of property');
      },
      [[], [], []] as [string[], RecordField[], t[]],
    );

    const typName = expectedAsTyp ? Typ.getTypName(expectedAsTyp) : Typ.getTypName(expression);

    if (names.length >= 2) {
      return Error.raise(tt, expression, 'Multiple type names');
    }

    if (spreads.length >= 2) {
      return Error.raise(tt, expression, 'Multiple spreads');
    }

    if (names[0] === undefined) {
      if (spreads[0] === undefined) {
        return { type: 'RecordInstance', record: typName, fields };
      }

      return fields.reduce(
        (accumulator, field) => ({
          type: 'RecordUpdate',
          field: field.name,
          object: accumulator,
          record: typName,
          update: field.value,
        }),
        spreads[0],
      );
    }

    if (spreads.length === 0) {
      return {
        type: 'SumInstance',
        constr: names[0],
        fields,
        sum: typName,
      };
    }

    return Error.raise(tt, expression, 'Spread elements in sum types are not handled');
  }

  if (ts.isStringLiteral(expression)) {
    return {
      type: 'Constant',
      value: expression.text,
    };
  }

  if (ts.isPrefixUnaryExpression(expression)) {
    return {
      type: 'UnaryExpression',
      argument: compile(expression.operand),
      operator: compilePrefixUnaryOperator(expression.operator),
    };
  }

  return Error.raise(tt, expression, 'Unhandled kind of expression');
}

export function printFunArguments(funArguments: FunArgument[]): Doc.t {
  return funArguments.map(({ name, typ }) => [
    Doc.line,
    typ ? Doc.group(['(', name, Doc.line, ':', Doc.line, Typ.print(false, typ), ')']) : name,
  ]);
}

function printCallExpression(needParens: boolean, callee: Doc.t, args: Doc.t[]): Doc.t {
  return Doc.paren(needParens, Doc.group(Doc.indent(Doc.join(Doc.line, [callee, ...args]))));
}

export function printRecordInstance(record: string | null, fields: { name: string; value: Doc.t }[]): Doc.t {
  return Doc.group([
    '{|',
    Doc.indent(
      fields.map(({ name, value }) => [
        Doc.line,
        Doc.group([
          Doc.group([record ? `${record}.${name}` : name, Doc.line, ':=']),
          Doc.indent([Doc.line, value, ';']),
        ]),
      ]),
    ),
    Doc.line,
    '|}',
  ]);
}

function printLeftValue(lval: LeftValue, withQuote: boolean): Doc.t {
  switch (lval.type) {
    case 'Record':
      if (lval.fields.length === 0) {
        return ['_'];
      }

      return [
        ...(withQuote ? ["'"] : []),
        printRecordInstance(
          lval.record,
          lval.fields.map(({ name, variable }) => ({ name, value: variable })),
        ),
      ];
    case 'Variable':
      return [lval.name];
  }
}

function printMatch(
  discriminant: Doc.t,
  branches: {
    body: Doc.t;
    patterns: {
      fields: LeftValueRecordField[] | null;
      name: string;
    }[];
  }[],
  defaultBranch: Doc.t | null,
  typName: string,
): Doc.t {
  return Doc.group([
    Doc.group(['match', Doc.line, discriminant, Doc.line, 'with']),
    Doc.hardline,
    ...branches.map(({ body, patterns }) =>
      Doc.group([
        Doc.join(
          Doc.line,
          patterns.map(({ fields, name }) =>
            Doc.group([
              '|',
              Doc.line,
              `${typName}.${name}`,
              ...(fields
                ? [
                    Doc.line,
                    printLeftValue(
                      {
                        type: 'Record',
                        fields,
                        record: `${typName}.${name}`,
                      },
                      false,
                    ),
                  ]
                : []),
            ]),
          ),
        ),
        Doc.line,
        '=>',
        Doc.indent([Doc.line, body]),
        Doc.hardline,
      ]),
    ),
    ...(defaultBranch
      ? [
          Doc.group([
            Doc.group(['|', Doc.line, '_', Doc.line, '=>']),
            Doc.indent([Doc.line, defaultBranch]),
            Doc.hardline,
          ]),
        ]
      : []),
    'end',
  ]);
}

export function print(needParens: boolean, expression: t): Doc.t {
  switch (expression.type) {
    case 'ArrayExpression':
      if (expression.elements.length === 0) {
        return '[]';
      }

      return Doc.group([
        '[',
        Doc.indent([
          Doc.line,
          Doc.join(
            [';', Doc.line],
            expression.elements.map((element) => print(false, element)),
          ),
        ]),
        Doc.line,
        ']',
      ]);
    case 'BinaryExpression':
      return Doc.paren(
        needParens,
        Doc.group(
          Doc.join(Doc.line, [print(true, expression.left), expression.operator, print(true, expression.right)]),
        ),
      );
    case 'CallExpression':
      return printCallExpression(
        needParens,
        print(true, expression.callee),
        expression.arguments.map((argument) => print(true, argument)),
      );
    case 'ConditionalExpression': {
      return Doc.paren(
        needParens,
        Doc.group([
          Doc.group(['if', Doc.line, print(false, expression.test), Doc.line, 'then']),
          Doc.indent([Doc.line, print(false, expression.consequent)]),
          Doc.line,
          'else',
          Doc.indent([Doc.line, print(false, expression.alternate)]),
        ]),
      );
    }
    case 'Constant':
      return JSON.stringify(expression.value);
    case 'EnumDestruct': {
      const { branches, defaultBranch, discriminant, typName } = expression;

      return printMatch(
        print(false, discriminant),
        branches.map(({ body, names }) => ({
          body: print(false, body),
          patterns: names.map((name) => ({ fields: null, name })),
        })),
        defaultBranch && print(false, defaultBranch),
        typName,
      );
    }
    case 'EnumInstance':
      return `${expression.typName}.${expression.instance}`;
    case 'FunctionExpression':
      return Doc.paren(
        needParens,
        Doc.group([
          Doc.group([
            'fun',
            Doc.indent([
              ...(expression.value.typParameters.length !== 0
                ? [Doc.line, Typ.printImplicitTyps(expression.value.typParameters)]
                : []),
              printFunArguments(expression.value.arguments),
            ]),
            Doc.line,
            '=>',
          ]),
          Doc.indent([Doc.line, print(false, expression.value.body)]),
        ]),
      );
    case 'Let':
      return Doc.group([
        Doc.group(['let', Doc.line, printLeftValue(expression.lval, true), Doc.line, ':=']),
        Doc.indent([Doc.line, print(false, expression.value)]),
        Doc.line,
        'in',
        Doc.hardline,
        print(false, expression.body),
      ]);
    case 'RecordInstance':
      return printRecordInstance(
        expression.record,
        expression.fields.map(({ name, value }) => ({
          name,
          value: print(false, value),
        })),
      );
    case 'RecordProjection':
      return Doc.group([
        print(true, expression.object),
        Doc.softline,
        '.(',
        Doc.indent(Doc.group([Doc.softline, expression.record, '.', expression.field])),
        Doc.softline,
        ')',
      ]);
    case 'RecordUpdate':
      return printCallExpression(needParens, `${expression.record}.set_${expression.field}`, [
        print(true, expression.object),
        print(true, expression.update),
      ]);
    case 'SumDestruct': {
      const { branches, defaultBranch, discriminant, sum } = expression;

      return printMatch(
        print(false, discriminant),
        branches.map(({ body, fields, name }) => ({
          body: print(false, body),
          patterns: [{ fields, name }],
        })),
        defaultBranch && print(false, defaultBranch),
        sum,
      );
    }
    case 'SumInstance': {
      const name = `${expression.sum}.${expression.constr}`;

      return Doc.paren(
        needParens,
        Doc.group([
          name,
          Doc.line,
          ...(expression.fields.length !== 0
            ? [
                printRecordInstance(
                  name,
                  expression.fields.map(({ name, value }) => ({
                    name,
                    value: print(false, value),
                  })),
                ),
              ]
            : ['tt']),
        ]),
      );
    }
    case 'TypeCastExpression':
      return Doc.group([
        '(',
        Doc.softline,
        print(true, expression.expression),
        Doc.line,
        ':',
        Doc.line,
        Typ.print(false, expression.typeAnnotation),
        Doc.softline,
        ')',
      ]);
    case 'UnaryExpression':
      return Doc.paren(needParens, Doc.group([expression.operator, Doc.line, print(true, expression.argument)]));
    case 'Variable':
      return expression.name;
  }
}
