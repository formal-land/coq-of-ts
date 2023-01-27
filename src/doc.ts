// A wrapper around Prettier doc primitives.
import doc from 'prettier/doc.js';

export type t = doc.builders.Doc;

const { group, hardline, indent, join, line, softline } = doc.builders;

export { group, hardline, indent, join, line, softline };

export function paren(needParens: boolean, doc: t): t {
  return needParens ? group(['(', doc, ')']) : doc;
}
