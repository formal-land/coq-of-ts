import * as ts from "typescript";

type State = {
  typeChecker: ts.TypeChecker | null,
};

export const state: State = {
  typeChecker: null,
};
