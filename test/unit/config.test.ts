/**
 * Rule 16: pacing is not optional. The configuration can widen the interval
 * between two requests and can never narrow it below the floor.
 */

import { describe, expect, it } from "vitest";

import { DEFAULTS, MIN_ALLOWED_INTERVAL_MS, loadConfig } from "../../src/config.js";

describe("the floor on the interval between two requests", () => {
  it("keeps the default interval when the environment asks for none at all", () => {
    expect(loadConfig({ BIDE_MIN_INTERVAL_MS: "0" }).minIntervalMs).toBe(DEFAULTS.minIntervalMs);
  });

  it("keeps the default interval when the environment asks for one below the floor", () => {
    expect(loadConfig({ BIDE_MIN_INTERVAL_MS: "500" }).minIntervalMs).toBe(DEFAULTS.minIntervalMs);
    expect(loadConfig({ BIDE_MIN_INTERVAL_MS: "-1000" }).minIntervalMs).toBe(
      DEFAULTS.minIntervalMs,
    );
  });

  it("never returns an interval under the floor, whatever the environment says", () => {
    for (const value of ["0", "1", "500", "1999", "abc", "", "NaN"]) {
      expect(loadConfig({ BIDE_MIN_INTERVAL_MS: value }).minIntervalMs).toBeGreaterThanOrEqual(
        MIN_ALLOWED_INTERVAL_MS,
      );
    }
  });

  it("accepts an interval wider than the default, since slowing down is always allowed", () => {
    expect(loadConfig({ BIDE_MIN_INTERVAL_MS: "9000" }).minIntervalMs).toBe(9000);
  });

  it("states a floor the default itself respects", () => {
    expect(MIN_ALLOWED_INTERVAL_MS).toBe(2000);
    expect(DEFAULTS.minIntervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });
});

describe("the rest of the configuration", () => {
  it("uses the documented defaults when the environment sets nothing", () => {
    const config = loadConfig({});

    expect(config.minIntervalMs).toBe(3000);
    expect(config.timeoutMs).toBe(20000);
    expect(config.maxRetries).toBe(3);
    expect(config.cacheTtlMs).toBe(900000);
    expect(config.cacheMaxEntries).toBe(200);
    expect(config.logLevel).toBe("error");
  });

  it("reads each value from its own variable", () => {
    const config = loadConfig({
      BIDE_TIMEOUT_MS: "5000",
      BIDE_MAX_RETRIES: "1",
      BIDE_CACHE_TTL_MS: "60000",
      BIDE_CACHE_MAX_ENTRIES: "10",
      BIDE_LOG_LEVEL: "debug",
    });

    expect(config.timeoutMs).toBe(5000);
    expect(config.maxRetries).toBe(1);
    expect(config.cacheTtlMs).toBe(60000);
    expect(config.cacheMaxEntries).toBe(10);
    expect(config.logLevel).toBe("debug");
  });

  it("falls back to the default when a value cannot be read as a number", () => {
    const config = loadConfig({
      BIDE_TIMEOUT_MS: "soon",
      BIDE_MAX_RETRIES: "",
      BIDE_CACHE_TTL_MS: "1e",
    });

    expect(config.timeoutMs).toBe(DEFAULTS.timeoutMs);
    expect(config.maxRetries).toBe(DEFAULTS.maxRetries);
    expect(config.cacheTtlMs).toBe(DEFAULTS.cacheTtlMs);
  });

  it("falls back to the default log level when the name is not one it knows", () => {
    expect(loadConfig({ BIDE_LOG_LEVEL: "chatty" }).logLevel).toBe(DEFAULTS.logLevel);
  });

  // The site is a free association reading its own traffic logs. Whoever the
  // caller says it is, the identity of the project making the requests and a
  // way to reach a person about them have to stay in the header.
  it("keeps the project and a contact address in the user agent, whatever the caller sets", () => {
    const config = loadConfig({ BIDE_USER_AGENT: "SomeCaller/1.0" });

    expect(config.userAgent).toContain("SomeCaller/1.0");
    // The site has to be able to reach a person about the traffic it receives.
    expect(config.userAgent).toContain("mcp-bideetmusique");
    expect(config.userAgent).toMatch(/https?:\/\/|@/);
  });

  it("names the project in the default user agent too", () => {
    expect(loadConfig({}).userAgent).toContain("mcp-bideetmusique");
    expect(loadConfig({}).userAgent).toMatch(/https?:\/\/|@/);
  });
});
