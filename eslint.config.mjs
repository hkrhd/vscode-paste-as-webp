import tsParser from "@typescript-eslint/parser";

export default [{
    files: ["**/*.ts"],
}, {
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",
    },

    rules: {
        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "warn",
    },
}];
