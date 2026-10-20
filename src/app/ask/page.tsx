import { getScope } from "@/lib/scope";
import { libraryForScope } from "@/lib/ask/library";
import { providerStatus } from "@/lib/ai/provider";
import { districtMetrics } from "@/lib/queries/regional";
import { Page, PageHeader } from "@/components/ui";
import { AskPanel } from "@/components/AskPanel";

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const sp = await searchParams;
  const scope = await getScope(sp);
  const library = libraryForScope(scope);
  const provider = providerStatus();
  const mapDistricts = scope.role === "csiu" ? districtMetrics(scope).map((d) => ({ aun: d.aun, name: d.name, tiger_geoid: d.tiger_geoid, enrollment: d.enrollment, county: d.county })) : [];
  const initial = typeof sp.q === "string" ? sp.q : "";
  return (
    <Page wide>
      <PageHeader eyebrow="Ask a question" title="Ask the warehouse in plain language"
        sub={<>You get a chart or map, a table, and a few bullets — not a wall of text. Scope: <b>{scope.role === "csiu" ? "all districts" : scope.districtName}</b>{scope.role === "teacher" ? " · your rosters" : scope.role === "board" ? " · aggregates only" : ""}. {provider.live ? <>Free-form questions use <span className="kbd">{provider.model}</span>; example questions are answered deterministically.</> : <>Running without a model key: the example questions below always work; free-form questions need <span className="kbd">ANTHROPIC_API_KEY</span>.</>}</>} />
      <AskPanel library={library} role={scope.role} mapDistricts={mapDistricts} initialQuestion={initial} live={provider.live} />
    </Page>
  );
}
