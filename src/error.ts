import * as ts from "typescript";

const errors: {message: string, node: ts.Node}[] = [];

export function raise<A>(defaultValue: A, node, message) {
  errors.push({message, node});
  return defaultValue;
}
