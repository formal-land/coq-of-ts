import * as ts from 'typescript';
import * as Error from './error';

export function compile(node: ts.Node): string {
  if (ts.isIdentifier(node)) {
    return node.text;
  }

  return Error.raise('unknown', node, 'Expected an identifier');
}
