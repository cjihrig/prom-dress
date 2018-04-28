'use strict';

const { Collector } = require('./Collector');
const { getValue, validateDouble, validateTimestamp } = require('./utils');


class Gauge extends Collector {
  inc (v, labels, timestamp) {
    if (typeof v === 'object' && v !== null) {
      timestamp = labels;
      labels = v;
      v = 1;
    }

    const value = getValue(this, labels);

    _inc(v, value, timestamp);
  }

  dec (v, labels, timestamp) {
    if (typeof v === 'object' && v !== null) {
      timestamp = labels;
      labels = v;
      v = 1;
    }

    const value = getValue(this, labels);

    _dec(v, value, timestamp);
  }

  set (v, labels, timestamp) {
    const value = getValue(this, labels);

    _set(v, value, timestamp);
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
        _inc(v, value, timestamp);
      },
      dec (v, timestamp) {
        _dec(v, value, timestamp);
      },
      set (v, timestamp) {
        _set(v, value, timestamp);
      }
    };
  }
}

module.exports = { Gauge };


function _inc (v, value, timestamp) {
  let amount;

  if (v === undefined) {
    amount = 1;
  } else {
    validateDouble(v);
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


function _dec (v, value, timestamp) {
  let amount;

  if (v === undefined) {
    amount = -1;
  } else {
    validateDouble(v);
    amount = -v;
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


function _set (v, value, timestamp) {
  validateDouble(v);

  if (timestamp !== undefined) {
    validateTimestamp(timestamp);
    value.timestamp = timestamp;
  }

  value.value = v;
}
