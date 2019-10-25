'use strict';
const Assert = require('assert');
const Lab = require('@hapi/lab');
const Prom = require('../lib');
const { Collector } = require('../lib/Collector');
const Utils = require('../lib/utils');
const { describe, it } = exports.lab = Lab.script();


describe('Prom Dress', () => {
  it('validates exports', () => {
    Assert.strictEqual(typeof Prom.CollectorRegistry, 'function');
    Assert.strictEqual(typeof Prom.Counter, 'function');
    Assert.strictEqual(typeof Prom.Gauge, 'function');
    Assert.strictEqual(typeof Prom.Histogram, 'function');
    Assert.strictEqual(typeof Prom.Summary, 'function');
    Assert(Prom.defaultRegistry instanceof Prom.CollectorRegistry);
    Assert.deepStrictEqual(Prom.exposition, {
      encoding: 'utf8',
      contentType: 'text/plain; version=0.0.4'
    });
  });

  describe('CollectorRegistry', () => {
    it('registers and unregisters collectors', () => {
      const registry = new Prom.CollectorRegistry();
      const counter = new Prom.Counter({
        name: 'foo',
        help: 'foo',
        registries: [registry]
      });

      registry.unregister(counter);
      Assert.strictEqual(registry._collectors.size, 0);
      Assert.deepStrictEqual(counter.registries, []);
      registry.register(counter);
      registry.unregister(counter);
      registry.unregister(counter); // Multiple unregisters are fine.
    });

    it('prevents the same metric from being registered multiple times', () => {
      const registry = new Prom.CollectorRegistry();
      new Prom.Counter({  // eslint-disable-line no-new
        name: 'foo',
        help: 'foo',
        registries: [registry]
      });

      Assert.throws(() => {
        new Prom.Counter({ // eslint-disable-line no-new
          name: 'foo',
          help: 'foo',
          registries: [registry]
        });
      }, /^Error: foo is already registered$/);
    });

    it('reports exposition text data', () => {
      const registry = new Prom.CollectorRegistry();
      const counter = new Prom.Counter({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [registry],
        labels: ['method', 'code']
      });

      counter.inc();
      counter.inc({ method: 'get', code: '200' }, 5500);
      Assert.deepStrictEqual(registry.report().split('\n'), [
        '# HELP http_requests_total The total number of HTTP requests.',
        '# TYPE http_requests_total counter',
        'http_requests_total 1',
        'http_requests_total{method="get",code="200"} 1 5500',
        ''
      ]);
    });
  });

  describe('Collector', () => {
    it('constructs a Collector instance', () => {
      const registry = new Prom.CollectorRegistry();
      const collector = new Collector({
        name: 'foo',
        help: 'bar',
        labels: ['baz'],
        registries: [registry]
      });

      Assert.strictEqual(collector.name, 'foo');
      Assert.strictEqual(collector.help, 'bar');
      Assert(collector.values instanceof Map);
      Assert.deepStrictEqual(collector._labels, ['baz']);
      Assert.deepStrictEqual(collector.registries, [registry]);
    });

    it('registers with the default registry by default', () => {
      const collector = new Collector({ name: 'foo', help: 'bar' });

      Assert.deepStrictEqual(collector.registries, [Prom.defaultRegistry]);
      Prom.defaultRegistry.unregister(collector);
    });

    it('constructor throws on bad inputs', () => {
      function fail (options, errorType, message) {
        const re = new RegExp(`^${errorType.name}: ${message}$`);

        Assert.throws(() => {
          new Collector(options); // eslint-disable-line no-new
        }, re);
      }

      fail(undefined, TypeError, 'options must be an object');
      fail(null, TypeError, 'options must be an object');
      fail({ name: 5 }, TypeError, 'metric name must be a string');
      fail({ name: '$' }, RangeError, 'invalid metric name');
      fail({ name: 'foo', help: 5 }, TypeError, 'help must be a string');
      fail({ name: 'foo', help: 'bar', labels: 5 }, TypeError, 'labels must be an array');
      fail({ name: 'foo', help: 'bar', labels: [], registries: 5 }, TypeError, 'registries must be an array');
      fail({ name: 'foo', help: 'bar', labels: ['94'] }, RangeError, 'invalid label name');
    });
  });

  describe('Counter', () => {
    it('creates an initialized counter', () => {
      const counter = new Prom.Counter({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });
      const collect = counter.collect();

      Assert.strictEqual(collect.type, 'counter');
      Assert.strictEqual(collect.name, 'http_requests_total');
      Assert.strictEqual(collect.help, 'The total number of HTTP requests.');
    });

    it('can increment counter values', () => {
      const counter = new Prom.Counter({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });

      counter.inc();
      Assert.strictEqual(counter.values.get('').value, 1);
      counter.inc(2, { method: 'get' });
      Assert.strictEqual(counter.values.get('method:get$').value, 2);
      counter.inc(3, { method: 'get' });
      Assert.strictEqual(counter.values.get('method:get$').value, 5);
      Assert.strictEqual(counter.values.get('method:get$').timestamp, undefined);
      counter.inc({ method: 'get' }, 1000);
      Assert.strictEqual(counter.values.get('method:get$').value, 6);
      Assert.strictEqual(counter.values.get('method:get$').timestamp, 1000);
    });

    it('throws on invalid increment values', () => {
      const counter = new Prom.Counter({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: []
      });

      function fail (value, errorType, message) {
        const re = new RegExp(`^${errorType.name}: ${message}$`);

        Assert.throws(() => {
          counter.inc(value);
        }, re);
      }

      counter.inc(2);
      Assert.strictEqual(counter.values.get('').value, 2);
      fail(null, TypeError, 'v must be a number');
      fail('5', TypeError, 'v must be a number');
      fail(Infinity, RangeError, 'v must be a finite number');
      fail(NaN, RangeError, 'v must be a finite number');
      fail(-1, RangeError, 'v must not be a negative number');

      Assert.throws(() => {
        counter.inc({ foo: 'bar' });
      }, /^Error: unknown label foo$/);

      Assert.strictEqual(counter.values.get('').value, 2);
    });

    it('creates a child counter', () => {
      const counter = new Prom.Counter({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });

      counter.inc(5, { method: 'get' });
      Assert.strictEqual(counter.values.get('method:get$').value, 5);
      counter.labels({ method: 'get' }).inc(3);
      Assert.strictEqual(counter.values.get('method:get$').value, 8);
    });
  });

  describe('Gauge', () => {
    it('creates an initialized gauge', () => {
      const gauge = new Prom.Gauge({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });
      const collect = gauge.collect();

      Assert.strictEqual(collect.type, 'gauge');
      Assert.strictEqual(collect.name, 'http_requests_total');
      Assert.strictEqual(collect.help, 'The total number of HTTP requests.');
    });

    it('can increment, decrement, and set gauge values', () => {
      const gauge = new Prom.Gauge({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });

      gauge.set(3);
      Assert.strictEqual(gauge.values.get('').value, 3);
      gauge.inc();
      Assert.strictEqual(gauge.values.get('').value, 4);
      gauge.dec();
      Assert.strictEqual(gauge.values.get('').value, 3);
      gauge.inc(2);
      Assert.strictEqual(gauge.values.get('').value, 5);
      gauge.dec(3);
      Assert.strictEqual(gauge.values.get('').value, 2);
      gauge.dec({ code: 400 }, 3000);
      Assert.strictEqual(gauge.values.get('code:400$').value, -1);
      Assert.strictEqual(gauge.values.get('code:400$').timestamp, 3000);
      gauge.set(5, { method: 'get' }, 83);
      Assert.strictEqual(gauge.values.get('method:get$').value, 5);
      Assert.strictEqual(gauge.values.get('method:get$').timestamp, 83);
      gauge.dec(2, { method: 'get' });
      Assert.strictEqual(gauge.values.get('method:get$').value, 3);
      gauge.dec(4, { method: 'get' });
      Assert.strictEqual(gauge.values.get('method:get$').value, -1);
      gauge.inc(2.5, { method: 'get' }, 9000);
      Assert.strictEqual(gauge.values.get('method:get$').value, 1.5);
      Assert.strictEqual(gauge.values.get('method:get$').timestamp, 9000);
      gauge.inc({ method: 'get' });
      Assert.strictEqual(gauge.values.get('method:get$').value, 2.5);
      gauge.dec({ method: 'get' });
      Assert.strictEqual(gauge.values.get('method:get$').value, 1.5);
    });

    it('throws on invalid input values', () => {
      const gauge = new Prom.Gauge({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: []
      });

      function fail (method, value, errorType, message) {
        const re = new RegExp(`^${errorType.name}: ${message}$`);

        Assert.throws(() => {
          gauge[method](value);
        }, re); // .to.throw(errorType, message);
      }

      gauge.inc();
      Assert.strictEqual(gauge.values.get('').value, 1);
      fail('inc', null, TypeError, 'v must be a number');
      fail('inc', '5', TypeError, 'v must be a number');
      fail('inc', Infinity, RangeError, 'v must be a finite number');
      fail('inc', NaN, RangeError, 'v must be a finite number');
      fail('dec', null, TypeError, 'v must be a number');
      fail('dec', '5', TypeError, 'v must be a number');
      fail('dec', Infinity, RangeError, 'v must be a finite number');
      fail('dec', NaN, RangeError, 'v must be a finite number');
      fail('set', null, TypeError, 'v must be a number');
      fail('set', '5', TypeError, 'v must be a number');
      fail('set', Infinity, RangeError, 'v must be a finite number');
      fail('set', NaN, RangeError, 'v must be a finite number');
      Assert.strictEqual(gauge.values.get('').value, 1);
    });

    it('creates a child gauge', () => {
      const gauge = new Prom.Gauge({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });

      gauge.set(5, { method: 'get' });
      Assert.strictEqual(gauge.values.get('method:get$').value, 5);
      const child = gauge.labels({ method: 'get' });
      child.inc(3);
      Assert.strictEqual(gauge.values.get('method:get$').value, 8);
      child.dec(2);
      Assert.strictEqual(gauge.values.get('method:get$').value, 6);
      child.set(99.99);
      Assert.strictEqual(gauge.values.get('method:get$').value, 99.99);
    });
  });

  describe('Histogram', () => {
    it('creates an initialized histogram', () => {
      const histogram = new Prom.Histogram({
        name: 'response_time',
        help: 'HTTP response times.',
        registries: [],
        labels: ['method', 'code']
      });
      const collect = histogram.collect();

      Assert.strictEqual(collect.type, 'histogram');
      Assert.strictEqual(collect.name, 'response_time');
      Assert.strictEqual(collect.help, 'HTTP response times.');
    });

    it('throws if user provides "le" label', () => {
      Assert.throws(() => {
        new Prom.Histogram({            // eslint-disable-line no-new
          name: 'response_time',
          help: 'HTTP response times.',
          registries: [],
          labels: ['code', 'le']
        });
      }, /^Error: "le" is not allowed as a histogram label$/);
    });

    it('throws on bad inputs', () => {
      Assert.throws(() => {
        new Prom.Histogram({            // eslint-disable-line no-new
          name: 'response_time',
          help: 'HTTP response times.',
          registries: [],
          labels: ['code'],
          buckets: 5
        });
      }, /^TypeError: buckets must be an array$/);
    });

    it('accepts user defined buckets', () => {
      const buckets = [1, 2, 3, 4, 5];
      const histogram = new Prom.Histogram({
        name: 'response_time',
        help: 'HTTP response times.',
        registries: [],
        labels: ['code'],
        buckets
      });

      Assert.deepStrictEqual(histogram.buckets, buckets);
      Assert.notStrictEqual(histogram.buckets, buckets);
      buckets.push(6);  // User passed buckets should not be frozen.
      Assert.throws(() => {
        histogram.buckets.push(6);
      }, Error);
    });

    it('uses default bucket values if none are provided', () => {
      const histogram = new Prom.Histogram({
        name: 'response_time',
        help: 'HTTP response times.',
        registries: [],
        labels: ['code']
      });

      Assert.deepStrictEqual(histogram.buckets, [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]);
    });

    it('can observe values', () => {
      const registry = new Prom.CollectorRegistry();
      const histogram = new Prom.Histogram({
        name: 'response_time',
        help: 'HTTP response times.',
        registries: [registry],
        labels: ['method', 'path', 'code'],
        buckets: [1, 2, 3, 4, 5]
      });

      histogram.observe(4, { method: 'get', path: '/foo', code: 200 });
      histogram.observe(2, { method: 'get', path: '/foo', code: 404 });
      histogram.observe(3);
      histogram.observe(1, { method: 'get', path: '/foo', code: 200 });
      histogram.observe(5, { method: 'get', path: '/foo', code: 200 });

      Assert.deepStrictEqual(registry.report().split('\n'), [
        '# HELP response_time HTTP response times.',
        '# TYPE response_time histogram',
        'response_time_count{method="get",path="/foo",code="200"} 3',
        'response_time_sum{method="get",path="/foo",code="200"} 10',
        'response_time_bucket{le="+Inf",method="get",path="/foo",code="200"} 3',
        'response_time_bucket{le="1",method="get",path="/foo",code="200"} 1',
        'response_time_bucket{le="2",method="get",path="/foo",code="200"} 1',
        'response_time_bucket{le="3",method="get",path="/foo",code="200"} 1',
        'response_time_bucket{le="4",method="get",path="/foo",code="200"} 2',
        'response_time_bucket{le="5",method="get",path="/foo",code="200"} 3',
        'response_time_count{method="get",path="/foo",code="404"} 1',
        'response_time_sum{method="get",path="/foo",code="404"} 2',
        'response_time_bucket{le="+Inf",method="get",path="/foo",code="404"} 1',
        'response_time_bucket{le="1",method="get",path="/foo",code="404"} 0',
        'response_time_bucket{le="2",method="get",path="/foo",code="404"} 1',
        'response_time_bucket{le="3",method="get",path="/foo",code="404"} 1',
        'response_time_bucket{le="4",method="get",path="/foo",code="404"} 1',
        'response_time_bucket{le="5",method="get",path="/foo",code="404"} 1',
        'response_time_count 1',
        'response_time_sum 3',
        'response_time_bucket{le="+Inf"} 1',
        'response_time_bucket{le="1"} 0',
        'response_time_bucket{le="2"} 0',
        'response_time_bucket{le="3"} 1',
        'response_time_bucket{le="4"} 1',
        'response_time_bucket{le="5"} 1',
        ''
      ]);
    });

    it('throws if observe() is passed the "le" label', () => {
      const histogram = new Prom.Histogram({
        name: 'response_time',
        help: 'HTTP response times.',
        registries: [],
        labels: ['code']
      });

      Assert.throws(() => {
        histogram.observe(4, { code: 200, le: 5 });
      }, /^Error: "le" is not allowed as a histogram label$/);
    });

    it('creates a child histogram', () => {
      const histogram = new Prom.Histogram({
        name: 'response_time',
        help: 'HTTP response times.',
        registries: [],
        labels: ['method', 'path', 'code'],
        buckets: [1, 2]
      });

      histogram.observe(2, { method: 'get', path: '/foo', code: 200 });
      Assert.strictEqual(histogram.values.get('code:200$le:1$method:get$path:/foo$').value, 0);
      Assert.strictEqual(histogram.values.get('code:200$le:2$method:get$path:/foo$').value, 1);
      const child = histogram.labels({ method: 'get', path: '/foo', code: 200 });
      child.observe(1);
      Assert.strictEqual(histogram.values.get('code:200$le:1$method:get$path:/foo$').value, 1);
      Assert.strictEqual(histogram.values.get('code:200$le:2$method:get$path:/foo$').value, 2);
    });
  });

  describe('Utils', () => {
    it('cloneArray() returns an empty array by default', () => {
      Assert.deepStrictEqual(Utils.cloneArray(), []);
    });
  });
});
