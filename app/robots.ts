import type { MetadataRoute } from "next";

// Public pages can be indexed; projects, settings and the API belong to their owners.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/p/", "/home", "/settings", "/api/", "/new", "/start", "/demo", "/auth/"] },
  };
}
