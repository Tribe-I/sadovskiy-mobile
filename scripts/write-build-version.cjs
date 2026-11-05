const fs = require("node:fs");
const path = require("node:path");
const supplied =
  process.env.EXPO_PUBLIC_COMMIT || process.env.EAS_BUILD_GIT_COMMIT_HASH || "";
const commit = /^[a-f0-9]{7,40}$/i.test(supplied)
  ? supplied.slice(0, 7)
  : "dev";
fs.writeFileSync(
  path.resolve(__dirname, "../src/build-version.ts"),
  `export const buildCommit = ${JSON.stringify(commit)};\n`,
);
console.log(`Build version: ${commit}`);
