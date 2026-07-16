import { describe, expect, test } from "bun:test";
import { randomToken, sha256Hex, timingSafeEqual } from "./crypto";

describe("auth cryptography helpers", () => {
  test("hashes values with SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("compares secrets without a length-dependent branch", async () => {
    expect(await timingSafeEqual("same", "same")).toBe(true);
    expect(await timingSafeEqual("same", "different")).toBe(false);
  });

  test("creates URL-safe 256-bit invitation tokens", () => {
    const first = randomToken();
    const second = randomToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(second).not.toBe(first);
  });
});
