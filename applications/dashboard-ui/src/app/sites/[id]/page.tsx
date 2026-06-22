import { notFound } from "next/navigation";
import Header from "@/components/Header";
import { getSite } from "@/lib/db/repo/sites";
import { latestProbesByKind, listProbes } from "@/lib/db/repo/probes";
import { listEvents } from "@/lib/db/repo/events";
import { getDemoOrgId } from "@/lib/db/repo/orgs";
import SiteDetailClient from "@/components/SiteDetailClient";
import type { Probe, Event, Site } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SitePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const site = getSite(getDemoOrgId(), id);
  if (!site) return notFound();

  const latest = latestProbesByKind(id);
  const probes = listProbes(id, 30);
  const events = listEvents(id, 50);

  return (
    <>
      <Header title={site.name} />
      <SiteDetailClient
        site={site as Site}
        latest={latest as Record<string, Probe>}
        initialProbes={probes as Probe[]}
        initialEvents={events as Event[]}
      />
    </>
  );
}
