import { cp } from "fs";
import * as ts from "typescript";
import * as Error from "./error";
import * as Global from "./global";
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

function compileLVal(lval: ts.BindingName): LeftValue {
  if (ts.isArrayBindingPattern(lval)) {
    return Error.raise({type: "Variable", name: "array"}, lval, "Unhandled array patterns");
  }

  if (ts.isIdentifier(lval)) {
    return {
      type: "Variable",
      name: Identifier.compile(lval),
    };
  }

  // Object pattern case
  const typName = "TODO: find the type of the record";
  const fields = getLeftValueRecordFields(lval);

  return {
    type: "Record",
    fields,
    record: typName,
  };
}

function getStringOfStringLiteral(
  expression: ts.Expression,
): string {
  if (ts.isStringLiteral(expression)) {
    return expression.text;
  }

  return Error.raise("expected_string", expression, "Expected a string literal");
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
            const fields = getLeftValueRecordFields(declaration.name);

            return {
              fields,
              trailingStatements: statements.slice(1),
            }
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

  return noDestructuring;
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
        const sum = Global.state.typeChecker!.getTypeAtLocation(expression);
        const {clauses} = statement.caseBlock;
        const caseClauses = clauses.flatMap(clause => {
          if (ts.isCaseClause(clause)) {
            const {fields, trailingStatements} =
              getFieldsDestructuringFromHeadStatement(clause.statements.slice(), discriminantName);

            return [{
              body: compileStatements(trailingStatements),
              fields,
              name: getStringOfStringLiteral(clause.expression),
            }];
          }

          // "default" clause
          return [];
        });

        const defaultClauses =
          clauses.flatMap(
            clause =>
              ts.isDefaultClause(clause) ? [clause] : []
          );

        return {
          type: "SumDestruct",
          branches: caseClauses,
          defaultBranch:
            defaultClauses.length >= 1 ?
              compileStatements(defaultClauses[0].statements.slice()) :
              null,
          discriminant: compile(expression),
          sum: `TODO: convert from ${sum}`,
        };
      }

      return Error.raise(
        compileStatements(statements.slice(1)),
        expression,
        "Expected a switch on an identifier to destructure a sum type",
      );
    }

    // Otherwise, destructuring of enum type
    const {clauses} = statement.caseBlock;
    const {accumulatedNames, caseClauses} = clauses.reduce(
      (
        {accumulatedNames, caseClauses}:
        {
          accumulatedNames: string[],
          caseClauses: {body: t, names: string[]}[],
        }
      , clause) => {
      if (ts.isDefaultClause(clause)) {
        return {accumulatedNames: [], caseClauses};
      }

      const name = getStringOfStringLiteral(clause.expression);
      const currentAccumulatedNames = [...accumulatedNames, name];

      if (clause.statements.length === 0) {
        return {accumulatedNames: currentAccumulatedNames, caseClauses};
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
    {accumulatedNames: [], caseClauses: []});
    const defaultClauses = clauses.flatMap(clause =>
      ts.isDefaultClause(clause) ? [clause] : []);

    return {
      type: "EnumDestruct",
      branches: [
        ...caseClauses,
        ...(accumulatedNames.length !== 0
          ? [{body: tt, names: accumulatedNames}]
          : []),
      ],
      defaultBranch:
        defaultClauses.length >= 1 ?
          compileStatements(defaultClauses[0].statements.slice()) :
          null,
          discriminant: compile(statement.expression),
      typName: "TODO find type",
    };
  }

  if (ts.isVariableStatement(statement)) {
    const {declarations} = statement.declarationList;

    if (declarations.length !== 1) {
      return Error.raise(
        compileStatements(statements.slice(1)),
        statement,
        "Expected exactly one definition",
      );
    }

    const declaration = declarations[0];

    return {
      type: "Let",
      body: compileStatements(statements.slice(1)),
      lval: compileLVal(declaration.name),
      value: declaration.initializer
        ? compile(declaration.initializer)
        : Error.raise(
            tt,
            declaration,
            "Expected a definition with a value",
          ),
    };
  }

  return Error.raise(
    compileStatements(statements.slice(1)),
    statement,
    "Unhandled statement",
  );
}

