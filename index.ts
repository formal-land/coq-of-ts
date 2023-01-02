import { resourceUsage } from "process";
import * as ts from "typescript";

type Typ =
| {
    type: "Function",
    params: Typ[],
    returnTyp: Typ,
    typParams: string[],
  }
| {
  type: "Implicit",
}
| {
    type: "Tuple",
    params: Typ[],
  }
| {
    type: "Variable",
    name: string,
    params: Typ[],
  };

type Constructor = {name: string, fields: {name: string, typ: Typ}[]};

type TypDefinition = | {
  type: "Enum",
  names: string[],
}
| {
  type: "Record",
  fields: {name: string, typ: Typ}[],
}
| {
  type: "Sum",
  constructors: Constructor[],
}
| {
  type: "Synonym",
  typ: Typ,
};

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

type FunArgument = {
  name: string,
  typ: Typ | null,
}

type Fun = {
  arguments: FunArgument[],
  body: Expression,
  returnTyp: Typ | null,
  typParameters: string[],
};

type RecordField = {
  name: string,
  value: Expression,
};

type Expression =
| {
  type: "ArrayExpression",
  elements: Expression[],
}
| {
  type: "BinaryExpression",
  left: Expression,
  operator: string,
  right: Expression,
}
| {
  type: "CallExpression",
  arguments: Expression[],
  callee: Expression,
}
| {
  type: "ConditionalExpression",
  alternate: Expression,
  consequent: Expression,
  test: Expression,
}
| {
  type: "Constant",
  value: boolean | number | string,
}
| {
  type: "EnumDestruct",
  branches: {body: Expression, names: string[]}[],
  defaultBranch: Expression | null,
  discriminant: Expression,
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
  body: Expression,
  lval: LeftValue,
  value: Expression,
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
  object: Expression,
  record: string,
}
| {
  type: "RecordUpdate",
  field: string,
  object: Expression,
  record: string,
  update: Expression,
}
| {
  type: "SumDestruct",
  branches: {body: Expression, fields: LeftValueRecordField[], name: string}[],
  defaultBranch: Expression | null,
  discriminant: Expression,
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
  expression: Expression,
  typeAnnotation: Typ,
}
| {
  type: "UnaryExpression",
  argument: Expression,
  operator: string,
}
| {
  type: "Variable",
  name: string,
};

type TopLevelStatement =
  | {
      type: "Definition",
      arguments: FunArgument[],
      body: Expression,
      name: string,
      returnTyp: Typ | null,
      typParameters: string[],
    }
  | {
      type: "TypeDefinition",
      name: string,
      typDefinition: TypDefinition,
    };

const unit: Typ = {
  type: "Variable",
  name: "unit",
  params: [],
}

const tt: Expression = {
  type: "Variable",
  name: "tt",
};

const errors: {message: string, node: ts.Node}[] = [];

function raise<A>(defaultValue: A, node, message) {
  errors.push({message, node});
  return defaultValue;
}

function getTextOfIdentifier(node: ts.Node): string {
  if (ts.isIdentifier(node)) {
    return node.text;
  }

  return raise("unkown", node, "Expected an identifier");
}

type PlainTypOrRest =
  | {
      type: "PlainTyp",
      typ: Typ,
    }
  | {
      type: "Rest",
      typ: ts.TypeLiteralNode | ts.UnionTypeNode | ts.StringLiteral
    };

