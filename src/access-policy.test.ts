import { describe, expect, test } from "bun:test";
import { policyAllowsEmail } from "./access-policy";

const policy = {
  decision: "allow",
  reusable: true,
  include: [{ email: { email: "Person@Example.com" } }],
  exclude: [],
  require: [],
};

describe("policyAllowsEmail", () => {
  test("matches exact emails case-insensitively", () => {
    expect(policyAllowsEmail(policy, "person@example.com")).toBe(true);
  });

  test("rejects unlisted emails", () => {
    expect(policyAllowsEmail(policy, "other@example.com")).toBe(false);
  });

  test("honors exact email exclusions", () => {
    expect(policyAllowsEmail({ ...policy, exclude: policy.include }, "person@example.com")).toBe(false);
  });

  test("fails closed for unsupported selectors and requirements", () => {
    expect(policyAllowsEmail({ ...policy, include: [{ email_domain: { domain: "example.com" } }] }, "person@example.com")).toBe(false);
    expect(policyAllowsEmail({ ...policy, require: policy.include }, "person@example.com")).toBe(false);
  });
});
