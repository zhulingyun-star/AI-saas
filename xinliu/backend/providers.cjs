'use strict';

const silvamux = require('./silvamux.cjs');

function providersFromEnvironment() {
  return silvamux.providersFromConfiguration();
}

module.exports = { providersFromEnvironment };
