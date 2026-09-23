import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  outDir: "out",
  // VS Code loads extensions as CommonJS and provides `vscode` at runtime.
  format: ["cjs"],
  target: "node20",
  external: ["vscode"],
  clean: true,
  sourcemap: true,
});
