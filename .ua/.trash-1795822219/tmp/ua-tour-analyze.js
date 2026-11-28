#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ENTRY_FILENAMES = new Set([
  'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
  'server.ts', 'server.js', 'mod.rs', 'main.go', 'main.py', 'main.rs',
  'manage.py', 'app.py', 'wsgi.py', 'asgi.py', 'run.py', '__main__.py',
  'Application.java', 'Main.java', 'Program.cs', 'config.ru', 'index.php',
  'App.swift', 'Application.kt', 'main.cpp', 'main.c'
]);

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

  // A & B: Fan-in and Fan-out counts
  const fanIn = new Map();
  const fanOut = new Map();
  for (const n of nodes) {
    fanIn.set(n.id, 0);
    fanOut.set(n.id, 0);
  }

  const validEdges = [];
  for (const e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    validEdges.push(e);
    fanOut.set(e.source, (fanOut.get(e.source) || 0) + 1);
    fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1);
  }

  const fanInRanking = [...nodes]
    .map((n) => ({ id: n.id, fanIn: fanIn.get(n.id) || 0, name: n.name }))
    .sort((a, b) => b.fanIn - a.fanIn || a.id.localeCompare(b.id))
    .slice(0, 20);

  const fanOutRanking = [...nodes]
    .map((n) => ({ id: n.id, fanOut: fanOut.get(n.id) || 0, name: n.name }))
    .sort((a, b) => b.fanOut - a.fanOut || a.id.localeCompare(b.id))
    .slice(0, 20);

  // Thresholds for entry point scoring
  const codeNodes = nodes.filter((n) => n.type === 'file');
  const sortedFanOutVals = codeNodes.map((n) => fanOut.get(n.id) || 0).sort((a, b) => a - b);
  const sortedFanInVals = codeNodes.map((n) => fanIn.get(n.id) || 0).sort((a, b) => a - b);

  const top10FanOutThreshold = sortedFanOutVals.length > 0
    ? sortedFanOutVals[Math.floor(sortedFanOutVals.length * 0.9)]
    : Infinity;
  const bottom25FanInThreshold = sortedFanInVals.length > 0
    ? sortedFanInVals[Math.floor(sortedFanInVals.length * 0.25)]
    : 0;

  // C: Entry Point Candidates
  const scoredCandidates = [];
  for (const n of nodes) {
    let score = 0;
    const fp = (n.filePath || n.name || '').replace(/^\.\//, '');
    const parts = fp.split('/').filter(Boolean);
    const basename = parts[parts.length - 1] || n.name;

    if (n.type === 'document') {
      if (fp === 'README.md') {
        score += 5;
      } else if (parts.length === 1 && basename.toLowerCase().endsWith('.md')) {
        score += 2;
      }
    } else if (n.type === 'file') {
      if (ENTRY_FILENAMES.has(basename)) score += 3;
      if (parts.length <= 2) score += 1;
      if ((fanOut.get(n.id) || 0) >= top10FanOutThreshold && (fanOut.get(n.id) || 0) > 0) score += 1;
      if ((fanIn.get(n.id) || 0) <= bottom25FanInThreshold) score += 1;
    }

    if (score > 0) {
      scoredCandidates.push({
        id: n.id,
        type: n.type,
        score,
        name: n.name,
        filePath: n.filePath,
        summary: n.summary || ''
      });
    }
  }

  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer root README, then src/main.ts, then higher fan-out
    if (a.id === 'document:README.md') return -1;
    if (b.id === 'document:README.md') return 1;
    const foDiff = (fanOut.get(b.id) || 0) - (fanOut.get(a.id) || 0);
    if (foDiff !== 0) return foDiff;
    return a.id.localeCompare(b.id);
  });

  const entryPointCandidates = scoredCandidates.slice(0, 5);

  // D: BFS from top code entry point (following imports and calls edges forward)
  const topCodeCandidate = scoredCandidates.find((c) => c.type === 'file');
  const startNode = nodeMap.has('file:src/main.ts')
    ? 'file:src/main.ts'
    : (topCodeCandidate ? topCodeCandidate.id : (codeNodes[0] ? codeNodes[0].id : null));

  const adjForward = new Map();
  for (const n of nodes) adjForward.set(n.id, new Set());
  for (const e of validEdges) {
    if (e.type === 'imports' || e.type === 'calls') {
      adjForward.get(e.source).add(e.target);
    }
  }

  const bfsOrder = [];
  const depthMap = {};
  const byDepth = {};

  if (startNode) {
    const queue = [startNode];
    depthMap[startNode] = 0;
    while (queue.length > 0) {
      const curr = queue.shift();
      const d = depthMap[curr];
      bfsOrder.push(curr);
      if (!byDepth[String(d)]) byDepth[String(d)] = [];
      byDepth[String(d)].push(curr);

      const neighbors = [...(adjForward.get(curr) || [])].sort(
        (a, b) => (fanIn.get(b) || 0) - (fanIn.get(a) || 0) || a.localeCompare(b)
      );
      for (const next of neighbors) {
        if (depthMap[next] === undefined) {
          depthMap[next] = d + 1;
          queue.push(next);
        }
      }
    }
  }

  // E: Non-Code File Inventory
  const nonCodeFiles = {
    documentation: [],
    infrastructure: [],
    data: [],
    config: []
  };

  for (const n of nodes) {
    const entry = {
      id: n.id,
      name: n.name,
      type: n.type,
      filePath: n.filePath,
      summary: n.summary || ''
    };
    if (n.type === 'document') {
      nonCodeFiles.documentation.push(entry);
    } else if (n.type === 'service' || n.type === 'pipeline' || n.type === 'resource') {
      nonCodeFiles.infrastructure.push(entry);
    } else if (n.type === 'table' || n.type === 'schema' || n.type === 'endpoint') {
      nonCodeFiles.data.push(entry);
    } else if (n.type === 'config') {
      nonCodeFiles.config.push(entry);
    }
  }

  // F: Tightly Coupled Clusters
  // Find bidirectional imports/calls pairs, then expand with nodes connected to 2+ existing cluster members
  const dirPairs = new Map();
  const undirAdj = new Map();
  for (const n of nodes) undirAdj.set(n.id, new Map());

  for (const e of validEdges) {
    if (e.source === e.target) continue;
    const key = `${e.source}-->${e.target}`;
    dirPairs.set(key, (dirPairs.get(key) || 0) + 1);

    const aMap = undirAdj.get(e.source);
    aMap.set(e.target, (aMap.get(e.target) || 0) + 1);
    const bMap = undirAdj.get(e.target);
    bMap.set(e.source, (bMap.get(e.source) || 0) + 1);
  }

  const bidirSeeds = [];
  const seenPairs = new Set();
  for (const e of validEdges) {
    if (e.source === e.target) continue;
    if (e.type !== 'imports' && e.type !== 'calls') continue;
    const rev = `${e.target}-->${e.source}`;
    if (dirPairs.has(rev)) {
      const pairKey = [e.source, e.target].sort().join('||');
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        bidirSeeds.push([e.source, e.target]);
      }
    }
  }

  function countInternalEdges(nodeSet) {
    let count = 0;
    for (const e of validEdges) {
      if (nodeSet.has(e.source) && nodeSet.has(e.target) && e.source !== e.target) {
        count++;
      }
    }
    return count;
  }

  const rawClusters = [];
  const usedClusterKeys = new Set();

  function buildClusterFromSeed(seedNodes) {
    const cluster = new Set(seedNodes);
    let expanded = true;
    while (expanded && cluster.size < 5) {
      expanded = false;
      let bestCandidate = null;
      let bestScore = 0;
      for (const n of nodes) {
        if (cluster.has(n.id)) continue;
        const neighbors = undirAdj.get(n.id);
        let memberLinks = 0;
        let totalWeight = 0;
        for (const m of cluster) {
          if (neighbors.has(m)) {
            memberLinks++;
            totalWeight += neighbors.get(m);
          }
        }
        if (memberLinks >= 2 && totalWeight > bestScore) {
          bestScore = totalWeight;
          bestCandidate = n.id;
        }
      }
      if (bestCandidate) {
        cluster.add(bestCandidate);
        expanded = true;
      }
    }
    const sorted = [...cluster].sort();
    const key = sorted.join('||');
    if (!usedClusterKeys.has(key)) {
      usedClusterKeys.add(key);
      rawClusters.push({
        nodes: sorted,
        edgeCount: countInternalEdges(cluster)
      });
    }
  }

  for (const seed of bidirSeeds) {
    buildClusterFromSeed(seed);
  }

  // If fewer than 6 bidirectional clusters, also seed from highest-weight connected triangles/pairs
  if (rawClusters.length < 6) {
    const weightedPairs = [];
    const seenUndir = new Set();
    for (const [u, map] of undirAdj.entries()) {
      for (const [v, w] of map.entries()) {
        const pk = [u, v].sort().join('||');
        if (seenUndir.has(pk)) continue;
        seenUndir.add(pk);
        // Count common neighbors
        const vMap = undirAdj.get(v);
        let common = 0;
        for (const nb of map.keys()) {
          if (vMap.has(nb)) common++;
        }
        if (w >= 2 || common >= 2) {
          weightedPairs.push({ pair: [u, v], score: w * 2 + common });
        }
      }
    }
    weightedPairs.sort((a, b) => b.score - a.score);
    for (const wp of weightedPairs.slice(0, 30)) {
      buildClusterFromSeed(wp.pair);
      if (rawClusters.length >= 20) break;
    }
  }

  // Deduplicate overlapping clusters: keep highest edgeCount distinct clusters
  rawClusters.sort((a, b) => b.edgeCount - a.edgeCount || b.nodes.length - a.nodes.length);
  const clusters = [];
  for (const c of rawClusters) {
    const tooSimilar = clusters.some((existing) => {
      const overlap = c.nodes.filter((id) => existing.nodes.includes(id)).length;
      return overlap >= Math.min(c.nodes.length, existing.nodes.length) - 1 && overlap >= 2;
    });
    if (!tooSimilar) {
      clusters.push(c);
      if (clusters.length >= 10) break;
    }
  }

  // G: Layer List
  const layerSummary = {
    count: layers.length,
    list: layers.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description || ''
    }))
  };

  // H: Node Summary Index
  const nodeSummaryIndex = {};
  for (const n of nodes) {
    nodeSummaryIndex[n.id] = {
      name: n.name,
      type: n.type,
      filePath: n.filePath,
      summary: n.summary || ''
    };
  }

  const result = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking,
    fanOutRanking,
    bfsTraversal: {
      startNode,
      reachedCount: bfsOrder.length,
      order: bfsOrder,
      depthMap,
      byDepth
    },
    nonCodeFiles,
    clusters,
    layers: layerSummary,
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: validEdges.length
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
}

main();
