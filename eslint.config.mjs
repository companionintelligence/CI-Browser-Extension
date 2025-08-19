import eslintShared from "./eslint.shared.mjs";

export default [
  {
    ignores: [".yarn", "node_modules/**", ".output/**", ".wxt/**"],
  },

  ...eslintShared,
];
