import { exportAllSchemas, archiveAllSchemas, getDefaultOutputDir } from "../dist/scripts/export-schemas.js";
import { VERSION } from "../dist/epimcp/version.js";

const args = process.argv.slice(2);
const archiveFlag = args.includes("--archive");
const positionalArgs = args.filter((a) => !a.startsWith("-"));
const outputDir = positionalArgs[0] ?? getDefaultOutputDir();

exportAllSchemas(outputDir);
console.log(`Schemas exported to ${outputDir}`);

if (archiveFlag) {
  archiveAllSchemas(VERSION, outputDir);
  console.log(`Schemas archived to schemas/archive/${VERSION}`);
}
