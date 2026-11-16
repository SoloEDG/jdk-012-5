// 仅用于 Node 直接运行 TS 测试：为 Vite 风格的无扩展名相对导入补 .ts。
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[a-zA-Z0-9]+$/.test(specifier)
  ) {
    const base = new URL(specifier, context.parentURL);
    const path = fileURLToPath(base);
    for (const candidate of [`${path}.ts`, `${path}/index.ts`]) {
      if (existsSync(candidate))
        return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
