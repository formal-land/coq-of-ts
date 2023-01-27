import * as ts from 'typescript';

type State = {
  typeChecker: ts.TypeChecker | null;
};

const state: State = {
  typeChecker: null,
};

export function initTypeChecker(typeChecker: ts.TypeChecker): void {
  state.typeChecker = typeChecker;
}

export function getTypeChecker(): ts.TypeChecker {
  if (!state.typeChecker) {
    throw new Error('Type checker not initialized');
  }

  return state.typeChecker;
}
