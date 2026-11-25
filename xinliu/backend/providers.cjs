'use strict';

const silvamux = require('./silvamux.cjs');
const yunxin = require('./yunxin.cjs');

function providersFromEnvironment() {
  const registry = { silvamux: silvamux.providersFromEnvironment(), yunxin: yunxin.providersFromEnvironment() };
  return Object.fromEntries(['video', 'text', 'vision'].flatMap(kind => {
    const selected = process.env[`XINLIU_${kind.toUpperCase()}_PROVIDER`] || 'silvamux';
    if (!Object.hasOwn(registry, selected)) throw new Error(`未知${kind} provider；可选silvamux或yunxin`);
    const provider = registry[selected][kind];
    return provider ? [[kind, { id: selected, ...provider }]] : [];
  }));
}

module.exports = { providersFromEnvironment };
