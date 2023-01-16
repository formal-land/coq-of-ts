import * as ts from "typescript";
import * as Error from "./error";
import * as Identifier from "./identifier";
import * as Typ from "./typ";

type LeftValueRecordField = {
  name: string,
  variable: string,
};

type LeftValue =
  | {
      type: "Record",
      fields: LeftValueRecordField[],
      record: string,
    }
  | {
      type: "Variable",
      name: string,
    };

export type FunArgument = {
  name: string,
  typ: Typ.t | null,
}

type Fun = {
  arguments: FunArgument[],
  body: t,
  returnTyp: Typ.t | null,
  typParameters: string[],
};

type RecordField = {
  name: string,
  value: t,
};

export type t =
| {
  type: "ArrayExpression",
  elements: t[],
}
| {
  type: "BinaryExpression",
  left: t,
  operator: string,
  right: t,
}
| {
  type: "CallExpression",
  arguments: t[],
  callee: t,
}
| {
  type: "ConditionalExpression",
  alternate: t,
  consequent: t,
  test: t,
}
| {
  type: "Constant",
  value: boolean | number | string,
}
| {
  type: "EnumDestruct",
  branches: {body: t, names: string[]}[],
  defaultBranch: t | null,
  discriminant: t,
  typName: string,
}
| {
  type: "EnumInstance",
  instance: string,
  typName: string,
}
| {
  type: "FunctionExpression",
  // eslint-disable-next-line no-use-before-define
  value: Fun,
}
| {
  type: "Let",
  body: t,
  lval: LeftValue,
  value: t,
}
| {
  type: "RecordInstance",
  // eslint-disable-next-line no-use-before-define
  fields: RecordField[],
  record: string,
}
| {
  type: "RecordProjection",
  field: string,
  object: t,
  record: string,
}
| {
  type: "RecordUpdate",
  field: string,
  object: t,
  record: string,
  update: t,
}
| {
  type: "SumDestruct",
  branches: {body: t, fields: LeftValueRecordField[], name: string}[],
  defaultBranch: t | null,
  discriminant: t,
  sum: string,
}
| {
  type: "SumInstance",
  constr: string,
  // eslint-disable-next-line no-use-before-define
  fields: RecordField[],
  sum: string,
}
| {
  type: "TypeCastExpression",
  expression: t,
  typeAnnotation: Typ.t,
}
| {
  type: "UnaryExpression",
  argument: t,
  operator: string,
}
| {
  type: "Variable",
  name: string,
};

export const tt: t = {
  type: "Variable",
  name: "tt",
};

function getLeftValueRecordFields(
  pattern: ts.ObjectBindingPattern,
): LeftValueRecordField[] {
  const defaultErrorValue = {name: "name", variable: "variable"};

  return pattern.elements.map(property => {
    if (property.dotDotDotToken) {
      return Error.raise(
        defaultErrorValue,
        property,
        "Unhandled rest element for record destructuring",
      );
    }

    if (ts.isBindingName(property.name)) {
      const name = Identifier.compile(property.name);

      return {
        name : property.propertyName ? Identifier.compile(property.propertyName) : name,
        variable: name,
      };
    }

    return Error.raise(
      defaultErrorValue,
      property.name,
      "Expected an identifier",
    );
  });
}

type FieldsDestructuringFromHeadStatement = {
  fields: LeftValueRecordField[],
  trailingStatements: ts.Statement[],
};

function getFieldsDestructuringFromHeadStatement(
  statements: ts.Statement[],
  discriminantName: string,
): FieldsDestructuringFromHeadStatement {
  const noDestructuring = {fields: [], trailingStatements: statements};

  if (statements.length === 0) {
    return noDestructuring;
  }

  const headStatement = statements[0];

  if (ts.isBlock(headStatement)) {
    return getFieldsDestructuringFromHeadStatement(
      [...headStatement.statements,
      ...statements.slice(1),], discriminantName);
  }

  if (ts.isVariableStatement(headStatement)) {
    if (headStatement.declarationList.declarations.length !== 1) {
      return Error.raise(noDestructuring, headStatement, "Expected a single definition of variable",);
    }

    const declaration = headStatement.declarationList.declarations[0];

    if (declaration.initializer) {
      if (ts.isIdentifier(declaration.initializer)) {
        const name = Identifier.compile(declaration.initializer);

        if (name === discriminantName) {
          if (ts.isObjectBindingPattern(declaration.name)) {
            const fields = ;
          }

          return Error.raise(
            noDestructuring,
            declaration.name,
            "Expected an object pattern to destructure a sum type",
          );
        }
      }
    }

    return noDestructuring;
  }
  switch (headStatement.type) {
      if (headStatement.declarations.length !== 1) {
        return yield* Monad.raise<FieldsDestructuringFromHeadStatement>(
          headStatement,
          "Expected a single definition of variable",
        );
      }

      const declaration = headStatement.declarations[0];

      if (declaration.init) {
        switch (declaration.init.type) {
          case "Identifier": {
            const {name} = declaration.init;

            if (name === discriminantName) {
              switch (declaration.id.type) {
                case "ObjectPattern": {
                  const fields = yield* getLeftValueRecordFields(
                    declaration.id,
                  );

                  return {
                    fields,
                    trailingStatements: statements.slice(1),
                  };
                }
                default:
                  return yield* Monad.raise<FieldsDestructuringFromHeadStatement>(
                    declaration.id,
                    "Expected an object pattern to destructure a sum type",
                  );
              }
            }

            return noDestructuring;
          }
          default:
            return noDestructuring;
        }
      }

      return noDestructuring;
    }
    default:
      return noDestructuring;
  }
}

