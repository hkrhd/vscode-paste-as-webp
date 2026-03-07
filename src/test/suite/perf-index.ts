import * as path from "path";
import Mocha from "mocha";

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        timeout: 60000,
    });

    mocha.addFile(path.resolve(__dirname, "./perf.test.js"));

    await new Promise<void>((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed.`));
                return;
            }

            resolve();
        });
    });
}
