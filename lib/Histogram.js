'use strict';

const { Collector } = require('./Collector');
const { getValue } = require('./utils');


class Histogram extends Collector {
  constructor (options) {
    super(options);

    if (this._labels.includes('le')) {
      throw new Error('"le" is not allowed as a histogram label');
    }

    this._count = 0;
    this._sum = 0;
  }

  observe (v) {
    return this; // TODO: Implement this.
  }

  reset () {
    this.values = new Map();
    this._count = 0;
    this._sum = 0;
  }

  collect () {
    return {
      type: 'histogram',
      name: this.name,
      help: this.help,
      values: this.values
    };
  }

  labels (labels) {
    const value = getValue(this, labels);

    return {
      observe (v, timestamp) {
        return value; // TODO: Implement this.
      }
    };
  }
}

module.exports = { Histogram };
