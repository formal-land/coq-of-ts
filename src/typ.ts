import * as ts from 'typescript';
import * as Doc from './doc';
import * as Error from './error';
import * as Global from './global';
import * as Identifier from './identifier';
import * as Typ from './typ';

export type t =
  | {
      type: 'Function';
      params: t[];
      returnTyp: t;
      typParams: string[];
    }
  | {
      type: 'Implicit';
    }
  | {
      type: 'Tuple';
      params: t[];
    }
  | {
      type: 'Variable';
      name: string;
      params: t[];
    };

export const unit: t = {
  type: 'Variable',
  name: 'unit',
  params: [],
};

type PlainTypOrRest =
  | {
      type: 'PlainTyp';
      typ: t;
    }
  | {
      type: 'Rest';
      typ: ts.TypeLiteralNode | ts.UnionTypeNode | ts.StringLiteral;
    };

export function compileIfPlainTyp(typ: ts.TypeNode): PlainTypOrRest {
  if (typ.kind === ts.SyntaxKind.AnyKeyword) {
    return Error.raise({ type: 'PlainTyp', typ: { type: 'Implicit' } }, typ, 'The type `any` is not handled');
  }

  if (ts.isArrayTypeNode(typ)) {
    return {
      type: 'PlainTyp',
      typ: {
        type: 'Variable',
        name: 'list',
        params: [Typ.compile(typ.elementType)],
      },
    };
  }

  if (typ.kind === ts.SyntaxKind.BooleanKeyword) {
    return {
      type: 'PlainTyp',
      typ: {
        type: 'Variable',
        name: 'bool',
        params: [],
      },
    };
  }

  if (typ.kind === ts.SyntaxKind.NeverKeyword) {
    return {
      type: 'PlainTyp',
      typ: {
        type: 'Variable',
        name: 'Empty_set',
        params: [],
      },
    };
  }

  if (ts.isFunctionTypeNode(typ)) {
    return {
      type: 'PlainTyp',
      typ: {
        type: 'Function',
        params: typ.parameters.map(({ type }) => (type ? Typ.compile(type) : { type: 'Implicit' })),
        returnTyp: Typ.compile(typ.type),
        typParams: typ.typeParameters ? typ.typeParameters.map((parameter) => Identifier.compile(parameter.name)) : [],
      },
    };
  }

  if (ts.isTypeReferenceNode(typ)) {
    return {
      type: 'PlainTyp',
      typ: {
        type: 'Variable',
        name: Identifier.compile(typ.typeName),
        params: [],
      },
    };
  }

  if (typ.kind === ts.SyntaxKind.NullKeyword) {
    return {
      type: 'PlainTyp',
      typ: unit,
    };
  }

  if (typ.kind === ts.SyntaxKind.NumberKeyword) {
    return {
      type: 'PlainTyp',
      typ: {
        type: 'Variable',
        name: 'Z',
        params: [],
      },
    };
  }

  if (ts.isTypeLiteralNode(typ)) {
    if (typ.members.length === 0) {
      return {
        type: 'PlainTyp',
        typ: unit,
      };
    }

    return {
      type: 'Rest',
      typ,
    };
  }

  if (ts.isStringLiteral(typ)) {
    return {
      type: 'Rest',
      typ,
    };
  }

  if (typ.kind === ts.SyntaxKind.StringKeyword) {
    return {
      type: 'PlainTyp',
      typ: {
        type: 'Variable',
        name: 'string',
        params: [],
      },
    };
  }

  if (ts.isThisTypeNode(typ)) {
    return Error.raise({ type: 'PlainTyp', typ: unit }, typ, 'The type `this` is not handled');
  }

  if (ts.isTupleTypeNode(typ)) {
    if (typ.elements.length === 1) {
      return Error.raise(
        { type: 'PlainTyp', typ: Typ.compile(typ.elements[0]!) },
        typ,
        'Tuple types with exactly one element are not handled',
      );
    }

    return {
      type: 'PlainTyp',
      typ: {
        type: 'Tuple',
        params: typ.elements.map((typ) => Typ.compile(typ)),
      },
    };
  }

  if (ts.isTypeQueryNode(typ)) {
    return Error.raise(
      { type: 'PlainTyp', typ: { type: 'Implicit' } },
      typ,
      'Extracting the type of values with `typeof` is not handled',
    );
  }

  if (ts.isUnionTypeNode(typ)) {
    return {
      type: 'Rest',
      typ,
    };
  }

  if (typ.kind === ts.SyntaxKind.VoidKeyword) {
    return {
      type: 'PlainTyp',
      typ: unit,
    };
  }

  return Error.raise({ type: 'PlainTyp', typ: { type: 'Implicit' } }, typ, 'Unhandled kind of type');
}

