import test from "node:test";
import assert from "node:assert/strict";

import { isNewerVersion } from "../src/app-version.js";

test("detects newer semantic app versions", () => {
  assert.equal(isNewerVersion("1.0.1", "1.0.0"), true);
  assert.equal(isNewerVersion("1.1.0", "1.0.9"), true);
  assert.equal(isNewerVersion("2.0.0", "1.9.9"), true);
  assert.equal(isNewerVersion("1.0.0", "1.0.0"), false);
  assert.equal(isNewerVersion("0.9.9", "1.0.0"), false);
});
