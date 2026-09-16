import { describe, it, expect } from "vitest";
import { can, parseSearch, issueInput, issuePatch } from "../src/lib/domain";
describe("authorization", () => {
  it("denies viewers mutations", () => {
    expect(can("viewer", "issue")).toBe(false);
    expect(can("member", "manage")).toBe(false);
    expect(can("admin", "owner")).toBe(false);
    expect(can("owner", "manage")).toBe(true);
  });
});
describe("search", () => {
  it("parses combined filters and quoted names", () =>
    expect(
      parseSearch(
        'fix login status:in-progress priority:high assignee:"Anna Lee" label:frontend due:<2026-10-01',
      ),
    ).toEqual({
      text: "fix login",
      status: "in-progress",
      priority: "high",
      assignee: "Anna Lee",
      label: "frontend",
      due: "2026-10-01",
    }));
  it("rejects invalid grammar", () => {
    expect(() => parseSearch("status:broken")).toThrow();
    expect(() => parseSearch("due:<2026-02-30")).toThrow();
    expect(() => parseSearch("wat:x")).toThrow();
  });
});
it("validates issue creation", () => {
  expect(
    issueInput.safeParse({ title: "", projectId: "invalid" }).success,
  ).toBe(false);
});

it("partial issue updates never apply create defaults", () => {
  expect(issuePatch.parse({ title: "Renamed", version: 1 })).toEqual({
    title: "Renamed",
    version: 1,
  });
});
