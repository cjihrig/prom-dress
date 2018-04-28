'use strict';

class CollectorRegistry {
  constructor () {
    this._collectors = new Map();
  }

  register (collector) {
    if (this._collectors.has(collector.name)) {
      throw new Error(`${collector.name} is already registered`);
    }

    this._collectors.set(collector.name, collector);
    collector.registries.push(this);
  }

  unregister (collector) {
    const index = collector.registries.indexOf(this);

    if (index !== -1) {
      this._collectors.delete(collector.name);
      collector.registries.splice(index, 1);
    }
  }

  report () {
    let str = '';

    this._collectors.forEach((collector, k, m) => {
      const { type, name, help, values } = collector.collect();
      // TODO: Add options to constructor to allow not including HELP and TYPE.

      // TODO: Escape \ and \n in help string.
      str += `# HELP ${name} ${help}\n`;
      str += `# TYPE ${name} ${type}\n`;

      values.forEach((v, k, m) => {
        const { value, timestamp, labels, name: valueName } = v;
        const labelKeys = Object.keys(labels);
        let outputLabels = '';

        str += typeof valueName === 'string' ? valueName : name;

        for (let i = 0; i < labelKeys.length; i++) {
          const lk = labelKeys[i];
          const lv = labels[lk];

          if (typeof lv !== 'symbol') {
            if (outputLabels !== '') {
              outputLabels += ',';
            }

            outputLabels += `${lk}="${lv}"`;
          }
        }

        if (outputLabels.length > 0) {
          str += `{${outputLabels}}`;
        }

        str += ` ${value}`;

        if (timestamp !== undefined) {
          str += ` ${timestamp}`;
        }

        str += '\n';
      });
    });

    return str;
  }
}

module.exports = {
  CollectorRegistry,
  defaultRegistry: new CollectorRegistry()
};