export function compileIfPlainTyp(
  typ: ts.TypeNode,
): PlainTypOrRest {
  if (typ.kind === ts.SyntaxKind.AnyKeyword) {
    return raise(
      {type: "PlainTyp", typ: {type: "Implicit"}},
      typ,
      "The type `any` is not handled",
    );
  }

  if (ts.isArrayTypeNode(typ)) {
    return {
      type: "PlainTyp",
      typ: {
        type: "Variable",
        name: "list",
        params: [compileTyp(typ.elementType)],
      },
    };
  }

  if (typ.kind === ts.SyntaxKind.BooleanKeyword) {
    return {
      type: "PlainTyp",
      typ: {
        type: "Variable",
        name: "bool",
        params: [],
      },
    };
  }

  if (typ.kind === ts.SyntaxKind.NeverKeyword) {
    return {
      type: "PlainTyp",
      typ: {
        type: "Variable",
        name: "Empty_set",
        params: [],
      },
    };
  }

  if (ts.isFunctionTypeNode(typ)) {
    return {
      type: "PlainTyp",
      typ: {
        type: "Function",
        params:
          typ.parameters.map(({type}) => type ? compileTyp(type) : {type: "Implicit"}),
        returnTyp: compileTyp(typ.type),
        typParams: typ.typeParameters
          ? typ.typeParameters.map(parameter => getTextOfIdentifier(parameter.name))
          : [],
      },
    };
  }

  if (ts.isTypeReferenceNode(typ)) {
    return {
      type: "PlainTyp",
      typ: {
        type: "Variable",
        name: getTextOfIdentifier(typ.typeName),
        params: [],
      },
    };
  }

  if (typ.kind === ts.SyntaxKind.NullKeyword) {
    return {
      type: "PlainTyp",
      typ: unit,
    };
  }

  if (typ.kind === ts.SyntaxKind.NumberKeyword) {
    return {
      type: "PlainTyp",
      typ: {
        type: "Variable",
        name: "Z",
        params: [],
      },
    };
  }

  if (ts.isTypeLiteralNode(typ)) {
    if (typ.members.length === 0) {
      return {
        type: "PlainTyp",
        typ: unit,
      };
    }

    return {
      type: "Rest",
      typ,
    };
  }

  if (ts.isStringLiteral(typ)) {
    return {
      type: "Rest",
      typ,
    };
  }

  if (typ.kind === ts.SyntaxKind.StringKeyword) {
    return {
      type: "PlainTyp",
      typ: {
        type: "Variable",
        name: "string",
        params: [],
      },
    };
  }

  if (ts.isThisTypeNode(typ)) {
    return raise(
      {type: "PlainTyp", typ: unit},
      typ,
      "The type `this` is not handled",
    );
  }

  if (ts.isTupleTypeNode(typ)) {
    if (typ.elements.length === 1) {
      return raise(
        {type: "PlainTyp", typ: compileTyp(typ.elements[0])},
        typ,
        "Tuple types with exactly one element are not handled",
      );
    }

    return {
      type: "PlainTyp",
      typ: {
        type: "Tuple",
        params: typ.elements.map(typ => compileTyp(typ)),
      },
    };
  }

  if (ts.isTypeQueryNode(typ)) {
    return raise(
      {type: "PlainTyp", typ: {type: "Implicit"}},
      typ,
      "Extracting the type of values with `typeof` is not handled",
    );
  }

  if (ts.isUnionTypeNode(typ)) {
    return {
        type: "Rest",
        typ,
      };
  }

  if (typ.kind === ts.SyntaxKind.VoidKeyword) {
    return {
      type: "PlainTyp",
      typ: unit,
    };
  }

  return raise(
    {type: "PlainTyp", typ: {type: "Implicit"}},
    typ,
    "Unhandled kind of type",
  );
}

function compileTyp(typ: ts.TypeNode): Typ {
  const compiledTyp = compileIfPlainTyp(typ);

  switch (compiledTyp.type) {
    case "PlainTyp":
      return compiledTyp.typ;
    case "Rest":
      if (ts.isTypeLiteralNode(compiledTyp.typ)) {
        return raise(
          unit,
          compiledTyp.typ,
          "This kind of object type is not handled outside of type definitions",
        );
      }
      if (ts.isStringLiteral(compiledTyp.typ)) {
        return raise(
          unit,
          compiledTyp.typ,
          "String literal types are not handled outside of type definitions",
        );
      }
      if (ts.isUnionTypeNode(compiledTyp.typ)) {
        return raise(
          unit,
          compiledTyp.typ,
          "Union types are not handled outside of type definitions",
        );
      }
      /* istanbul ignore next */
      return compiledTyp.typ;
    /* istanbul ignore next */
    default:
      return compiledTyp;
  }
}

function getStringOfLiteralType(typ: ts.TypeNode): string {
  if (ts.isLiteralTypeNode(typ) && ts.isStringLiteral(typ.literal)) {
    return typ.literal.text;
  }

  return raise("Unknown", typ, "Expected a string literal type")
}

function compileStringEnum(typs: ReadonlyArray<ts.TypeNode>): TypDefinition {
  const names =
    typs.map(typ => getStringOfLiteralType(typ));

  return {
    type: "Enum",
    names,
  };
}

