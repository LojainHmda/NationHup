import type { Brand } from "@shared/schema";

/**
 * Effective logo URL for display. Handles API absolute URLs, relative `/uploads/...`,
 * and legacy `logo_url` if ever present in JSON.
 */
export function getBrandLogoDisplayUrl(brand: Brand): string | null {
  const raw =
    brand.logoUrl ??
    (brand as unknown as { logo_url?: string | null }).logo_url;
  if (raw == null || raw === "") return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || t.startsWith("//")) return t.startsWith("//") ? `https:${t}` : t;
  if (t.startsWith("/") && typeof window !== "undefined") {
    const envBase = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
    const base = (envBase || window.location.origin).replace(/\/$/, "");
    return `${base}${t}`;
  }
  return t;
}
