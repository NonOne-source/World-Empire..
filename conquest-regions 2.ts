// Shared between worker.ts (server, validates attacks/fortify) and conquest-globe.tsx (client,
// renders filled territories). Both sides import the same world-atlas topology and run the exact
// same pure functions here, so they always agree — nothing needs to be transmitted over the wire
// except the final computed adjacency, which the server includes once in game state.

export interface RegionDef {
  id: string;
  name: string;
  continent: string;
  aliases?: string[]; // alternate English names, in case Natural Earth's exact spelling differs
}

// 43 large, internationally recognizable countries used directly as territories — chosen instead
// of hand-merged multi-country blobs because matching a single well-known country name against
// real map data is far more reliable than manually curating and merging borders.
export const REGION_DEFS: RegionDef[] = [
  // North America
  { id: "canada", name: "Canada", continent: "North America" },
  { id: "usa", name: "United States of America", continent: "North America", aliases: ["United States"] },
  { id: "mexico", name: "Mexico", continent: "North America" },
  { id: "greenland", name: "Greenland", continent: "North America" },
  { id: "cuba", name: "Cuba", continent: "North America" },
  { id: "guatemala", name: "Guatemala", continent: "North America" },
  { id: "panama", name: "Panama", continent: "North America" },
  // South America
  { id: "brazil", name: "Brazil", continent: "South America" },
  { id: "argentina", name: "Argentina", continent: "South America" },
  { id: "peru", name: "Peru", continent: "South America" },
  { id: "colombia", name: "Colombia", continent: "South America" },
  { id: "chile", name: "Chile", continent: "South America" },
  { id: "bolivia", name: "Bolivia", continent: "South America" },
  // Europe
  { id: "russia", name: "Russia", continent: "Europe", aliases: ["Russian Federation"] },
  { id: "france", name: "France", continent: "Europe" },
  { id: "germany", name: "Germany", continent: "Europe" },
  { id: "spain", name: "Spain", continent: "Europe" },
  { id: "italy", name: "Italy", continent: "Europe" },
  { id: "poland", name: "Poland", continent: "Europe" },
  { id: "ukraine", name: "Ukraine", continent: "Europe" },
  { id: "sweden", name: "Sweden", continent: "Europe" },
  // Africa
  { id: "algeria", name: "Algeria", continent: "Africa" },
  { id: "egypt", name: "Egypt", continent: "Africa" },
  { id: "libya", name: "Libya", continent: "Africa" },
  { id: "sudan", name: "Sudan", continent: "Africa" },
  { id: "nigeria", name: "Nigeria", continent: "Africa" },
  { id: "drc", name: "Democratic Republic of the Congo", continent: "Africa", aliases: ["Dem. Rep. Congo", "Congo, Dem. Rep."] },
  { id: "southafrica", name: "South Africa", continent: "Africa" },
  { id: "ethiopia", name: "Ethiopia", continent: "Africa" },
  { id: "kenya", name: "Kenya", continent: "Africa" },
  // Asia
  { id: "china", name: "China", continent: "Asia" },
  { id: "india", name: "India", continent: "Asia" },
  { id: "kazakhstan", name: "Kazakhstan", continent: "Asia" },
  { id: "mongolia", name: "Mongolia", continent: "Asia" },
  { id: "saudiarabia", name: "Saudi Arabia", continent: "Asia" },
  { id: "iran", name: "Iran", continent: "Asia" },
  { id: "indonesia", name: "Indonesia", continent: "Asia" },
  { id: "pakistan", name: "Pakistan", continent: "Asia" },
  { id: "myanmar", name: "Myanmar", continent: "Asia" },
  { id: "turkey", name: "Turkey", continent: "Asia" },
  // Oceania
  { id: "australia", name: "Australia", continent: "Oceania" },
  { id: "papuanewguinea", name: "Papua New Guinea", continent: "Oceania" },
  { id: "newzealand", name: "New Zealand", continent: "Oceania" },
];