function compileStatements(statements: ts.Statement[]): t {
  if (statements.length === 0) {
    return tt;
  }

  const statement = statements[0];

  if (ts.isBlock(statement)) {
    return compileStatements([
      ...statement.statements,
      ...statements.slice(1),
    ]);
  }

  if (ts.isReturnStatement(statement)) {
    return statement.expression ? compile(statement.expression) : tt;
  }

  if (ts.isSwitchStatement(statement)) {
    // Destructuring of sum type
    if (ts.isPropertyAccessExpression(statement.expression)) {
      const field = Identifier.compile(statement.expression.name);

      if (field !== "type") {
        return Error.raise(
          compileStatements(statements.slice(1)),
          statement,
          "Expected an access on the `type` field to destructure a sum type"
        );
      }

      const {expression} = statement.expression;

      if (ts.isIdentifier(expression)) {
        const discriminantName = Identifier.compile(expression);
        const branches = statement.caseBlock.clauses.map(clause => {
          if (ts.isCaseClause(clause)) {
            clause
          }
          const {
            fields,
            trailingStatements,
          } = yield* getFieldsDestructuringFromHeadStatement(
            consequent,
            discriminantName,
          );

          return {
            body: yield* compileStatements(trailingStatements),
            fields,
            name: yield* getStringOfStringLiteral(test),
          };
        });
        const defaultCase =
          cases.find(
            branch =>
              !branch.test && !isEmptyDefaultBranch(branch.consequent),
          ) || null;

        return {
          type: "SumDestruct",
          branches,
          defaultBranch:
            defaultCase &&
            (yield* compileStatements(defaultCase.consequent)),
          discriminant: yield* compile(expression),
          sum: firstTrailingComment,
        };
      }

      return Error.raise(
        compileStatements(statements.slice(1)),
        expression,
        "Expected a switch on an identifier to destructure a sum type",
      );
    }

    // Otherwise, destructuring of enum type
  }

  switch (statement.kind) {
    case ts.SyntaxKind.SwitchStatement: {
      const statement = statement as ts.SwitchStatement;
      const {expression, caseBlock} = statement;
      // const firstTrailingComment =
      //   discriminant.trailingComments &&
      //   discriminant.trailingComments.length !== 0
      //     ? discriminant.trailingComments[0].value.trim()
      //     : raise<string>(
      //         discriminant,
      //         "Expected a trailing comment with the type name on which we discriminate",
      //       );

      switch (expression.kind) {
        // Destructuring of sum type.
        case ts.SyntaxKind.PropertyAccessExpression: {
          const field = Typ.getObjectKeyName(discriminant.property);

          if (field !== "type") {
            return raise<t>(
              discriminant.property,
              "Expected an access on the `type` field to destructure a sum type",
            );
          }

          const expression = discriminant.object;

          switch (expression.type) {
            case "Identifier": {
              const discriminantName = expression.name;
              const branches = Monad.filterMap(cases, function*({
                consequent,
                test,
              }) {
                if (!test) {
                  return null;
                }

                const {
                  fields,
                  trailingStatements,
                } = getFieldsDestructuringFromHeadStatement(
                  consequent,
                  discriminantName,
                );

                return {
                  body: compileStatements(trailingStatements),
                  fields,
                  name: getStringOfStringLiteral(test),
                };
              });
              const defaultCase =
                cases.find(
                  branch =>
                    !branch.test && !isEmptyDefaultBranch(branch.consequent),
                ) || null;

              return {
                type: "SumDestruct",
                branches,
                defaultBranch:
                  defaultCase &&
                  (compileStatements(defaultCase.consequent)),
                discriminant: compileExpression(expression),
                sum: firstTrailingComment,
              };
            }
            default:
              return raise<t>(
                expression,
                "Expected a switch on an identifier to destructure a sum type",
              );
          }
        }
        // Destructuring of enum.
        default: {
          const {accumulatedNames, branches} = Monad.reduce<
            {
              accumulatedNames: string[],
              branches: {body: t, names: string[]}[],
            },
            BabelAst.SwitchCase,
          >(cases, {accumulatedNames: [], branches: []}, function*(
            {accumulatedNames, branches},
            branch,
          ) {
            if (!branch.test) {
              return {accumulatedNames: [], branches};
            }

            const name = getStringOfStringLiteral(branch.test);
            const currentAccumulatedNames = [...accumulatedNames, name];

            if (branch.consequent.length === 0) {
              return {accumulatedNames: currentAccumulatedNames, branches};
            }

            return {
              accumulatedNames: [],
              branches: [
                ...branches,
                {
                  body: compileStatements(branch.consequent),
                  names: currentAccumulatedNames,
                },
              ],
            };
          });
          const defaultCase =
            cases.find(
              branch =>
                !branch.test && !isEmptyDefaultBranch(branch.consequent),
            ) || null;

          return {
            type: "EnumDestruct",
            branches: [
              ...branches,
              ...(accumulatedNames.length !== 0
                ? [{body: tt, names: accumulatedNames}]
                : []),
            ],
            defaultBranch:
              defaultCase && (compileStatements(defaultCase.consequent)),
            discriminant: compileExpression(discriminant),
            typName: firstTrailingComment,
          };
        }
      }
    }
    case "VariableDeclaration": {
      if (statement.declarations.length !== 1) {
        return raise<t>(
          statement,
          "Expected exactly one definition",
        );
      }

      const declaration = statement.declarations[0];

      return {
        type: "Let",
        body: compileStatements(statements.slice(1)),
        lval: compileLVal(declaration.id),
        value: declaration.init
          ? compileExpression(declaration.init)
          : raise<t>(
              declaration,
              "Expected a definition with a value",
            ),
      };
    }
    default:
      return Monad.raiseUnhandled<t>(statement);
  }
}

export function compile(expression: ts.Expression): t {
  throw "TODO";
}
