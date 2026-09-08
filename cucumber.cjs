// Acceptance suite: Gherkin from spec.md's behavior pathways, executed
// against the running API and a real database.
//
// TypeScript is loaded via NODE_OPTIONS="--import tsx/esm" in the npm script
// rather than cucumber's `loader` option, which uses the --loader flag Node
// deprecated in v20.6.
module.exports = {
  default: {
    import: ['tests/features/steps/**/*.ts'],
    paths: ['tests/features/**/*.feature'],
    format: ['progress-bar', 'summary'],
    formatOptions: { snippetInterface: 'async-await' },
  },
};
