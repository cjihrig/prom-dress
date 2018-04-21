'use strict';

const { Collector } = require('./Collector');
const { getValue } = require('./utils');


class Gauge extends Collector {
  inc (v, labels, timestamp) {
    if (typeof v === 'object' && v !== null) {
      timestamp = labels;
      labels = v;
      v = 1;
    }

    const value = getValue(this, labels);

    _inc(v, value);
  }

  dec (v, labels, timestamp) {
    if (typeof v === 'object' && v !== null) {
      timestamp = labels;
      labels = v;
      v = 1;
    }

    const value = getValue(this, labels);

    _dec(v, value);
  }

  set (v, labels, timestamp) {
    const value = getValue(this, labels);

    _set(v, value);
  }

  // TODO: Add setToCurrentTime()

  reset () {
    this.values = new Map();
  }

  collect () {
    return {
      type: 'gauge',
      name: this.name,
      help: this.help,
      values: this.values
    };
  }

  labels (labels) {
    const value = getValue(this, labels);

    return {
      inc (v, timestamp) {
        _inc(v, value);
      },
      dec (v, timestamp) {
        _dec(v, value);
      },
      set (v, timestamp) {
        _set(v, value);
      }
    };
  }
}

module.exports = { Gauge };


function _inc (v, value) {
  let amount;

  if (v === undefined) {
    amount = 1;
  } else {
    validateDouble(v);
    amount = v;
  }

  // TODO: Validate and set value.timestamp if needed.

  if (value.value === undefined) {
    value.value = amount;
  } else {
    value.value += amount;
  }
}


function _dec (v, value) {
  let amount;

  if (v === undefined) {
    amount = -1;
  } else {
    validateDouble(v);
    amount = -v;
  }

  // TODO: Validate and set value.timestamp if needed.

  if (value.value === undefined) {
    value.value = amount;
  } else {
    value.value += amount;
  }
}


function _set (v, value) {
  validateDouble(v);
  value.value = v;
  // TODO: Validate and set value.timestamp if needed.
}


function validateDouble (v) {
  if (typeof v !== 'number') {
    throw new TypeError('v must be a number');
  } else if (!Number.isFinite(v)) {
    throw new RangeError('v must be a finite number');
  }
}
