import { it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  digest,
  token,
} from "../src/server/password";
it("salts hashes and verifies passwords", async () => {
  const first = await hashPassword("correct horse battery");
  expect(first).not.toEqual(await hashPassword("correct horse battery"));
  expect(await verifyPassword("correct horse battery", first)).toBe(true);
  expect(await verifyPassword("incorrect", first)).toBe(false);
});
it("generates independent bearer secrets", () => {
  expect(token()).not.toEqual(token());
  expect(digest(token())).toHaveLength(64);
});
