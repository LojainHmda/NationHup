import type { Request } from "express";

/** Public origin for turning relative upload paths into absolute URLs (needed behind proxies / Replit / deploy). */
export function publicOriginFromRequest(req: Request): string {
  const env = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (env) return env;
  return `${req.protocol}://${req.get("host")}`;
}

export function resolveLogoUrlForApi(
  logoUrl: string | null | undefined,
  origin: string,
): string | null {
  if (logoUrl == null) return null;
  const t = String(logoUrl).trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  const base = origin.replace(/\/$/, "");
  if (t.startsWith("/")) return `${base}${t}`;
  return t;
}

export function withResolvedBrandLogo<T extends { logoUrl: string | null }>(
  brand: T,
  req: Request,
): T {
  const origin = publicOriginFromRequest(req);
  return {
    ...brand,
    logoUrl: resolveLogoUrlForApi(brand.logoUrl, origin),
  };
}
