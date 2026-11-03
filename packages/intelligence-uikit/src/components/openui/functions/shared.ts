// Adapted from thesysdev/open-intelligent-ui; Copyright (c) 2026 Thesys Inc. MIT; see ../LICENSE.thesys.
import { z } from "zod/v4";

export const list = () => z.array(z.any());
export const numbers = () => z.array(z.number());

/** Reads `field` from a row, with dot paths; "" is the item itself, like @Filter. */
export function read(item: unknown, field: string): unknown {
  if (!field) return item;
  let cur: unknown = item;
  for (const key of field.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Equality by value: lists and objects compare item by item, and a number
 * matches its string form (ids from inputs are often strings).
 */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const mixed = (typeof a === "number" && typeof b === "string") || (typeof a === "string" && typeof b === "number");
  if (mixed) return String(a) === String(b);
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => same(x, (b as unknown[])[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** A finite number or a thrown error, which the runtime turns into null. */
export function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("result is not a finite number");
  return value;
}

export const MAX_ITEMS = 10000;
