import eslintShared from "./eslint.shared.mjs";

export default [
  {
    ignores: [
      ".yarn",
      "node_modules/**",
      ".output/**",
      ".wxt/**",
      // Agent worktrees: full checkouts with their own node_modules.
      ".claude/**",
      "store-assets/**",
      // Compact zero-dep gate copied from CI-Common; prettier would rewrite
      // it out of the v5 shape other repos sync. Style-canon-lint runs it.
      "scripts/lint-canon.mjs",
    ],
  },

  ...eslintShared,
];
