import * as ts from 'typescript';
import * as Doc from './doc';
import * as Error from './error';
import * as Expression from './expression';
import * as Identifier from './identifier';
import * as Typ from './typ';

type Constructor = { name: string; fields: { name: string; typ: Typ.t }[] };

export type t =
  | {
      type: 'Enum';
      names: string[];
    }
  | {
      type: 'Record';
      fields: { name: string; typ: Typ.t }[];
    }
  | {
      type: 'Sum';
      constructors: Constructor[];
    }
  | {
      type: 'Synonym';
      typ: Typ.t;
    };

function getStringOfLiteralType(typ: ts.TypeNode): string {
  if (ts.isLiteralTypeNode(typ) && ts.isStringLiteral(typ.literal)) {
    return typ.literal.text;
  }

  return Error.raise('Unknown', typ, 'Expected a string literal type');
}

function compileStringEnum(typs: ReadonlyArray<ts.TypeNode>): t {
  const names = typs.map((typ) => getStringOfLiteralType(typ));

  return {
    type: 'Enum',
    names,
  };
}

function compileSumType(typs: ReadonlyArray<ts.TypeNode>): t {
  const constructors = typs.map((typ) => {
    if (!ts.isTypeLiteralNode(typ)) {
      return Error.raise({ name: 'NonObject', fields: [] }, typ, 'Expected an Object type');
    }

    const [nameProperties, fieldProperties] = typ.members.reduce(
      ([nameProperties, fieldProperties], property) => {
        if (ts.isPropertySignature(property)) {
          if (Identifier.compile(property.name) === 'type') {
            return [[...nameProperties, property], fieldProperties];
          }

          return [nameProperties, [...fieldProperties, property]];
        }

        return [nameProperties, fieldProperties];
      },
      [[], []] as [ts.PropertySignature[], ts.PropertySignature[]],
    );

    const nameProperty = nameProperties[0];

    if (nameProperty === undefined) {
      return Error.raise(
        { name: 'UnkownConstructor', fields: [] },
        typ,
        'Expected at least one field with the name `type`',
      );
    }

    return {
      name: nameProperty.type
        ? getStringOfLiteralType(nameProperty.type)
        : Error.raise('UnkownConstructor', nameProperty, 'Missing constructor name'),
      fields: fieldProperties.map((property) => ({
        name: Identifier.compile(property.name),
        typ: property.type ? Typ.compile(property.type) : Error.raise(Typ.unit, property, 'Missing type'),
      })),
    };
  });

  return {
    type: 'Sum',
    constructors,
  };
}

export function compile(typ: ts.TypeNode): t {
  const compiledTyp = Typ.compileIfPlainTyp(typ);

  switch (compiledTyp.type) {
    case 'PlainTyp':
      return {
        type: 'Synonym',
        typ: compiledTyp.typ,
      };
    case 'Rest': {
      // Object
      if (ts.isTypeLiteralNode(compiledTyp.typ)) {
        const withATypeField = compiledTyp.typ.members.some(
          (property) => ts.isPropertySignature(property) && Identifier.compile(property) === 'type',
        );

        if (withATypeField) {
          return compileSumType([compiledTyp.typ]);
        }

        const fields = compiledTyp.typ.members.map((property) => {
          if (ts.isPropertySignature(property)) {
            return {
              name: Identifier.compile(property.name),
              typ: Typ.compile(property.type!),
            };
          }

          return Error.raise({ name: 'unknown', typ: Typ.unit }, property, 'Expected named property');
        });

        return {
          type: 'Record',
          fields,
        };
      }

      // String
      if (ts.isLiteralTypeNode(compiledTyp.typ)) {
        return compileStringEnum([compiledTyp.typ]);
      }

      if (ts.isUnionTypeNode(compiledTyp.typ)) {
        // Object
        if (ts.isTypeLiteralNode(compiledTyp.typ.types[0]!)) {
          return compileSumType(compiledTyp.typ.types);
        }

        // String
        if (ts.isLiteralTypeNode(compiledTyp.typ.types[0]!)) {
          return compileStringEnum(compiledTyp.typ.types);
        }

        return Error.raise(
          { type: 'Synonym', typ: Typ.unit },
          compiledTyp.typ,
          'Only handle unions of strings or objects with a `type` field',
        );
      }

      return Error.raise(
        { type: 'Synonym', typ: Typ.unit },
        compiledTyp.typ,
        'Only handle unions of strings or objects with a `type` field',
      );
    }
  }
}

