// Unit tests: login brute-force lockout.
import { describe, expect, it, beforeEach } from "vitest";
import { isLocked, recordFailure, clearFailures, lockoutRemainingSec, _resetLockouts } from "./auth-lockout";

describe("auth lockout", () => {
  beforeEach(() => _resetLockouts());

  it("is not locked initially", () => {
    expect(isLocked("user@example.com")).toBe(false);
  });
  it("locks after 5 failures", () => {
    for (let i = 0; i < 4; i++) expect(recordFailure("u@x.com")).toBe(false);
    expect(recordFailure("u@x.com")).toBe(true);
    expect(isLocked("u@x.com")).toBe(true);
    expect(lockoutRemainingSec("u@x.com")).toBeGreaterThan(0);
  });
  it("clears on success", () => {
    recordFailure("u@x.com");
    clearFailures("u@x.com");
    expect(isLocked("u@x.com")).toBe(false);
  });
  it("is case-insensitive on email", () => {
    for (let i = 0; i < 5; i++) recordFailure("User@X.com");
    expect(isLocked("user@x.com")).toBe(true);
  });
  it("does not lock other accounts", () => {
    for (let i = 0; i < 5; i++) recordFailure("a@x.com");
    expect(isLocked("b@x.com")).toBe(false);
  });
});
