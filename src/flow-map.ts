/**
 * Pure (no I/O) flow componentizer.
 *
 * Turns a Blip Builder flow definition (the bucket resource) into a structured
 * map and a set of small Markdown/JSON files — one per block — so a large flow
 * becomes browsable instead of one giant blob.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export interface FlowAction {
  kind: string;
  title: string;
}
export interface FlowRoute {
  when: string;
  target: string;
  targetLabel: string;
}
export interface FlowIncoming {
  from: string;
  fromLabel: string;
  when: string;
}
export interface FlowBlockInfo {
  key: string;
  blockId: string | undefined;
  title: string;
  type: "block" | "subflow" | "desk";
  root: boolean;
  capturesInto: string[];
  messages: string[];
  enteringActions: FlowAction[];
  leavingActions: FlowAction[];
  routes: FlowRoute[];
  incoming: FlowIncoming[];
}
export interface FlowMapResult {
  flowKey: string;
  blockCount: number;
  subflows: Record<string, string | null>;
  blocks: FlowBlockInfo[];
}

function blockType(key: string): "block" | "subflow" | "desk" {
  if (key.startsWith("subflow:")) return "subflow";
  if (key.startsWith("desk:")) return "desk";
  return "block";
}

function titleOf(flow: Any, key: string): string {
  const t = flow?.[key]?.$title;
  return typeof t === "string" && t ? t : key;
}

function labelOf(flow: Any, key: string): string {
  const t = titleOf(flow, key);
  const type = blockType(key);
  if (type === "subflow") return `SUBFLUXO "${t}"`;
  if (type === "desk") return `DESK "${t}"`;
  return `"${t}"`;
}

function fmtCondition(c: Any): string {
  if (!c || typeof c !== "object") return String(c);
  const variable = c.variable ?? c.source ?? "?";
  const comparison = c.comparison ?? "?";
  const values = Array.isArray(c.values) ? c.values.join(" | ") : c.values ?? "";
  return `${variable} ${comparison} [${values}]`;
}

function extractMessages(contentActions: Any, full: boolean): string[] {
  const out: string[] = [];
  for (const ca of Array.isArray(contentActions) ? contentActions : []) {
    const content = ca?.$cardContent ?? ca?.content ?? ca?.$content;
    if (content == null) continue;
    let text: string;
    if (typeof content === "string") text = content;
    else if (typeof content === "object")
      text = content.text ?? content.$content ?? content.title ?? JSON.stringify(content);
    else text = String(content);
    text = String(text).replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push(full ? text : text.slice(0, 140));
  }
  return out;
}

function extractCaptures(contentActions: Any): string[] {
  const out: string[] = [];
  for (const ca of Array.isArray(contentActions) ? contentActions : []) {
    const v = ca?.input?.variable;
    if (typeof v === "string" && v) out.push(v);
  }
  return out;
}

function extractActions(arr: Any): FlowAction[] {
  return (Array.isArray(arr) ? arr : []).map((a: Any) => ({
    kind: String(a?.type ?? a?.action?.type ?? "Action"),
    title: String(a?.$title ?? a?.name ?? ""),
  }));
}

function routesOf(block: Any, flow: Any): FlowRoute[] {
  const routes: FlowRoute[] = [];
  for (const o of Array.isArray(block?.$conditionOutputs) ? block.$conditionOutputs : []) {
    const conds = Array.isArray(o?.conditions) ? o.conditions.map(fmtCondition).join(" E ") : "(sem condição)";
    const target = String(o?.stateId ?? "?");
    routes.push({ when: conds, target, targetLabel: labelOf(flow, target) });
  }
  const def = block?.$defaultOutput;
  if (def && def.stateId) {
    routes.push({ when: "(default)", target: String(def.stateId), targetLabel: labelOf(flow, def.stateId) });
  }
  return routes;
}

function isBlock(v: Any): boolean {
  return (
    v != null &&
    typeof v === "object" &&
    ("$title" in v || "$conditionOutputs" in v || "$contentActions" in v || "$defaultOutput" in v)
  );
}

export function buildFlowMap(flowKey: string, resource: Any, options: { full?: boolean } = {}): FlowMapResult {
  const full = options.full ?? false;
  const entries = Object.entries(resource ?? {}).filter(([, v]) => isBlock(v));
  const subflows: Record<string, string | null> = {};
  const blocks: FlowBlockInfo[] = [];

  for (const [key, b] of entries as Array<[string, Any]>) {
    if (key.startsWith("subflow:")) subflows[key] = (b.$title as string) ?? null;
    blocks.push({
      key,
      blockId: typeof b.id === "string" ? b.id : undefined,
      title: titleOf(resource, key),
      type: blockType(key),
      root: Boolean(b.root),
      capturesInto: extractCaptures(b.$contentActions),
      messages: extractMessages(b.$contentActions, full),
      enteringActions: extractActions(b.$enteringCustomActions),
      leavingActions: extractActions(b.$leavingCustomActions),
      routes: routesOf(b, resource),
      incoming: [],
    });
  }

  // reverse edges
  const byKey = new Map(blocks.map((b) => [b.key, b]));
  for (const b of blocks) {
    for (const r of b.routes) {
      const tgt = byKey.get(r.target);
      if (tgt) tgt.incoming.push({ from: b.key, fromLabel: labelOf(resource, b.key), when: r.when });
    }
  }

  return { flowKey, blockCount: blocks.length, subflows, blocks };
}

function slugify(s: string): string {
  const out = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return out || "bloco";
}

function renderBlock(b: FlowBlockInfo): string {
  const lines: string[] = [];
  const tags = [b.type, b.root ? "raiz/entrada" : null].filter(Boolean).join(", ");
  lines.push(`# ${b.title}`, "");
  lines.push(`- key: \`${b.key}\``);
  if (b.blockId) lines.push(`- id: \`${b.blockId}\``);
  lines.push(`- tipo: ${tags}`, "");

  lines.push("## O que faz", "");
  lines.push(`**Mensagens enviadas:** ${b.messages.length ? "" : "—"}`);
  for (const m of b.messages) lines.push(`- ${m}`);
  lines.push("");
  lines.push(`**Captura entrada em:** ${b.capturesInto.length ? b.capturesInto.map((v) => `\`${v}\``).join(", ") : "—"}`);
  lines.push("");
  const acts = (label: string, arr: FlowAction[]): void => {
    lines.push(`**${label}:** ${arr.length ? "" : "—"}`);
    for (const a of arr) lines.push(`- ${a.kind}${a.title ? `: "${a.title}"` : ""}`);
    lines.push("");
  };
  acts("Ações ao entrar", b.enteringActions);
  acts("Ações ao sair", b.leavingActions);

  lines.push("## Saídas (roteamento)", "");
  if (b.routes.length === 0) lines.push("- (nenhuma saída)");
  for (const r of b.routes) lines.push(`- ${r.when === "(default)" ? "SENÃO (padrão)" : `SE ${r.when}`}  →  ${r.targetLabel}`);
  lines.push("");

  lines.push("## Entradas (quem aponta pra cá)", "");
  if (b.incoming.length === 0) lines.push("- (nenhum bloco aponta pra cá / ponto de entrada)");
  for (const inc of b.incoming) lines.push(`- ${inc.fromLabel}${inc.when === "(default)" ? " (padrão)" : ` (SE ${inc.when})`}`);
  lines.push("");
  lines.push("[← índice](../index.md)");
  return lines.join("\n");
}

/** Render the componentized files. Keys are relative paths under the flow folder. */
export function renderFlowFiles(map: FlowMapResult): Record<string, string> {
  const files: Record<string, string> = {};
  const used = new Map<string, number>();
  const fileOf = new Map<string, string>();
  for (const b of map.blocks) {
    const base = slugify(b.title || b.key);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    fileOf.set(b.key, `blocks/${n === 1 ? base : `${base}-${n}`}.md`);
  }

  const esc = (s: string): string => s.replace(/\|/g, "\|");
  const idx: string[] = [];
  idx.push(`# Flow: ${map.flowKey}`, "");
  idx.push(`Blocos: ${map.blockCount} · Subfluxos: ${Object.keys(map.subflows).length}`, "");
  idx.push("> Gerado por \`blip_map_flow\`. Reexecute após editar o fluxo no Builder.", "");

  idx.push("## Subfluxos", "");
  const subEntries = Object.entries(map.subflows);
  if (subEntries.length === 0) idx.push("- (nenhum)");
  for (const [id, name] of subEntries) idx.push(`- "${name ?? "(sem título)"}"  \`${id}\``);
  idx.push("");

  idx.push("## Blocos", "", "| Bloco | Tipo | Saídas | Entradas | Arquivo |", "|---|---|---|---|---|");
  for (const b of map.blocks) {
    const file = fileOf.get(b.key)!;
    const name = esc(b.title) + (b.root ? " (raiz)" : "");
    idx.push(`| ${name} | ${b.type} | ${b.routes.length} | ${b.incoming.length} | [${file}](${file}) |`);
  }
  idx.push("");

  idx.push("## Grafo (bloco → alvos)", "");
  for (const b of map.blocks) {
    const targets = b.routes.map((r) => r.targetLabel).join(", ") || "(sem saída)";
    idx.push(`- ${labelLink(b, fileOf)} → ${targets}`);
  }
  idx.push("");

  files["index.md"] = idx.join("\n");
  files["index.json"] = JSON.stringify(map, null, 2);
  for (const b of map.blocks) files[fileOf.get(b.key)!] = renderBlock(b);
  return files;
}

function labelLink(b: FlowBlockInfo, fileOf: Map<string, string>): string {
  const file = fileOf.get(b.key)!;
  return `[${b.title}](${file})`;
}
