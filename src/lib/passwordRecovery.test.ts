import { describe, expect, test } from "bun:test";
import { hasRecoveryHash, validateRecoveryPassword } from "./passwordRecovery";

describe("password recovery safeguards", () => {
  test("recognizes recovery tokens, not ordinary sign-in tokens", () => {
    expect(hasRecoveryHash("#type=recovery&access_token=test-token")).toBe(true);
    expect(hasRecoveryHash("#type=signup&access_token=test-token")).toBe(false);
    expect(hasRecoveryHash("#type=recovery")).toBe(false);
    expect(hasRecoveryHash("")).toBe(false);
  });
  test("rejects passwords below the existing six-character minimum", () => {
    expect(validateRecoveryPassword("12345", "12345")).toBe("Password must be at least 6 characters");
    expect(validateRecoveryPassword("123456", "123456")).toBeNull();
  });
  test("requires matching confirmation", () => {
    expect(validateRecoveryPassword("abcdef", "abcdeg")).toBe("Passwords don't match");
  });
});