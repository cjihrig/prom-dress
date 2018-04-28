'use strict';

const { defaultRegistry } = require('./CollectorRegistry');
const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;


class Collector {
  constructor (options) {
    if (typeof options !== 'object' || options === null) {
      throw new TypeError('options must be an object');
    }

    if (typeof options.name !== 'string') {
      throw new TypeError('metric name must be a string');
    } else if (!METRIC_NAME_RE.test(options.name)) {
      throw new RangeError('invalid metric name');
    }

    if (typeof options.help !== 'string') {
      throw new TypeError('help must be a string');
    }

    this.name = options.name;
    this.help = options.help;
    this.values = new Map();
    this.registries = [];
    this._labels = [];

    if (Array.isArray(options.labels)) {
      for (let i = 0; i < options.labels.length; i++) {
        if (!LABEL_NAME_RE.test(options.labels[i])) {
          throw new RangeError('invalid label name');
        }

        this._labels.push(options.labels[i]);
      }
    } else if (options.labels !== undefined) {
      throw new TypeError('labels must be an array');
    }

    if (options.registries === undefined) {
      defaultRegistry.register(this);
    } else if (Array.isArray(options.registries)) {
      for (let i = 0; i < options.registries.length; i++) {
        options.registries[i].register(this);
      }
    } else {
      throw new TypeError('registries must be an array');
    }
  }
}

module.exports = { Collector };
