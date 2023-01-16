import * as ts from "typescript";
import * as Error from "./error";
import * as Identifier from "./identifier";
import * as Typ from "./typ";

type Constructor = {name: string, fields: {name: string, typ: Typ.t}[]};

export type t = | {
  type: "Enum",
  names: string[],
}
| {
  type: "Record",
  fields: {name: string, typ: Typ.t}[],
}
| {
  type: "Sum",
  constructors: Constructor[],
}
| {
  type: "Synonym",
  typ: Typ.t,
};

function getStringOfLiteralType(typ: ts.TypeNode): string {
  if (ts.isLiteralTypeNode(typ) && ts.isStringLiteral(typ.literal)) {
    return typ.literal.text;
  }

  return Error.raise("Unknown", typ, "Expected a string literal type")
}

function compileStringEnum(typs: ReadonlyArray<ts.TypeNode>): t {
  const names =
    typs.map(typ => getStringOfLiteralType(typ));

  return {
    type: "Enum",
    names,
  };
}

function compileSumType(typs: ReadonlyArray<ts.TypeNode>): t {
  const constructors =
    typs.map(typ => {
      if (!ts.isTypeLiteralNode(typ)) {
        return Error.raise({name: "NonObject", fields: []}, typ, "Expected an Object type");
      }

      const [nameProperties, fieldProperties] = typ.members.reduce(
        ([nameProperties, fieldProperties], property) => {
          if (ts.isPropertySignature(property)) {
            if (Identifier.compile(property.name) === "type") {
              return [[...nameProperties, property], fieldProperties];
            }

            return [nameProperties, [...fieldProperties, property]];
          }

          return [nameProperties, fieldProperties];
        },
        ([[], []] as [ts.PropertySignature[], ts.PropertySignature[]])
      );

      if (nameProperties.length === 0) {
        return Error.raise(
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
            Error.raise("UnkownConstructor", nameProperty.type, "Missing constructor name"),
        fields: 
          fieldProperties.map(
            property =>
            ({
              name: Identifier.compile(property.name),
              typ:
                property.type ?
                  Typ.compile(property.type) :
                  Error.raise(Typ.unit, property, "Missing type"),
            })
          ),
      };
    });

  return {
    type: "Sum",
    constructors,
  };
}

export function compileTypDefinition(typ: ts.TypeNode): t {
  const compiledTyp = Typ.compileIfPlainTyp(typ);

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
          Identifier.compile(property) === "type"
        );

        if (withATypeField) {
          return compileSumType([compiledTyp.typ]);
        }

        const fields =
          compiledTyp.typ.members.map(property => {
            if (ts.isPropertySignature(property)) {
              return {
                name: Identifier.compile(property.name),
                typ: Typ.compile(property.type!),
              };
            }

            return Error.raise({name: "unknown", typ: Typ.unit}, property, "Expected named property");
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

        return Error.raise(
          {type: "Synonym", typ: Typ.unit},
          compiledTyp.typ,
          "Only handle unions of strings or objects with a `type` field",
        );
      }
    }
    default:
      compiledTyp;
      return Error.raise(
        {type: "Synonym", typ: Typ.unit},
        compiledTyp.typ,
        "Only handle unions of strings or objects with a `type` field",
      );
  }
}
