import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        editor: fileURLToPath(new URL("./index.html", import.meta.url)),
        featureZoo: fileURLToPath(
          new URL("./feature-zoo.html", import.meta.url),
        ),
      },
    },
  },
});
