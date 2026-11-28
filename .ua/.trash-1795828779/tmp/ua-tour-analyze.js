#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    console.error('Usage: node ua-tour-analyze.js <input.json> <output.json>');
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read/parse input JSON: ${err.message}`);
    process.exit(1);
  }

  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const layers = Array.isArray(data.layers) ? data.layers : [];

  const nodeMap = new Map();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // A & B: Fan-in and Fan-out counts (counting distinct connected nodes or total edges pointing to/from)
  const fanInSets = new Map();
  const fanOutSets = new Map();
  const edgeTypeCounts = {};

  for (const n of nodes) {
    fanInSets.set(n.id, new Set());
    fanOutSets.set(n.id, new Set());
  }

  for (const e of edges) {
    edgeTypeCounts[e.type] = (edgeTypeCounts[e.type] || 0) + 1;
    if (e.source === e.target) continue;
    if (fanOutSets.has(e.source) && nodeMap.has(e.target)) {
      fanOutSets.get(e.source).add(e.target);
    }
    if (fanInSets.has(e.target) && nodeMap.has(e.source)) {
      fanInSets.get(e.target).add(e.source);
    }
  }

  const fanInList = nodes.map((n) => ({
    id: n.id,
    fanIn: fanInSets.get(n.id).size,
    name: n.name,
  }));
  fanInList.sort((a, b) => b.fanIn - a.fanIn || a.id.localeCompare(b.id));

  const fanOutList = nodes.map((n) => ({
    id: n.id,
    fanOut: fanOutSets.get(n.id).size,
    name: n.name,
  }));
  fanOutList.sort((a, b) => b.fanOut - a.fanOut || a.id.localeCompare(b.id));

  // Thresholds for entry point scoring
  const fanOutSorted = fanOutList.map((x) => x.fanOut).sort((a, b) => b - a);
  const top10Idx = Math.max(0, Math.floor(fanOutSorted.length * 0.1) - 1);
  const highFanOutThreshold = fanOutSorted.length > 0 ? Math.max(1, fanOutSorted[top10Idx]) : 1;

  const fanInSorted = fanInList.map((x) => x.fanIn).sort((a, b) => a - b);
  const bottom25Idx = Math.max(0, Math.floor(fanInSorted.length * 0.25) - 1);
  const lowFanInThreshold = fanInSorted.length > 0 ? fanInSorted[bottom25Idx] : 0;

  // C: Entry Point Candidates
  const ENTRY_FILENAMES = new Set([
    'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
    'server.ts', 'server.js', 'mod.rs', 'main.go', 'main.py', 'main.rs',
    'manage.py', 'app.py', 'wsgi.py', 'asgi.py', 'run.py', '__main__.py',
    'Application.java', 'Main.java', 'Program.cs', 'config.ru', 'index.php',
    'App.swift', 'Application.kt', 'main.cpp', 'main.c',
  ]);

  const entryPointScores = [];
  for (const n of nodes) {
    let score = 0;
    const fp = n.filePath || n.name || '';
    const base = path.basename(fp);
    const depth = fp ? fp.split('/').length : 99;

    if (n.type === 'document') {
      if (fp === 'README.md') {
        score += 5;
      } else if (!fp.includes('/') && fp.toLowerCase().endsWith('.md')) {
        score += 2;
      }
    } else if (n.type === 'file') {
      if (ENTRY_FILENAMES.has(base)) score += 3;
      if (depth <= 2) score += 1;
      if (fanOutSets.get(n.id).size >= highFanOutThreshold) score += 1;
      if (fanInSets.get(n.id).size <= lowFanInThreshold) score += 1;
    }

    if (score > 0) {
      entryPointScores.push({
        id: n.id,
        score,
        name: n.name,
        type: n.type,
        filePath: fp,
        summary: n.summary || '',
      });
    }
  }

  entryPointScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer README.md and src/main.ts cleanly on ties
    const aFanOut = fanOutSets.get(a.id).size;
    const bFanOut = fanOutSets.get(b.id).size;
    return bFanOut - aFanOut || a.id.localeCompare(b.id);
  });

  const entryPointCandidates = entryPointScores.slice(0, 5).map(({ id, score, name, summary }) => ({
    id,
    score,
    name,
    summary,
  }));

  // D: BFS Traversal from top code entry point (preferring file:src/main.ts if top/present)
  const codeCandidates = entryPointScores.filter((c) => c.type === 'file');
  let startNode = codeCandidates.length > 0 ? codeCandidates[0].id : null;
  if (nodeMap.has('file:src/main.ts')) {
    const mainCandidate = codeCandidates.find((c) => c.id === 'file:src/main.ts');
    if (!startNode || (mainCandidate && mainCandidate.score >= codeCandidates[0].score - 1)) {
      startNode = 'file:src/main.ts';
    }
  }

  const forwardAdj = new Map();
  for (const n of nodes) forwardAdj.set(n.id, new Set());
  for (const e of edges) {
    if ((e.type === 'imports' || e.type === 'calls') && nodeMap.has(e.source) && nodeMap.has(e.target)) {
      forwardAdj.get(e.source).add(e.target);
    }
  }

  const bfsOrder = [];
  const depthMap = {};
  const byDepth = {};

  if (startNode) {
    const visited = new Set([startNode]);
    const queue = [[startNode, 0]];
    while (queue.length > 0) {
      const [curr, d] = queue.shift();
      bfsOrder.push(curr);
      depthMap[curr] = d;
      const key = String(d);
      if (!byDepth[key]) byDepth[key] = [];
      byDepth[key].push(curr);

      const neighbors = Array.from(forwardAdj.get(curr) || []);
      // Deterministic order: higher fan-in first, then alphabetical
      neighbors.sort((a, b) => fanInSets.get(b).size - fanInSets.get(a).size || a.localeCompare(b));
      for (const nxt of neighbors) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push([nxt, d + 1]);
        }
      }
    }
  }

  // E: Non-Code File Inventory
  const nonCodeFiles = {
    documentation: [],
    infrastructure: [],
    data: [],
    config: [],
  };
  for (const n of nodes) {
    const item = { id: n.id, name: n.name, type: n.type, summary: n.summary || '' };
    if (n.type === 'document') {
      nonCodeFiles.documentation.push(item);
    } else if (n.type === 'service' || n.type === 'pipeline' || n.type === 'resource') {
      nonCodeFiles.infrastructure.push(item);
    } else if (n.type === 'table' || n.type === 'schema' || n.type === 'endpoint') {
      nonCodeFiles.data.push(item);
    } else if (n.type === 'config') {
      nonCodeFiles.config.push(item);
    }
  }

  // F: Tightly Coupled Clusters
  const codeAdjDir = new Map();
  const codeAdjUndir = new Map();
  const pairEdgeCount = new Map();

  for (const n of nodes) {
    codeAdjDir.set(n.id, new Set());
    codeAdjUndir.set(n.id, new Set());
  }

  for (const e of edges) {
    if (e.source === e.target) continue;
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    codeAdjDir.get(e.source).add(e.target);
    codeAdjUndir.get(e.source).add(e.target);
    codeAdjUndir.get(e.target).add(e.source);
    const pairKey = [e.source, e.target].sort().join('||');
    pairEdgeCount.set(pairKey, (pairEdgeCount.get(pairKey) || 0) + 1);
  }

  // Find bidirectional pairs first
  const seedPairs = [];
  const seenPairs = new Set();
  for (const [u, targets] of codeAdjDir.entries()) {
    for (const v of targets) {
      if (codeAdjDir.get(v) && codeAdjDir.get(v).has(u)) {
        const key = [u, v].sort().join('||');
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          seedPairs.push([u, v].sort());
        }
      }
    }
  }

  // Also include high-weight pairs (multiple edges between them) as secondary seeds if needed
  const heavyPairs = Array.from(pairEdgeCount.entries())
    .filter(([k, cnt]) => cnt >= 2 && !seenPairs.has(k))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([k]) => k.split('||'));

  const allSeeds = [...seedPairs, ...heavyPairs];

  const rawClusters = [];
  const seenClusterSigs = new Set();

  for (const [a, b] of allSeeds) {
    const cluster = new Set([a, b]);
    // Expand by adding nodes connected to 2+ existing cluster members, up to 5 nodes
    let added = true;
    while (added && cluster.size < 5) {
      added = false;
      const candidates = new Map();
      for (const m of cluster) {
        for (const nb of codeAdjUndir.get(m) || []) {
          if (cluster.has(nb)) continue;
          if (nodeMap.get(nb).type !== 'file') continue;
          candidates.set(nb, (candidates.get(nb) || 0) + 1);
        }
      }
      let best = null;
      let bestConn = 1;
      for (const [cand, conn] of candidates.entries()) {
        if (conn >= 2 && conn > bestConn) {
          bestConn = conn;
          best = cand;
        }
      }
      if (best) {
        cluster.add(best);
        added = true;
      }
    }

    const sortedNodes = Array.from(cluster).sort();
    const sig = sortedNodes.join('|');
    if (seenClusterSigs.has(sig)) continue;
    seenClusterSigs.add(sig);

    // Count edges internal to this cluster
    let internalEdges = 0;
    for (const e of edges) {
      if (cluster.has(e.source) && cluster.has(e.target) && e.source !== e.target) {
        internalEdges++;
      }
    }

    rawClusters.push({
      nodes: sortedNodes,
      edgeCount: internalEdges,
      bidirectionalSeed: seenPairs.has([a, b].sort().join('||')),
    });
  }

  // Deduplicate overlapping clusters greedily to get diverse top clusters
  rawClusters.sort((a, b) => {
    if (b.bidirectionalSeed !== a.bidirectionalSeed) return b.bidirectionalSeed ? 1 : -1;
    return b.edgeCount - a.edgeCount || b.nodes.length - a.nodes.length;
  });

  const clusters = [];
  const coveredNodes = new Set();
  for (const c of rawClusters) {
    const overlap = c.nodes.filter((id) => coveredNodes.has(id)).length;
    if (overlap >= Math.ceil(c.nodes.length / 2) && clusters.length >= 3) continue;
    clusters.push({ nodes: c.nodes, edgeCount: c.edgeCount });
    for (const id of c.nodes) coveredNodes.add(id);
    if (clusters.length >= 10) break;
  }

  // G: Layer List
  const layerSummary = {
    count: layers.length,
    list: layers.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description || '',
    })),
  };

  // H: Node Summary Index
  const nodeSummaryIndex = {};
  for (const n of nodes) {
    nodeSummaryIndex[n.id] = {
      name: n.name,
      type: n.type,
      filePath: n.filePath || '',
      summary: n.summary || '',
    };
  }

  const results = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking: fanInList.slice(0, 20),
    fanOutRanking: fanOutList.slice(0, 20),
    bfsTraversal: {
      startNode,
      reachableCount: bfsOrder.length,
      order: bfsOrder,
      depthMap,
      byDepth,
    },
    nonCodeFiles,
    clusters,
    layers: layerSummary,
    nodeSummaryIndex,
    edgeTypeCounts,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.error(`Failed to write output JSON: ${err.message}`);
    process.exit(1);
  }
}

main();
