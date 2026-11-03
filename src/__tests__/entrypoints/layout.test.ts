/**
 * WXT takes every top-level file in src/entrypoints/ for an entrypoint, tests
 * included. A test sharing a name with its script stops `wxt prepare`, and so
 * `yarn install`. Any other test ships in the extension as an unlisted script.
 * Jest runs these files happily either way, so nothing else would notice.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

describe("src/entrypoints", () => {
  it("has no test files at its top level", () => {
    const names = readdirSync(join(__dirname, "..", "..", "entrypoints"));

    expect(names.filter((name) => /\.(test|spec)\./.test(name))).toEqual([]);
  });
});