export const CONTINENT_BONUS: Record<string, number> = {
  "North America": 3,
  "South America": 2,
  "Europe": 3,
  "Africa": 3,
  "Asia": 4,
  "Oceania": 1,
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeArc(i: number): number {
  return i < 0 ? ~i : i;
}

// Collects every arc index used by a topology geometry, regardless of Polygon/MultiPolygon nesting.
function collectArcIndices(geom: any): number[] {
  const rings: number[][] = geom.type === "Polygon" ? geom.arcs : geom.arcs.flat();
  const out: number[] = [];
  for (const ring of rings) for (const a of ring) out.push(normalizeArc(a));
  return out;
}

interface FullGraph {
  neighbors: Map<number, Set<number>>;
  geometries: any[];
}

// Builds a country-to-country adjacency graph for the ENTIRE topology (all ~177 countries in the
// 110m dataset), based on shared topology arcs (two countries that draw part of their border from
// the same arc share that border in reality). This is the same trick GIS tools use to derive
// adjacency without a separate borders dataset.
function buildFullGraph(topology: any): FullGraph {
  const geometries: any[] = topology.objects.countries.geometries;
  const arcSets = geometries.map((g) => new Set(collectArcIndices(g)));
  const neighbors = new Map<number, Set<number>>();
  geometries.forEach((_, i) => neighbors.set(i, new Set()));

  for (let i = 0; i < geometries.length; i++) {
    for (let j = i + 1; j < geometries.length; j++) {
      let shares = false;
      for (const a of arcSets[i]) {
        if (arcSets[j].has(a)) {
          shares = true;
          break;
        }
      }
      if (shares) {
        neighbors.get(i)!.add(j);
        neighbors.get(j)!.add(i);
      }
    }
  }
  return { neighbors, geometries };
}

function findGeometryIndex(geometries: any[], def: RegionDef): number | null {
  const candidates = [def.name, ...(def.aliases ?? [])].map(normalize);
  for (let i = 0; i < geometries.length; i++) {
    const gName = normalize(geometries[i].properties?.name ?? "");
    if (candidates.includes(gName)) return i;
  }
  // Defensive fallback: partial match, in case the exact source string differs slightly.
  for (let i = 0; i < geometries.length; i++) {
    const gName = normalize(geometries[i].properties?.name ?? "");
    if (candidates.some((c) => gName.includes(c) || c.includes(gName))) return i;
  }
  return null;
}

export interface RegionMatch {
  regionToGeomIndex: Record<string, number>;
  matchedRegionIds: string[];
}

// Matches each curated RegionDef to an actual country in the topology by name. Regions that fail
// to match (e.g. a naming mismatch) are silently excluded rather than breaking the game.
export function matchRegions(topology: any, defs: RegionDef[] = REGION_DEFS): RegionMatch {
  const geometries: any[] = topology.objects.countries.geometries;
  const regionToGeomIndex: Record<string, number> = {};
  const matchedRegionIds: string[] = [];
  for (const def of defs) {
    const idx = findGeometryIndex(geometries, def);
    if (idx !== null) {
      regionToGeomIndex[def.id] = idx;
      matchedRegionIds.push(def.id);
    }
  }
  return { regionToGeomIndex, matchedRegionIds };
}

// For every matched region, walks the FULL country graph and "collapses" chains of unselected
// countries: if Germany and Poland are both regions but Czech Republic sits between them and isn't
// a region, Germany and Poland still end up adjacent. Search depth is capped so this stays
// geographically sensible rather than linking countries across a continent.
export function computeRegionAdjacency(topology: any, match: RegionMatch): Record<string, string[]> {
  const { neighbors } = buildFullGraph(topology);
  const geomIndexToRegion = new Map<number, string>();
  for (const [regionId, idx] of Object.entries(match.regionToGeomIndex)) geomIndexToRegion.set(idx, regionId);

  const adjacency: Record<string, string[]> = {};
  for (const regionId of match.matchedRegionIds) {
    const startIdx = match.regionToGeomIndex[regionId];
    const found = new Set<string>();
    const visited = new Set<number>([startIdx]);
    let frontier = [startIdx];
    let hops = 0;
    while (frontier.length > 0 && hops < 4 && found.size < 12) {
      const next: number[] = [];
      for (const idx of frontier) {
        for (const n of neighbors.get(idx) ?? []) {
          if (visited.has(n)) continue;
          visited.add(n);
          const otherRegion = geomIndexToRegion.get(n);
          if (otherRegion && otherRegion !== regionId) {
            found.add(otherRegion);
          } else {
            next.push(n);
          }
        }
      }
      frontier = next;
      hops++;
    }
    adjacency[regionId] = [...found];
  }
  return adjacency;
}

export function regionDefById(id: string): RegionDef | undefined {
  return REGION_DEFS.find((d) => d.id === id);
}
