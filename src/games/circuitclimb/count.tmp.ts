import { createLevel, extendTo } from "./level.ts";
const level = createLevel(11, "classic"); extendTo(level, 30000);
const c: Record<string, number> = {}; for (const p of level.pads) c[p.kind + (p.route ? "R" : "")] = (c[p.kind + (p.route ? "R" : "")] ?? 0) + 1; console.log(c);