function compileSumType(typs: ReadonlyArray<ts.TypeNode>): TypDefinition {
  const constructors =
    typs.map(typ => {
      if (!ts.isTypeLiteralNode(typ)) {
        return raise({name: "NonObject", fields: []}, typ, "Expected an Object type");
      }

      const [nameProperties, fieldProperties] = typ.members.reduce(
        ([nameProperties, fieldProperties], property) => {
          if (ts.isPropertySignature(property)) {
            if (getTextOfIdentifier(property.name) === "type") {
              return [[...nameProperties, property], fieldProperties];
            }

            return [nameProperties, [...fieldProperties, property]];
          }

          return [nameProperties, fieldProperties];
        },
        ([[], []] as [ts.PropertySignature[], ts.PropertySignature[]])
      );

      if (nameProperties.length === 0) {
        return raise(
          {name: "UnkownConstructor", fields: []},
          typ,
          "Expected at least one field with the name `type`",
        );
      }

      const nameProperty = nameProperties[0];

      return {
        name:
          nameProperty.type ?
            getStringOfLiteralType(nameProperty.type) :
            raise("UnkownConstructor", nameProperty.type, "Missing constructor name"),
        fields: 
          fieldProperties.map(
            property =>
            ({
              name: getTextOfIdentifier(property.name),
              typ:
                property.type ?
                  compileTyp(property.type) :
                  raise(unit, property, "Missing type"),
            })
          ),
      };
    });

  return {
    type: "Sum",
    constructors,
  };
}

export function compileTypDefinition(typ: ts.TypeNode): TypDefinition {
  const compiledTyp = compileIfPlainTyp(typ);

  switch (compiledTyp.type) {
    case "PlainTyp":
      return {
        type: "Synonym",
        typ: compiledTyp.typ,
      };
    case "Rest": {
      // Object
      if (ts.isTypeLiteralNode(compiledTyp.typ)) {
        const withATypeField = compiledTyp.typ.members.some(property =>
          ts.isPropertySignature(property) &&
          getTextOfIdentifier(property) === "type"
        );

        if (withATypeField) {
          return compileSumType([compiledTyp.typ]);
        }

        const fields =
          compiledTyp.typ.members.map(property => {
            if (ts.isPropertySignature(property)) {
              return {
                name: getTextOfIdentifier(property.name),
                typ: compileTyp(property.type!),
              };
            }

            return raise({name: "unknown", typ: unit}, property, "Expected named property");
          });

        return {
          type: "Record",
          fields,
        };
      }

      // String
      if (ts.isLiteralTypeNode(compiledTyp.typ)) {
        return compileStringEnum([compiledTyp.typ]);
      }

      if (ts.isUnionTypeNode(compiledTyp.typ)) {
        // Object
        if (ts.isTypeLiteralNode(compiledTyp.typ.types[0])) {
          return compileSumType(compiledTyp.typ.types);
        }

        // String
        if (ts.isLiteralTypeNode(compiledTyp.typ.types[0])) {
          return compileStringEnum(compiledTyp.typ.types);
        }

        return raise(
          {type: "Synonym", typ: unit},
          compiledTyp.typ,
          "Only handle unions of strings or objects with a `type` field",
        );
      }
    }
    default:
      compiledTyp;
      return raise(
        {type: "Synonym", typ: unit},
        compiledTyp.typ,
        "Only handle unions of strings or objects with a `type` field",
      );;
  }
}

function compileStatements(statements: ts.Statement[]): Expression {
  if (statements.length === 0) {
    return tt;
  }

  const untypedStatement = statements[0];

  switch (untypedStatement.kind) {
    case ts.SyntaxKind.Block: {
      const statement = untypedStatement as ts.Block;
      return compileStatements([
        ...statement.statements,
        ...statements.slice(1),
      ]);
    }
    case ts.SyntaxKind.ReturnStatement: {
      const statement = untypedStatement as ts.ReturnStatement;
      return statement.expression ? compileExpression(statement.expression) : tt;
    }
    case ts.SyntaxKind.SwitchStatement: {
      const statement = untypedStatement as ts.SwitchStatement;
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

function compileExpression(expression: ts.Expression): Expression {
  throw "TODO";
}

function compile(fileName: string, options: ts.CompilerOptions): TopLevelStatement[] {
  let program = ts.createProgram([fileName], options);
  const sourceFile = program.getSourceFile(fileName);

  if (!sourceFile) {
    console.log("Cannot compile");
    return [];
  }

  const output: TopLevelStatement[] = []

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
