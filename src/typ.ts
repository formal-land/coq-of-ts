import * as ts from 'typescript';
import * as Error from './error';
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
    /* istanbul ignore next */
    default:
      return compiledTyp;
  }
}