export function* compileFun(
  fun:
    | BabelAst.FunctionDeclaration
    | BabelAst.FunctionExpression
    | BabelAst.ArrowFunctionExpression,
): Monad.t<Fun> {
  const returnTyp = fun.returnType ? fun.returnType.typeAnnotation : null;

  return {
    arguments: yield* Monad.all(
      fun.params.map(function*(param) {
        switch (param.type) {
          case "Identifier":
            return {
              name: param.name,
              typ: param.typeAnnotation
                ? yield* Typ.compile(param.typeAnnotation.typeAnnotation)
                : null,
            };
          default:
            return yield* Monad.raise<FunArgument>(
              param,
              "Expected simple identifier as function parameter",
            );
        }
      }),
    ),
    body:
      fun.body.type === "BlockStatement"
        ? yield* compileStatements(fun.body.body)
        : yield* compile(fun.body),
    returnTyp: returnTyp && (yield* Typ.compile(returnTyp)),
    typParameters: fun.typeParameters
      ? Util.filterMap(fun.typeParameters.params, param => param.name)
      : [],
  };
}

export function* compile(expression: ts.Expression): t {
  switch (expression.type) {
    case "ArrayExpression":
      return {
        type: "ArrayExpression",
        elements: expression.elements
          ? yield* Monad.all(
              expression.elements.map(function*(element) {
                if (!element) {
                  return yield* Monad.raise<t>(
                    expression,
                    "Expected non-empty elements in the array",
                  );
                }

                if (element.type === "SpreadElement") {
                  return yield* Monad.raise<t>(
                    element,
                    "Spreads in arrays are not handled",
                  );
                }

                return yield* compile(element);
              }),
            )
          : /* istanbul ignore next */
            yield* Monad.raise<t[]>(
              expression,
              "Unexpected empty array expression",
            ),
      };
    case "ArrowFunctionExpression":
      return {
        type: "FunctionExpression",
        value: yield* compileFun(expression),
      };
    case "BinaryExpression":
      return {
        type: "BinaryExpression",
        left: yield* compile(expression.left),
        operator: expression.operator,
        right: yield* compile(expression.right),
      };
    case "BooleanLiteral":
      return {
        type: "Constant",
        value: expression.value,
      };
    case "CallExpression":
      return {
        type: "CallExpression",
        arguments: yield* Monad.all(
          expression.arguments.map(function*(argument) {
            switch (argument.type) {
              case "ArgumentPlaceholder":
                return yield* Monad.raise<t>(
                  argument,
                  "Unhandled partial application",
                );
              case "SpreadElement":
                return yield* Monad.raise<t>(
                  argument,
                  "Unhandled spread parameters",
                );
              default:
                return yield* compile(argument);
            }
          }),
        ),
        callee: yield* compile(expression.callee),
      };
    case "ConditionalExpression":
      return {
        type: "ConditionalExpression",
        alternate: yield* compile(expression.alternate),
        consequent: yield* compile(expression.consequent),
        test: yield* compile(expression.test),
      };
    case "FunctionExpression":
      return {
        type: "FunctionExpression",
        value: yield* compileFun(expression),
      };
    case "Identifier":
      return {
        type: "Variable",
        name: expression.name,
      };
    case "LogicalExpression":
      return {
        type: "BinaryExpression",
        left: yield* compile(expression.left),
        operator: expression.operator,
        right: yield* compile(expression.right),
      };
    case "MemberExpression": {
      switch (expression.object.type) {
        case "TypeCastExpression": {
          const {expression: object, typeAnnotation} = expression.object;
          const record = yield* Typ.compileIdentifier(
            typeAnnotation.typeAnnotation,
          );
          const field = yield* Typ.getObjectKeyName(expression.property);

          return {
            type: "RecordProjection",
            field,
            object: yield* compile(object),
            record,
          };
        }
        default:
          return yield* Monad.raise<t>(
            expression.object,
            "Expected a type annotation on this object to access a member",
          );
      }
    }
    case "NullLiteral":
      return tt;
    case "NumericLiteral":
      return {
        type: "Constant",
        value: expression.value,
      };
    case "ObjectExpression": {
      if (expression.properties.length === 0) {
        return tt;
      }

      return yield* Monad.raise<t>(
        expression,
        "Unhandled object expression without type annotation",
      );
    }
    /* istanbul ignore next */
    case "ParenthesizedExpression":
      return yield* compile(expression.expression);
    case "StringLiteral":
      return {
        type: "Constant",
        value: expression.value,
      };
    case "TypeCastExpression": {
      switch (expression.expression.type) {
        case "ObjectExpression": {
          const [names, fields, spreads] = yield* Monad.reduce(
            expression.expression.properties,
            ([[], [], []]: [string[], RecordField[], t[]]),
            function*([names, fields, spreads], property) {
              switch (property.type) {
                case "ObjectMethod":
                  return yield* Monad.raise<[*, *, *]>(
                    property,
                    "Object methods not handled",
                  );
                case "ObjectProperty": {
                  if (property.computed) {
                    return yield* Monad.raise<[*, *, *]>(
                      property.key,
                      "Unhandled computed property name",
                    );
                  }

                  const name = yield* getObjectPropertyName(property);
                  // Because this seems to be the case here and for
                  // performance reasons for the type checking.
                  const value: BabelAst.Expression = (property.value: any);

                  if (name === "type") {
                    return [
                      [...names, yield* getStringOfStringLiteral(value)],
                      fields,
                      spreads,
                    ];
                  }

                  return [
                    names,
                    [...fields, {name, value: yield* compile(value)}],
                    spreads,
                  ];
                }
                case "SpreadElement":
                  if (names.length !== 0 || fields.length !== 0) {
                    yield* Monad.raise<[*, *, *]>(
                      property,
                      "Spread element must be the first element of the object",
                    );
                  }

                  return [
                    names,
                    fields,
                    [...spreads, yield* compile(property.argument)],
                  ];
                /* istanbul ignore next */
                default:
                  return property;
              }
            },
          );
          const typName = yield* Typ.compileIdentifier(
            expression.typeAnnotation.typeAnnotation,
          );

          if (names.length >= 2) {
            return yield* Monad.raise<t>(
              expression.expression,
              "Ambiguous multiple `type` fields",
            );
          }
          if (spreads.length >= 2) {
            return yield* Monad.raise<t>(
              expression.expression,
              `At most one spread element per object is handled, found ${spreads.length}`,
            );
          }

          if (names.length === 0) {
            if (spreads.length === 0) {
              return {type: "RecordInstance", record: typName, fields};
            }

            return fields.reduce(
              (accumulator, field) => ({
                type: "RecordUpdate",
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
              type: "SumInstance",
              constr: names[0],
              fields,
              sum: typName,
            };
          }

          return yield* Monad.raise<t>(
            expression.expression,
            "Spread elements in sum types are not handled",
          );
        }
        case "StringLiteral": {
          const {value} = expression.expression;

          return {
            type: "EnumInstance",
            instance: value,
            typName: yield* Typ.compileIdentifier(
              expression.typeAnnotation.typeAnnotation,
            ),
          };
        }
        default:
          return {
            type: "TypeCastExpression",
            expression: yield* compile(expression.expression),
            typeAnnotation: yield* Typ.compile(
              expression.typeAnnotation.typeAnnotation,
            ),
          };
      }
    }
    case "UnaryExpression":
      return {
        type: "UnaryExpression",
        argument: yield* compile(expression.argument),
        operator: expression.operator,
      };
    default:
      return yield* Monad.raiseUnhandled<t>(expression);
  }
}
