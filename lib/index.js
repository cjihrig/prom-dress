'use strict';

const { CollectorRegistry, defaultRegistry } = require('./CollectorRegistry');
const { Counter } = require('./Counter');
const { Gauge } = require('./Gauge');
const { Histogram } = require('./Histogram');
const { Summary } = require('./Summary');

const exposition = {
  encoding: 'utf8',
  contentType: 'text/plain; version=0.0.4'
};

module.exports = {
  CollectorRegistry,
  Counter,
  Gauge,
  Histogram,
  Summary,
  exposition,
  defaultRegistry
};
