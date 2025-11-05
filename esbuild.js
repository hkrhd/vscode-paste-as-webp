const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: "esbuild-problem-matcher",

    setup(build) {
        build.onStart(() => {
            console.log("[watch] build started");
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(
                    `    ${location.file}:${location.line}:${location.column}:`
                );
            });
            console.log("[watch] build finished");
        });
    },
};

async function main() {
    const ctx = await esbuild.context({
        entryPoints: ["src/extension.ts"],
        bundle: true,
        format: "cjs",
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: "node",
        outfile: "dist/extension.js",
        external: ["vscode", "sharp", "@napi-rs/clipboard"],
        target: "node16",
        logLevel: "silent",
        plugins: [
            {
                name: "native-modules",
                setup(build) {
                    // Mark .node files as external
                    build.onResolve({ filter: /\.node$/ }, (args) => ({
                        path: args.path,
                        external: true,
                    }));

                    // Mark native dependencies as external
                    build.onResolve({ filter: /^sharp$/ }, (args) => ({
                        path: args.path,
                        external: true,
                    }));

                    build.onResolve({ filter: /^@napi-rs\/clipboard$/ }, (args) => ({
                        path: args.path,
                        external: true,
                    }));

                    // Mark platform-specific modules as external
                    build.onResolve({ filter: /detect-libc/ }, (args) => ({
                        path: args.path,
                        external: true,
                    }));
                },
            },
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin,
        ],
    });
    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
