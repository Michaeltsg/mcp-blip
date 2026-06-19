import { describe, it, expect } from "vitest";
import { buildFlowMap, renderFlowFiles } from "../src/flow-map.js";

const sample: Record<string, unknown> = {
  onboarding: {
    $title: "Início",
    id: "onboarding",
    root: true,
    $contentActions: [{ input: { variable: "inicio" } }],
    $leavingCustomActions: [{ type: "ProcessHttp", $title: "Consultar contato" }],
    $conditionOutputs: [
      { stateId: "subflow:abc", conditions: [{ source: "input", comparison: "exists", values: [] }] },
    ],
    $defaultOutput: { stateId: "subflow:exc" },
  },
  "subflow:abc": { $title: "Fila", id: "x", $conditionOutputs: [], $defaultOutput: { stateId: "onboarding" } },
  "subflow:exc": { $title: "Exception" },
};

describe("buildFlowMap", () => {
  it("extracts blocks, captures, actions, routes and subflows", () => {
    const map = buildFlowMap("flowkey", sample);
    expect(map.blockCount).toBe(3);
    const inicio = map.blocks.find((b) => b.key === "onboarding")!;
    expect(inicio.title).toBe("Início");
    expect(inicio.root).toBe(true);
    expect(inicio.capturesInto).toEqual(["inicio"]);
    expect(inicio.leavingActions[0]).toEqual({ kind: "ProcessHttp", title: "Consultar contato" });
    expect(inicio.routes[0]!.targetLabel).toContain("Fila");
    expect(inicio.routes.at(-1)!.when).toBe("(default)");
    expect(map.subflows["subflow:abc"]).toBe("Fila");
  });

  it("computes reverse (incoming) edges", () => {
    const map = buildFlowMap("k", sample);
    const exc = map.blocks.find((b) => b.key === "subflow:exc")!;
    expect(exc.incoming.some((i) => i.from === "onboarding")).toBe(true);
  });
});

describe("renderFlowFiles", () => {
  it("produces an index plus one file per block", () => {
    const files = renderFlowFiles(buildFlowMap("k", sample));
    expect(files["index.md"]).toContain("# Flow: k");
    expect(files["index.json"]).toContain("blockCount");
    const blockFiles = Object.keys(files).filter((p) => p.startsWith("blocks/"));
    expect(blockFiles.length).toBe(3);
    expect(JSON.stringify(files)).toContain("Saídas (roteamento)");
  });
});
