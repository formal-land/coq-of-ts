import * as ts from 'typescript';

export const errors: { message: string; node: ts.Node }[] = [];

export function raise<A>(defaultValue: A, node: ts.Node, message: string) {
  errors.push({ message, node });
  return defaultValue;
}
