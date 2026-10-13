import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completeness, parseV1Export, previewClients, selectClients } from "./v1-export";

const ws = JSON.parse(readFileSync(join(__dirname, "../fixtures/v1-workspace.json"), "utf8"));
/** Exactly what v1's «تصدير البيانات» button writes: localStorage keys with JSON-string values. */
const backup = {
  buad2_clients: JSON.stringify(ws.clients),
  buad2_projects: JSON.stringify(ws.projects),
  buad2_fin_p1: JSON.stringify(ws.fin.p1),
  buad2_fin_p2: JSON.stringify(ws.fin.p2),
  buad2_settings: JSON.stringify({ users: [{ password: "secret" }] }),
  buad2_custom_templates: "[]",
};

describe("parseV1Export", () => {
  it("reads the v1 backup file format", () => {
    const w = parseV1Export(JSON.stringify(backup));
    expect(w?.clients).toHaveLength(6);
    expect(w?.projects).toHaveLength(5);
    expect(Object.keys(w?.fin ?? {})).toEqual(["p1", "p2"]);
    expect(JSON.stringify(w)).not.toContain("secret"); // settings/users are never read
  });
  it("reads a raw workspace and a CLI snapshot", () => {
    expect(parseV1Export(ws)?.clients).toHaveLength(6);
    expect(parseV1Export({ workspace: JSON.stringify(ws) })?.projects).toHaveLength(5);
  });
  it("rejects files that are not v1 data", () => {
    expect(parseV1Export("not json")).toBeNull();
    expect(parseV1Export({ hello: 1 })).toBeNull();
    expect(parseV1Export([1, 2])).toBeNull();
  });
});

describe("selectClients", () => {
  it("keeps the chosen clients with all their projects and only their finance", () => {
    const w = parseV1Export(backup)!;
    const s = selectClients(w, ["c1"]);
    expect(s.clients.map((c) => c.id)).toEqual(["c1"]);
    expect(s.projects.map((p) => p.id).sort()).toEqual(["p1", "p3", "p5"]);
    expect(Object.keys(s.fin)).toEqual(["p1"]);
    expect(selectClients(w, "all").clients).toHaveLength(6);
  });
});

describe("previewClients", () => {
  it("ranks rich clients with several projects first and skips nameless ones", () => {
    const list = previewClients(parseV1Export(backup)!);
    expect(list.map((c) => c.id)).not.toContain("c5");
    expect(list[0]?.id).toBe("c1"); // 3 projects, varied statuses, values
    expect(list.find((c) => c.id === "c1")).toMatchObject({
      projectCount: 3,
      statuses: { active: 1, paused: 1, done: 1 },
    });
  });
  it("measures completeness of the client card", () => {
    expect(completeness({})).toBe(0);
    expect(
      completeness({
        type: "x",
        email: "a",
        phone: "1",
        city: "c",
        reg_no: "1",
        tax_no: "2",
        address: "a",
        contact: "s",
        website: "w",
        logo: "l",
      }),
    ).toBe(100);
  });
});
