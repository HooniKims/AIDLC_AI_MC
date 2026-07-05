import { createApp } from "./index.mjs";

export function createVercelApiHandler(routePath, options = {}) {
  const app = createApp(options);

  return function handler(request, response) {
    if (request.url === "/" || request.url?.startsWith("/?")) {
      const query = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
      request.url = `${routePath}${query}`;
    }

    return app(request, response);
  };
}
