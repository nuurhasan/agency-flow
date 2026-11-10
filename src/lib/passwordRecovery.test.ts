import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { hasRecoveryHash, validateRecoveryPassword } from "./passwordRecovery";

describe("password recovery safeguards", () => {
  test("recognizes recovery tokens, not ordinary sign-in tokens", () => {
    assert.equal(hasRecoveryHash("#type=recovery&access_token=test-token"), true);
    assert.equal(hasRecoveryHash("#type=signup&access_token=test-token"), false);
    assert.equal(hasRecoveryHash("#type=recovery"), false);
    assert.equal(hasRecoveryHash(""), false);
  });
  test("rejects passwords below the existing six-character minimum", () => {
    assert.equal(validateRecoveryPassword("12345", "12345"), "Password must be at least 6 characters");
    assert.equal(validateRecoveryPassword("123456", "123456"), null);
  });
  test("requires matching confirmation", () => {
    assert.equal(validateRecoveryPassword("abcdef", "abcdeg"), "Passwords don't match");
  });
});