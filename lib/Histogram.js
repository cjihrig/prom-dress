'use strict';

const { Collector } = require('./Collector');
const { cloneArray, getValue, validateDouble } = require('./utils');
const COUNT_SYMBOL = Symbol('count');
const SUM_SYMBOL = Symbol('sum');
const defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25,
  0.5, 1, 2.5, 5, 10];


class Histogram extends Collector {
  constructor (options) {
    super(options);

    // Make sure that the user didn't provide 'le', even though it's needed.
    if (this._labels.includes('le')) {
      throw new Error('"le" is not allowed as a histogram label');
    }

    this._labels.push('le');

    if (Array.isArray(options.buckets)) {
      this.buckets = cloneArray(options.buckets);
    } else if (options.buckets === undefined) {
      // TODO: Support linear(start, width, count)
      // TODO: Support exponential(start, factor, count)
      this.buckets = cloneArray(defaultBuckets);
    } else {
      throw new TypeError('buckets must be an array');
    }

    this.buckets = Object.freeze(this.buckets.sort(numericAscendingSort));
  }

  observe (v, labels = Object.create(null)) {
    return _observe.call(this, v, labels);
  }

  reset () {
    this.values = new Map();
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
    const self = this;

    return {
      observe (v) {
        return _observe.call(self, v, labels);
      }
    };
  }
}

module.exports = { Histogram };


function numericAscendingSort (a, b) {
  return a - b;
}


function _observe (v, labels = Object.create(null)) {
  validateDouble(v);

  if (labels.le !== undefined) {
    throw new Error('"le" is not allowed as a histogram label');
  }

  const count = getValue(this, { le: COUNT_SYMBOL, ...labels });
  const sum = getValue(this, { le: SUM_SYMBOL, ...labels });
  const inf = getValue(this, { le: '+Inf', ...labels });

  if (count.value === undefined) {
    count.value = 1;
    count.name = `${this.name}_count`;
    inf.value = 1;
    inf.name = `${this.name}_bucket`;
    sum.value = v;
    sum.name = `${this.name}_sum`;

    // Initialize all of the buckets. Pay the extra price on the first
    // observation to avoid having to loop over all of the buckets on every
    // observation.
    for (let i = 0; i < this.buckets.length; i++) {
      const value = getValue(this, { le: this.buckets[i], ...labels });

      value.value = 0;
      value.name = `${this.name}_bucket`;
    }
  } else {
    count.value++;
    inf.value++;
    sum.value += v;
  }

  for (let i = this.buckets.length - 1; i >= 0; i--) {
    const le = this.buckets[i];

    if (v > le) {
      break;
    }

    const value = getValue(this, { le, ...labels });

    value.value++;
  }
}