export function compile(typ: ts.TypeNode): t {
  const compiledTyp = compileIfPlainTyp(typ);

  switch (compiledTyp.type) {
    case 'PlainTyp':
      return compiledTyp.typ;
    case 'Rest':
      if (ts.isTypeLiteralNode(compiledTyp.typ)) {
        return Error.raise(
          unit,
          compiledTyp.typ,
          'This kind of object type is not handled outside of type definitions',
        );
      }

      if (ts.isStringLiteral(compiledTyp.typ)) {
        return Error.raise(unit, compiledTyp.typ, 'String literal types are not handled outside of type definitions');
      }

      if (ts.isUnionTypeNode(compiledTyp.typ)) {
        return Error.raise(unit, compiledTyp.typ, 'Union types are not handled outside of type definitions');
      }

      /* istanbul ignore next */
      return compiledTyp.typ;
  }
}

// Return the name of the type of a node when we need a name, for example for a record type.
export function getTypName(node: ts.Node): string {
  const typ = Global.getTypeChecker().getTypeAtLocation(node);

  return Global.getTypeChecker().typeToString(typ);
}

export function printImplicitTyps(names: string[]): Doc.t {
  return Doc.group([
    '{',
    Doc.indent([Doc.softline, Doc.join(Doc.line, names), Doc.line, Doc.group([':', Doc.line, 'Type'])]),
    Doc.softline,
    '}',
  ]);
}

export function print(needParens: boolean, typ: t): Doc.t {
  switch (typ.type) {
    case 'Function':
      return Doc.paren(
        needParens,
        Doc.group([
          ...(typ.typParams.length !== 0
            ? [
                Doc.group([
                  'forall',
                  Doc.line,
                  '{',
                  Doc.indent(
                    Doc.group([
                      Doc.softline,
                      ...typ.typParams.map((typParam) => [typParam, Doc.line]),
                      Doc.group([':', Doc.line, 'Type']),
                    ]),
                  ),
                  Doc.softline,
                  '}',
                  ',',
                  Doc.line,
                ]),
              ]
            : []),
          ...typ.params.map((param) => Doc.group([print(true, param), Doc.line, '->', Doc.line])),
          print(true, typ.returnTyp),
        ]),
      );
    case 'Implicit':
      return Doc.group('_');
    case 'Tuple':
      switch (typ.params.length) {
        case 0:
          return Doc.group('unit');
        default:
          return Doc.paren(
            needParens,
            Doc.group(
              Doc.join(
                [Doc.line, '*', Doc.line],
                typ.params.map((param) => print(true, param)),
              ),
            ),
          );
      }
    case 'Variable':
      return Doc.paren(
        needParens && typ.params.length !== 0,
        Doc.group([typ.name, Doc.indent(typ.params.map((param) => [Doc.line, print(true, param)]))]),
      );
  }
}

export function printReturnTyp(typ: t | null, nextToken: Doc.t): Doc.t {
  return Doc.group([...(typ ? [':', Doc.line, print(false, typ), Doc.line] : []), nextToken]);
}
