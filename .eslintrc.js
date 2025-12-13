/**
 * ESLint Configuration
 * Enforces code style consistency across the project
 */

module.exports = {
    env: {
        node: true,
        es2021: true,
    },
    extends: "eslint:recommended",
    parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
    },
    plugins: ["sort-keys-fix"],
    overrides: [
        {
            // Browser environment for client-side scripts
            files: ["src/browser/*.js"],
            env: {
                browser: true,
                es2021: true,
            },
        },
        {
            // Frontend JavaScript files - enforce single quotes
            files: ["views/**/*.js"],
            env: {
                browser: true,
                es2021: true,
            },
            globals: {
                Vue: 'readonly',
                ElementPlus: 'readonly',
                toggleLanguage: 'readonly',
                switchSpecificAccount: 'readonly',
                updateContent: 'readonly',
            },
            rules: {
                'quotes': ['error', 'single', {
                    avoidEscape: true,
                    allowTemplateLiterals: true,
                }],
                'no-unused-vars': ['error', {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^(toggleLanguage|switchSpecificAccount|updateContent)$',
                }],
            },
        },
    ],
    rules: {
        // ==================== String Quoting ====================
        // Enforce double quotes for consistency with current codebase
        "quotes": ["error", "double", {
            avoidEscape: true,
            allowTemplateLiterals: true,
        }],

        // ==================== Arrow Functions ====================
        // Omit parentheses for single-parameter arrow functions
        "arrow-parens": ["error", "as-needed", {
            requireForBlockBody: false,
        }],

        // ==================== Indentation ====================
        // Enforce 4-space indentation throughout the project
        "indent": ["error", 4, {
            SwitchCase: 1,
            VariableDeclarator: 1,
            outerIIFEBody: 1,
            MemberExpression: 1,
            FunctionDeclaration: { parameters: 1, body: 1 },
            FunctionExpression: { parameters: 1, body: 1 },
            CallExpression: { arguments: 1 },
            ArrayExpression: 1,
            ObjectExpression: 1,
            ImportDeclaration: 1,
            flatTernaryExpressions: false,
            ignoreComments: false,
        }],

        // ==================== Semicolons ====================
        // Require semicolons at the end of statements
        "semi": ["error", "always"],

        // ==================== Trailing Commas ====================
        // Require trailing commas in multiline object/array literals
        "comma-dangle": ["error", {
            arrays: "always-multiline",
            objects: "always-multiline",
            imports: "never",
            exports: "never",
            functions: "never",
        }],

        // ==================== Spacing ====================
        // Enforce consistent spacing in objects and arrays
        "object-curly-spacing": ["error", "always"],
        "array-bracket-spacing": ["error", "never"],

        // Enforce spacing around keywords and blocks
        "keyword-spacing": ["error", { before: true, after: true }],
        "space-before-blocks": ["error", "always"],

        // Control spacing before function parentheses
        "space-before-function-paren": ["error", {
            anonymous: "always",
            named: "never",
            asyncArrow: "always",
        }],

        // Require spacing around infix operators
        "space-infix-ops": "error",

        // Disallow multiple empty lines
        "no-multiple-empty-lines": ["error", { "max": 1 }],

        // ==================== Code Quality ====================
        // Warn about unused variables to prevent dead code
        "no-unused-vars": ["error", {
            vars: "all",
            args: "after-used",
            ignoreRestSiblings: true,
        }],

        // Allow console statements (project uses custom logger)
        "no-console": "off",

        // Disallow var declarations, prefer const/let
        "no-var": "error",
        "prefer-const": ["error", {
            destructuring: "any",
            ignoreReadBeforeAssign: false,
        }],

        // ==================== Code Style ====================
        // Prefer concise arrow function syntax when possible
        "arrow-body-style": ["warn", "as-needed"],

        // Prefer object shorthand notation
        "object-shorthand": ["warn", "always"],

        // Disallow padding within blocks
        "padded-blocks": ["error", "never"],

        // Disallow trailing whitespace at the end of lines
        "no-trailing-spaces": "error",

        // Require newline at the end of files
        "eol-last": ["error", "always"],

        // Require operators to be placed before line breaks
        "operator-linebreak": ["error", "before"],

        // Require newlines between method chains (depth > 3)
        "newline-per-chained-call": ["error", { ignoreChainWithDepth: 3 }],

        // Maximum line length (disabled by default)
        "max-len": ["off", {
            code: 120,
            tabWidth: 4,
            ignoreComments: true,
            ignoreUrls: true,
            ignoreStrings: true,
            ignoreTemplateLiterals: true,
        }],

        // Enforce sorted object keys (fixable), run `npx eslint --fix .`
        "sort-keys-fix/sort-keys-fix": ["error", "asc", {
            caseSensitive: false, natural: true,
        }],
    },
};
