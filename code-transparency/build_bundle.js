import { readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { join, posix, sep } from "path";

const args = process.argv.slice(2);
const rootDir = args[0];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = readdirSync(dirPath);
  for (const file of files) {
    const filePath = join(dirPath, file);
    if (statSync(filePath).isDirectory()) {
      getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  }
  return arrayOfFiles;
}

function removePrefix(s, prefix) {
  return s.substr(prefix.length).split(sep).join(posix.sep);
}

const metadataPath = join(rootDir, "app.json");
const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));

const srcDir = join(rootDir, "src");
const allFiles = getAllFiles(srcDir);
const toTrim = srcDir + "/";

const modules = allFiles.map((filePath) => ({
  name: removePrefix(filePath, toTrim),
  module: readFileSync(filePath, "utf-8"),
}));

const bundlePath = join(rootDir, "bundle.json");
const bundle = { metadata, modules };

console.log(`Writing bundle with ${modules.length} modules to ${bundlePath}`);
writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