function printModule(name: string, doc: Doc.t): Doc.t {
  return Doc.group([
    Doc.group(['Module', Doc.line, name, '.']),
    Doc.indent([Doc.hardline, doc]),
    Doc.group([Doc.hardline, 'End', Doc.line, name, '.']),
  ]);
}

function printRecord(fields: { name: string; typ: Typ.t }[], withSetters: boolean): Doc.t {
  return [
    Doc.group(['Record', Doc.line, 't', Doc.line, ':=', Doc.line, '{']),
    Doc.indent(
      fields.map(({ name, typ }) => [
        Doc.hardline,
        name,
        Doc.line,
        ':',
        Doc.line,
        Typ.print(false, typ),
        Doc.softline,
        ';',
      ]),
    ),
    Doc.hardline,
    '}.',
    ...(withSetters
      ? [
          Doc.hardline,
          Doc.join(
            Doc.hardline,
            fields.map(({ name }) =>
              Doc.group([
                Doc.group(['Definition', Doc.line, `set_${name}`]),
                Doc.indent(Doc.group([Doc.line, 'r', Doc.line, name, Doc.line, ':='])),
                Doc.indent([
                  Doc.line,
                  Expression.printRecordInstance(
                    null,
                    fields.map((field) => ({
                      name: field.name,
                      value: field.name === name ? name : `r.(${field.name})`,
                    })),
                  ),
                  '.',
                ]),
              ]),
            ),
          ),
        ]
      : []),
  ];
}

function printDefineTypeAsModule(name: string): Doc.t {
  return Doc.group(['Definition', Doc.line, name, Doc.line, ':=', Doc.line, `${name}.t`, '.']);
}

export function print(name: string, typDefinition: t): Doc.t {
  switch (typDefinition.type) {
    case 'Enum': {
      const module = printModule(name, [
        Doc.group(['Inductive', Doc.line, 't', Doc.line, ':=']),
        ...typDefinition.names.map((name) => Doc.group([Doc.hardline, '|', Doc.line, name])),
        '.',
      ]);

      return [module, Doc.hardline, printDefineTypeAsModule(name)];
    }
    case 'Record':
      return [printModule(name, printRecord(typDefinition.fields, true)), Doc.hardline, printDefineTypeAsModule(name)];
    case 'Sum': {
      const module = printModule(name, [
        Doc.join(
          [Doc.hardline, Doc.hardline],
          [
            ...typDefinition.constructors.flatMap((constructor) =>
              constructor.fields.length !== 0
                ? [printModule(constructor.name, printRecord(constructor.fields, false))]
                : [],
            ),
            Doc.group([
              Doc.group(['Inductive', Doc.line, 't', Doc.line, ':=']),
              ...typDefinition.constructors.map(({ name, fields }) =>
                Doc.group([
                  Doc.hardline,
                  '|',
                  Doc.line,
                  name,
                  Doc.line,
                  '(',
                  Doc.softline,
                  '_',
                  Doc.line,
                  ':',
                  Doc.line,
                  ...(fields.length !== 0 ? [name, '.t'] : ['unit']),
                  Doc.softline,
                  ')',
                ]),
              ),
              '.',
            ]),
          ],
        ),
      ]);

      return [module, Doc.hardline, printDefineTypeAsModule(name)];
    }
    case 'Synonym':
      return Doc.group([
        Doc.group(['Definition', Doc.line, name, Doc.line, ':', Doc.line, 'Type', Doc.line, ':=']),
        Doc.indent([Doc.line, Typ.print(false, typDefinition.typ), '.']),
      ]);
  }
}
