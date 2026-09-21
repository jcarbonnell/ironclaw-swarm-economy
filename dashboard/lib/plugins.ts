import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  PluginManifest,
  PluginRegistryEntry,
} from "@/types";

// ── Plugin discovery ─────────────────────────────────────────────────────────
// Server-side only. Scans dashboard/plugins/, reads each subfolder's
// manifest.json, validates it, and returns registry entries.
//
// Fully manifest-driven: the base has NO hardcoded knowledge of which plugins
// exist. It reads whatever folders are present and trusts their manifests. This
// is what will let the hosted base load a tenant's plugin it has never seen —
// discovery reads the folder, the manifest declares everything.
//
// Slice 6 is read-only: we discover and display. No loading, no lifecycle,
// no event routing (those are Fleet v0.2+).

// Plugins live inside the dashboard artifact. process.cwd() is the dashboard
// root when `next dev`/`next start` runs, so plugins/ resolves there.
const PLUGINS_DIR = join(process.cwd(), "plugins");

// The minimal fields a manifest MUST have to be considered valid. Template
// fields (fleet_shape, personalization, tags) are optional and not required.
function validateManifest(raw: unknown, source: string): PluginManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${source}: manifest is not a JSON object`);
  }
  const m = raw as Record<string, unknown>;
  const required = ["name", "version", "display_name", "description", "author"] as const;
  for (const field of required) {
    if (typeof m[field] !== "string" || (m[field] as string).length === 0) {
      throw new Error(`${source}: missing or invalid required field "${field}"`);
    }
  }
  // dependencies is required by the type but tolerated if absent — default it.
  const dependencies =
    typeof m.dependencies === "object" && m.dependencies !== null
      ? (m.dependencies as PluginManifest["dependencies"])
      : {};

  return {
    name: m.name as string,
    version: m.version as string,
    display_name: m.display_name as string,
    description: m.description as string,
    author: m.author as string,
    dependencies,
    // Optional template-shaped fields passed through as-is when present.
    fleet_shape: Array.isArray(m.fleet_shape) ? (m.fleet_shape as PluginManifest["fleet_shape"]) : undefined,
    personalization: Array.isArray(m.personalization) ? (m.personalization as PluginManifest["personalization"]) : undefined,
    tags: Array.isArray(m.tags) ? (m.tags as string[]) : undefined,
  };
}

export async function discoverPlugins(): Promise<PluginRegistryEntry[]> {
  let dirEntries: string[];
  try {
    dirEntries = await readdir(PLUGINS_DIR);
  } catch (err) {
    // plugins/ doesn't exist yet — that's a valid "no plugins" state, not an error.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const entries: PluginRegistryEntry[] = [];

  for (const name of dirEntries) {
    const pluginPath = join(PLUGINS_DIR, name);

    // Only consider directories (skip stray files like .DS_Store).
    try {
      const s = await stat(pluginPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    const manifestPath = join(pluginPath, "manifest.json");

    try {
      const rawText = await readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(rawText);
      const manifest = validateManifest(parsed, `${name}/manifest.json`);

      entries.push({
        manifest,
        status: "discovered",   // read-only slice: discovered, not loaded
        loadedAt: null,
        error: null,
        manifestPath: `plugins/${name}/manifest.json`,
      });
    } catch (err) {
      // A folder with a broken/missing manifest still appears in the registry,
      // marked errored — so the operator sees "this plugin is broken" rather
      // than it silently vanishing. Honest failure surfacing.
      entries.push({
        manifest: {
          name,
          version: "—",
          display_name: name,
          description: "Manifest could not be read or is invalid.",
          author: "—",
          dependencies: {},
        },
        status: "errored",
        loadedAt: null,
        error: err instanceof Error ? err.message : "Unknown manifest error",
        manifestPath: `plugins/${name}/manifest.json`,
      });
    }
  }

  // Stable order: errored first (they need attention), then alphabetical.
  entries.sort((a, b) => {
    if (a.status === "errored" && b.status !== "errored") return -1;
    if (b.status === "errored" && a.status !== "errored") return 1;
    return a.manifest.display_name.localeCompare(b.manifest.display_name);
  });

  return entries;
}