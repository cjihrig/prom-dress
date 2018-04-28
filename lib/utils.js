'use strict';


function getValue (collector, labels = {}) {
  const { values } = collector;
  const keys = Object.keys(labels).sort();
  let key = '';

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];

    if (!collector._labels.includes(k)) {
      throw new Error(`unknown label ${k}`);
    }

    key += `${k}:${labels[k].toString()}$`;
  }

  let value = values.get(key);

  if (value === undefined) {
    value = {
      value: undefined,
      timestamp: undefined,
      name: undefined,  // Allow overwriting the metric name (for buckets, etc.)
      labels: Object.assign({}, labels)
    };

    values.set(key, value);
  }

  return value;
}


function cloneArray (arr) {
  const clone = [];

  if (!Array.isArray(arr)) {
    return clone;
  }

  for (let i = 0; i < arr.length; i++) {
    clone.push(arr[i]);
  }

  return clone;
}


function validateDouble (v) {
  if (typeof v !== 'number') {
    throw new TypeError('v must be a number');
  } else if (!Number.isFinite(v)) {
    throw new RangeError('v must be a finite number');
  }
}


function validateTimestamp (timestamp) {
  // TODO: Implement this.
}


module.exports = { cloneArray, getValue, validateDouble, validateTimestamp };
