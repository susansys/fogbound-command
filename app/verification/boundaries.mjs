import fs from "node:fs";
import path from "node:path";
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((x) =>
      x.isDirectory() ? walk(path.join(dir, x.name)) : [path.join(dir, x.name)],
    );
}
const forbidden =
  /(?:from\s*|import\s*\()["'][^"']*(?:core\/|world|persistence|engineering\.json)/;
for (const file of walk("src").filter(
  (x) =>
    /\.(tsx?|js)$/.test(x) &&
    !x.includes(`${path.sep}core${path.sep}`) &&
    !x.endsWith("worker.ts"),
)) {
  if (forbidden.test(fs.readFileSync(file, "utf8")))
    throw Error(`UI/Transport imports private core: ${file}`);
}
console.log("UI/Transport import boundary verified");
