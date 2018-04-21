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
      counter.inc({ method: 'get', code: '200' });
      expect(registry.report().split('\n')).to.equal([
        '# HELP http_requests_total The total number of HTTP requests.',
        '# TYPE http_requests_total counter',
        'http_requests_total 1',
        'http_requests_total{method="get",code="200"} 1',
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

      fail({ name: 5 }, TypeError, 'metric name must be a string');
      fail({ name: '$' }, RangeError, 'invalid metric name');
      fail({ name: 'foo', help: 5 }, TypeError, 'help must be a string');
      fail({ name: 'foo', help: 'bar', labels: 5 }, TypeError, 'labels must be an array');
      fail({ name: 'foo', help: 'bar', labels: [], registries: 5 }, TypeError, 'registries must be an array');
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
      counter.inc({ method: 'get' });
      expect(counter.values.get('method:get$').value).to.equal(6);
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
      gauge.dec({ code: 400 });
      expect(gauge.values.get('code:400$').value).to.equal(-1);
      gauge.set(5, { method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(5);
      gauge.dec(2, { method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(3);
      gauge.dec(4, { method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(-1);
      gauge.inc(2.5, { method: 'get' });
      expect(gauge.values.get('method:get$').value).to.equal(1.5);
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

  describe('Utils', () => {
    it('cloneArray() returns an empty array by default', () => {
      expect(Utils.cloneArray()).to.equal([]);
    });
  });
});
