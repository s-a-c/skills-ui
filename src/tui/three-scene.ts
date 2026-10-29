/**
 * 3D skills graph scene (S-100 B6) — dynamically imported by Views.tsx so
 * the app (and its tests) never load @opentui/three unless the graph view
 * opens; a failed import degrades to the plain fallback view. Bun-only per
 * the package contract.
 *
 * Graph model: one node per visible skill on a fibonacci sphere, colored
 * by source (same hash family as the search badges); consecutive skills
 * sharing an agent are chained — the agent cohesion is the structure.
 */
import { THREE, ThreeRenderable } from "@opentui/three";
import type { CliRenderer } from "@opentui/core";
import { hexToRgb, CATPPUCCIN_MOCHA, CATPPUCCIN_LATTE, type ThemeName } from "../core/theme.ts";
import type { InstalledSkill } from "../core/services/types.ts";

// React's prop application assigns every prop onto the constructed
// instance; ThreeRenderable exposes readonly members (scene, camera,
// renderer), so JSX construction throws. Build it imperatively instead —
// createThreeView below — and host it on a plain React <box>.

export { THREE };

const ACCENTS = ["mauve", "pink", "blue", "sapphire", "teal", "green", "peach", "yellow"] as const;

function hash32(text: string): number {
  let h = 2166136261;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SkillGraph {
  /** Snapshot identity — theme + skill names — for cheap rebuild checks. */
  readonly key: string;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Rotation source driven by the timeline; `angle` is the only number. */
  readonly animTarget: { angle: number };
  applyRotation(): void;
  dispose(): void;
}

/** Ambient rotation period — one full turn; slow enough to read labels. */
export const GRAPH_ROTATION_MS = 60_000;

/**
 * The view is a per-renderer singleton and is NEVER destroyed by the app:
 * destroying a ThreeRenderable whose WebGPU init never completed (pty,
 * ssh, no-GPU) crashes the renderer during dispose — the upstream
 * early-destruction limit. Instead the view detaches from its host on
 * close (detached renderables skip drawing) and reattaches on reopen;
 * the engine destroys itself with the host renderer at app teardown.
 * A changed skill set swaps the scene via setScene — superseded scenes
 * are intentionally NOT disposed (the three renderer's node cache can
 * still reference them; the leak is bounded by distinct skill sets).
 */
export interface GraphViewHandle {
  view: ThreeRenderable;
  graph: SkillGraph;
}

const views = new WeakMap<CliRenderer, GraphViewHandle>();

export function getGraphView(renderer: CliRenderer, skills: InstalledSkill[], theme: ThemeName): GraphViewHandle {
  let handle = views.get(renderer);
  if (!handle) {
    const graph = buildSkillGraph(skills, theme);
    const view = new ThreeRenderable(renderer, {
      width: "100%",
      height: "100%",
      scene: graph.scene,
      camera: graph.camera,
      renderer: { focalLength: 8, alpha: true },
    });
    handle = { view, graph };
    views.set(renderer, handle);
    return handle;
  }
  const key = `${theme}:${skills.length}:${skills.map((s) => s.name).join(",")}`;
  if (handle.graph.key !== key) {
    const graph = buildSkillGraph(skills, theme);
    handle.view.setScene(graph.scene);
    handle.view.setActiveCamera(graph.camera);
    handle.graph = graph;
  }
  return handle;
}

export function buildSkillGraph(skills: InstalledSkill[], theme: ThemeName): SkillGraph {
  const palette = theme === "latte" ? CATPPUCCIN_LATTE : CATPPUCCIN_MOCHA;

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);

  const count = Math.max(1, skills.length);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const R = 1.3;
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * radius * R;
    positions[i * 3 + 1] = y * R;
    positions[i * 3 + 2] = Math.sin(theta) * radius * R;
    const skill = skills[i];
    const key = skill?.source ?? skill?.agents[0] ?? skill?.name ?? "local";
    const accent = palette[ACCENTS[hash32(key) % ACCENTS.length]!];
    const [r, g, b] = hexToRgb(accent);
    const color = new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ vertexColors: true, size: 0.09, sizeAttenuation: true });
  group.add(new THREE.Points(geometry, material));

  // agent chains: consecutive skills of the same agent are linked, capped
  // so the densest scopes stay readable
  const byAgent = new Map<string, number[]>();
  skills.forEach((skill, i) => {
    for (const agent of skill.agents) {
      const list = byAgent.get(agent) ?? [];
      list.push(i);
      byAgent.set(agent, list);
    }
  });
  const edgePoints: number[] = [];
  const [lr, lg, lb] = hexToRgb(palette.overlay0);
  const lineGeometry = new THREE.BufferGeometry();
  for (const indices of byAgent.values()) {
    for (let k = 0; k + 1 < indices.length && edgePoints.length < 1200; k++) {
      const a = indices[k]!;
      const b = indices[k + 1]!;
      edgePoints.push(positions[a * 3]!, positions[a * 3 + 1]!, positions[a * 3 + 2]!, positions[b * 3]!, positions[b * 3 + 1]!, positions[b * 3 + 2]!);
    }
  }
  if (edgePoints.length > 0) {
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edgePoints), 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(lr / 255, lg / 255, lb / 255).convertSRGBToLinear(),
      transparent: true,
      opacity: 0.35,
    });
    group.add(new THREE.LineSegments(lineGeometry, lineMaterial));
  }

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.6, 3.4);
  camera.lookAt(0, 0, 0);

  const animTarget = { angle: 0 };
  const key = `${theme}:${skills.length}:${skills.map((s) => s.name).join(",")}`;
  return {
    key,
    scene,
    camera,
    animTarget,
    applyRotation(): void {
      group.rotation.y = animTarget.angle;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      scene.clear();
    },
  };
}
