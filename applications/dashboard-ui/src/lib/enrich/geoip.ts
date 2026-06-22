import "server-only";
import geoip from "geoip-lite";

export interface GeoResult {
  country: string | null;
  city: string | null;
  region: string | null;
  asn: number | null;
  org: string | null;
}

export function lookupGeo(ip: string | null | undefined): GeoResult {
  if (!ip) return { country: null, city: null, region: null, asn: null, org: null };
  const out = geoip.lookup(ip);
  if (!out) return { country: null, city: null, region: null, asn: null, org: null };
  return {
    country: out.country ?? null,
    city:    out.city    ?? null,
    region:  out.region  ?? null,
    asn:     null,  // geoip-lite doesn't ship ASN; MaxMind GeoLite2-ASN is the upgrade
    org:     null,
  };
}
