/** @type {import('i18next-parser').UserConfig} */
export default {
  locales: ["it"],
  defaultNamespace: "common",
  namespaceSeparator: ":",
  keySeparator: ".",
  output: "src/locales/$LOCALE/$NAMESPACE.json",
  input: ["src/**/*.{ts,tsx}"],
  sort: true,
  createOldCatalogs: false,
  keepRemoved: true,
  resetDefaultValueLocale: "",
  failOnWarnings: false,
  verbose: false,
};
