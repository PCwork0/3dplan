import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  v2, add, sub, scale, dot, cross, length, normalize,
  perpCW, perpCCW, equal, lerp, midpoint,
} from '../src/geometry/vec2.ts';

const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `Expected ${a} ≈ ${b} (ε=${eps})`);

describe('vec2', () => {
  describe('perpCW', () => {
    it('rotates east (+X) to south (+Z)', () => {
      const r = perpCW(v2(1, 0));
      close(r.x, 0); close(r.z, 1);
    });
    it('rotates unit +Z to −X', () => {
      const r = perpCW(v2(0, 1));
      close(r.x, -1); close(r.z, 0);
    });
    it('applying twice reverses the vector', () => {
      const v = v2(3, 7);
      const r = perpCW(perpCW(v));
      close(r.x, -v.x); close(r.z, -v.z);
    });
  });

  describe('perpCCW', () => {
    it('rotates east (+X) to north (−Z)', () => {
      const r = perpCCW(v2(1, 0));
      close(r.x, 0); close(r.z, -1);
    });
    it('is inverse of perpCW', () => {
      const v = v2(3, 7);
      const cw  = perpCW(v);
      const ccw = perpCCW(cw);
      close(ccw.x, v.x); close(ccw.z, v.z);
    });
  });

  describe('cross (2D scalar)', () => {
    it('is zero for parallel vectors', () => {
      close(cross(v2(1, 0), v2(2, 0)), 0);
    });
    it('is positive for +X × +Z', () => {
      assert.ok(cross(v2(1, 0), v2(0, 1)) > 0);
    });
    it('is negative for +X × −Z', () => {
      assert.ok(cross(v2(1, 0), v2(0, -1)) < 0);
    });
    it('anticommutes: a×b = −(b×a)', () => {
      const a = v2(2, 3), b = v2(5, 1);
      close(cross(a, b), -cross(b, a));
    });
  });

  describe('normalize', () => {
    it('produces a unit vector', () => {
      const v = normalize(v2(3, 4));
      close(length(v), 1);
    });
    it('handles zero vector safely (no throw)', () => {
      const v = normalize(v2(0, 0));
      assert.ok(isFinite(v.x) && isFinite(v.z));
    });
  });

  describe('lerp', () => {
    it('returns a at t=0', () => {
      const r = lerp(v2(0, 0), v2(10, 10), 0);
      close(r.x, 0); close(r.z, 0);
    });
    it('returns b at t=1', () => {
      const r = lerp(v2(0, 0), v2(10, 10), 1);
      close(r.x, 10); close(r.z, 10);
    });
    it('returns midpoint at t=0.5', () => {
      const r = lerp(v2(0, 0), v2(4, 6), 0.5);
      close(r.x, 2); close(r.z, 3);
    });
  });

  describe('add / sub / scale', () => {
    it('add is commutative', () => {
      const a = v2(1, 2), b = v2(3, 4);
      const r1 = add(a, b), r2 = add(b, a);
      close(r1.x, r2.x); close(r1.z, r2.z);
    });
    it('sub undoes add', () => {
      const a = v2(5, 3), b = v2(2, 7);
      const r = sub(add(a, b), b);
      close(r.x, a.x); close(r.z, a.z);
    });
    it('scale by 0 gives zero vector', () => {
      const r = scale(v2(9, 9), 0);
      close(r.x, 0); close(r.z, 0);
    });
  });

  describe('midpoint', () => {
    it('is equidistant from both endpoints', () => {
      const a = v2(0, 0), b = v2(6, 8);
      const m = midpoint(a, b);
      close(m.x, 3); close(m.z, 4);
    });
  });
});
