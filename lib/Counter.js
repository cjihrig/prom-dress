'use strict';

const { Collector } = require('./Collector');
const { getValue, validateTimestamp } = require('./utils');


class Counter extends Collector {
  inc (v, labels, timestamp) {
    if (typeof v === 'object' && v !== null) {
      timestamp = labels;
      labels = v;
      v = 1;
    }

    const value = getValue(this, labels);

    _inc(v, value, timestamp);
  }

  reset () {
    this.values = new Map();
  }

  collect () {
    return {
      type: 'counter',
      name: this.name,
      help: this.help,
      values: this.values
    };
  }

  labels (labels) {
    const value = getValue(this, labels);

    return {
      inc (v, timestamp) {
        _inc(v, value, timestamp);
      }
    };
  }
}

module.exports = { Counter };


function _inc (v, value, timestamp) {
  let amount;

  if (v === undefined) {
    amount = 1;
  } else if (typeof v !== 'number') {
    throw new TypeError('v must be a number');
  } else if (!Number.isFinite(v)) {
    throw new RangeError('v must be a finite number');
  } else if (v < 0) {
    throw new RangeError('v must not be a negative number');
  } else {
    amount = v;
  }

  if (timestamp !== undefined) {
    validateTimestamp(timestamp);
    value.timestamp = timestamp;
  }

  if (value.value === undefined) {
    value.value = amount;
  } else {
    value.value += amount;
  }
}
