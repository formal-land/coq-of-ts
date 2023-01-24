import * as ts from 'typescript';
import * as Error from './error';
import * as Expression from './expression';
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
