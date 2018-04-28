'use strict';
const Code = require('code');
const Lab = require('lab');
const Prom = require('../lib');
const { Collector } = require('../lib/Collector');
const Utils = require('../lib/utils');


// Test shortcuts
const lab = exports.lab = Lab.script();
const { describe, it } = lab;
const { expect } = Code;


describe('Prom Dress', () => {
  it('validates exports', () => {
    expect(Prom.CollectorRegistry).to.be.a.function();
    expect(Prom.Counter).to.be.a.function();
    expect(Prom.Gauge).to.be.a.function();
    expect(Prom.Histogram).to.be.a.function();
    expect(Prom.Summary).to.be.a.function();
    expect(Prom.defaultRegistry).to.be.an.instanceOf(Prom.CollectorRegistry);
    expect(Prom.exposition).to.equal({
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
      expect(registry._collectors.size).to.equal(0);
      expect(counter.registries).to.equal([]);
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

      expect(() => {
        new Prom.Counter({ // eslint-disable-line no-new
          name: 'foo',
          help: 'foo',
          registries: [registry]
        });
      }).to.throw(Error, 'foo is already registered');
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
      expect(registry.report().split('\n')).to.equal([
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

      expect(collector.name).to.equal('foo');
      expect(collector.help).to.equal('bar');
      expect(collector.values).to.be.an.instanceOf(Map);
      expect(collector._labels).to.equal(['baz']);
      expect(collector.registries).to.equal([registry]);
    });

    it('registers with the default registry by default', () => {
      const collector = new Collector({ name: 'foo', help: 'bar' });

      expect(collector.registries).to.equal([Prom.defaultRegistry]);
      Prom.defaultRegistry.unregister(collector);
    });

    it('constructor throws on bad inputs', () => {
      function fail (options, errorType, message) {
        expect(() => {
          new Collector(options); // eslint-disable-line no-new
        }).to.throw(errorType, message);
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

      expect(collect.type).to.equal('counter');
      expect(collect.name).to.equal('http_requests_total');
      expect(collect.help).to.equal('The total number of HTTP requests.');
    });

    it('can increment counter values', () => {
      const counter = new Prom.Counter({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });

      counter.inc();
      expect(counter.values.get('').value).to.equal(1);
      counter.inc(2, { method: 'get' });
      expect(counter.values.get('method:get$').value).to.equal(2);
      counter.inc(3, { method: 'get' });
      expect(counter.values.get('method:get$').value).to.equal(5);
      expect(counter.values.get('method:get$').timestamp).to.equal(undefined);
      counter.inc({ method: 'get' }, 1000);
      expect(counter.values.get('method:get$').value).to.equal(6);
      expect(counter.values.get('method:get$').timestamp).to.equal(1000);
    });

    it('throws on invalid increment values', () => {
      const counter = new Prom.Counter({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: []
      });

      function fail (value, errorType, message) {
        expect(() => {
          counter.inc(value);
        }).to.throw(errorType, message);
      }

      counter.inc(2);
      expect(counter.values.get('').value).to.equal(2);
      fail(null, TypeError, 'v must be a number');
      fail('5', TypeError, 'v must be a number');
      fail(Infinity, RangeError, 'v must be a finite number');
      fail(NaN, RangeError, 'v must be a finite number');
      fail(-1, RangeError, 'v must not be a negative number');

      expect(() => {
        counter.inc({ foo: 'bar' });
      }).to.throw(Error, 'unknown label foo');

      expect(counter.values.get('').value).to.equal(2);
    });

    it('creates a child counter', () => {
      const counter = new Prom.Counter({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });

      counter.inc(5, { method: 'get' });
      expect(counter.values.get('method:get$').value).to.equal(5);
      counter.labels({ method: 'get' }).inc(3);
      expect(counter.values.get('method:get$').value).to.equal(8);
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

      expect(collect.type).to.equal('gauge');
      expect(collect.name).to.equal('http_requests_total');
      expect(collect.help).to.equal('The total number of HTTP requests.');
    });

    it('can increment, decrement, and set gauge values', () => {
      const gauge = new Prom.Gauge({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });

      gauge.set(3);
      expect(gauge.values.get('').value).to.equal(3);
      gauge.inc();
      expect(gauge.values.get('').value).to.equal(4);
      gauge.dec();
      expect(gauge.values.get('').value).to.equal(3);
      gauge.inc(2);
      expect(gauge.values.get('').value).to.equal(5);
      gauge.dec(3);
      expect(gauge.values.get('').value).to.equal(2);
      gauge.dec({ code: 400 }, 3000);
      expect(gauge.values.get('code:400$').value).to.equal(-1);
      expect(gauge.values.get('code:400$').timestamp).to.equal(3000);
      gauge.set(5, { method: 'get' }, 83);
      expect(gauge.values.get('method:get$').value).to.equal(5);
      expect(gauge.values.get('method:get$').timestamp).to.equal(83);
      gauge.dec(2, { method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(3);
      gauge.dec(4, { method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(-1);
      gauge.inc(2.5, { method: 'get' }, 9000);
      expect(gauge.values.get('method:get$').value).to.equal(1.5);
      expect(gauge.values.get('method:get$').timestamp).to.equal(9000);
      gauge.inc({ method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(2.5);
      gauge.dec({ method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(1.5);
    });

    it('throws on invalid input values', () => {
      const gauge = new Prom.Gauge({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: []
      });

      function fail (method, value, errorType, message) {
        expect(() => {
          gauge[method](value);
        }).to.throw(errorType, message);
      }

      gauge.inc();
      expect(gauge.values.get('').value).to.equal(1);
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
      expect(gauge.values.get('').value).to.equal(1);
    });

    it('creates a child gauge', () => {
      const gauge = new Prom.Gauge({
        name: 'http_requests_total',
        help: 'The total number of HTTP requests.',
        registries: [],
        labels: ['method', 'code']
      });

      gauge.set(5, { method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(5);
      const child = gauge.labels({ method: 'get' });
      child.inc(3);
      expect(gauge.values.get('method:get$').value).to.equal(8);
      child.dec(2);
      expect(gauge.values.get('method:get$').value).to.equal(6);
      child.set(99.99);
      expect(gauge.values.get('method:get$').value).to.equal(99.99);
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

      expect(collect.type).to.equal('histogram');
      expect(collect.name).to.equal('response_time');
      expect(collect.help).to.equal('HTTP response times.');
    });

    it('throws if user provides "le" label', () => {
      expect(() => {
        new Prom.Histogram({            // eslint-disable-line no-new
          name: 'response_time',
          help: 'HTTP response times.',
          registries: [],
          labels: ['code', 'le']
        });
      }).to.throw(Error, '"le" is not allowed as a histogram label');
    });

    it('throws on bad inputs', () => {
      expect(() => {
        new Prom.Histogram({            // eslint-disable-line no-new
          name: 'response_time',
          help: 'HTTP response times.',
          registries: [],
          labels: ['code'],
          buckets: 5
        });
      }).to.throw(TypeError, 'buckets must be an array');
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

      expect(histogram.buckets).to.equal(buckets);
      expect(histogram.buckets).to.not.shallow.equal(buckets);
      buckets.push(6);  // User passed buckets should not be frozen.
      expect(() => {
        histogram.buckets.push(6);
      }).to.throw(Error);
    });

    it('uses default bucket values if none are provided', () => {
      const histogram = new Prom.Histogram({
        name: 'response_time',
        help: 'HTTP response times.',
        registries: [],
        labels: ['code']
      });

      expect(histogram.buckets).to.equal([0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]);
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

      expect(registry.report().split('\n')).to.equal([
        '# HELP response_time HTTP response times.',
        '# TYPE response_time histogram',
        'response_time_count{method="get",path="/foo",code="200"} 3',
        'response_time_sum{method="get",path="/foo",code="200"} 10',
        'response_time_bucket{le="1",method="get",path="/foo",code="200"} 3',
        'response_time_bucket{le="2",method="get",path="/foo",code="200"} 2',
        'response_time_bucket{le="3",method="get",path="/foo",code="200"} 2',
        'response_time_bucket{le="4",method="get",path="/foo",code="200"} 2',
        'response_time_bucket{le="5",method="get",path="/foo",code="200"} 1',
        'response_time_count{method="get",path="/foo",code="404"} 1',
        'response_time_sum{method="get",path="/foo",code="404"} 2',
        'response_time_bucket{le="1",method="get",path="/foo",code="404"} 1',
        'response_time_bucket{le="2",method="get",path="/foo",code="404"} 1',
        'response_time_bucket{le="3",method="get",path="/foo",code="404"} 0',
        'response_time_bucket{le="4",method="get",path="/foo",code="404"} 0',
        'response_time_bucket{le="5",method="get",path="/foo",code="404"} 0',
        'response_time_count 1',
        'response_time_sum 3',
        'response_time_bucket{le="1"} 1',
        'response_time_bucket{le="2"} 1',
        'response_time_bucket{le="3"} 1',
        'response_time_bucket{le="4"} 0',
        'response_time_bucket{le="5"} 0',
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

      expect(() => {
        histogram.observe(4, { code: 200, le: 5 });
      }).to.throw(Error, '"le" is not allowed as a histogram label');
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
      expect(histogram.values.get('code:200$le:1$method:get$path:/foo$').value).to.equal(1);
      expect(histogram.values.get('code:200$le:2$method:get$path:/foo$').value).to.equal(1);
      const child = histogram.labels({ method: 'get', path: '/foo', code: 200 });
      child.observe(1);
      expect(histogram.values.get('code:200$le:1$method:get$path:/foo$').value).to.equal(2);
      expect(histogram.values.get('code:200$le:2$method:get$path:/foo$').value).to.equal(1);
    });
  });

  describe('Utils', () => {
    it('cloneArray() returns an empty array by default', () => {
      expect(Utils.cloneArray()).to.equal([]);
    });
  });
});
