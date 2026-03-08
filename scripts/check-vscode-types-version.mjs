import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJsonPath = resolve(process.cwd(), "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const vscodeEngine = packageJson.engines?.vscode;
const vscodeTypesVersion = packageJson.devDependencies?.["@types/vscode"];

if (typeof vscodeEngine !== "string") {
    console.error("package.json の engines.vscode が見つかりません。");
    process.exit(1);
}

if (typeof vscodeTypesVersion !== "string") {
    console.error("package.json の devDependencies.@types/vscode が見つかりません。");
    process.exit(1);
}

const normalizedEngineVersion = vscodeEngine.replace(/^[~^]/u, "");

if (normalizedEngineVersion !== vscodeTypesVersion) {
    console.error("@types/vscode と engines.vscode のバージョンが一致しません。");
    console.error(`engines.vscode: ${vscodeEngine}`);
    console.error(`@types/vscode: ${vscodeTypesVersion}`);
    process.exit(1);
}

console.log(`OK: engines.vscode (${vscodeEngine}) と @types/vscode (${vscodeTypesVersion}) は整合しています。`);
