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

      // TODO: Escape `\` as `\\` and new line as `\n`
      str += `# HELP ${name} ${help}\n`;
      str += `# TYPE ${name} ${type}\n`;

      values.forEach((v, k, m) => {
        const { value, timestamp, labels, name: valueName } = v;
        const labelKeys = Object.keys(labels);

        str += typeof valueName === 'string' ? valueName : name;

        if (labelKeys.length > 0) {
          str += '{';

          for (let i = 0; i < labelKeys.length; i++) {
            if (i !== 0) {
              str += ',';
            }

            str += `${labelKeys[i]}="${labels[labelKeys[i]]}"`;
          }

          str += '}';
        }

        str += ` ${value}${timestamp === undefined ? '' : timestamp}\n`;
      });
    });

    return str;
  }
}

module.exports = {
  CollectorRegistry,
  defaultRegistry: new CollectorRegistry()
};
