#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node ua-arch-analyze.js <input.json> <output.json>');
    process.exit(1);
  }

  const [inputPath, outputPath] = args;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read/parse input JSON: ${err.message}`);
    process.exit(1);
  }

  const fileNodes = Array.isArray(data.fileNodes) ? data.fileNodes : [];
  const importEdges = Array.isArray(data.importEdges) ? data.importEdges : [];
  const allEdges = Array.isArray(data.allEdges) ? data.allEdges : [];

  const nodeById = new Map();
  for (const n of fileNodes) {
    nodeById.set(n.id, n);
  }

  // Helper: normalize posix path
  const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');

  // A. Directory Grouping (top-level after common prefix)
  const paths = fileNodes.map((n) => norm(n.filePath || n.name));
  let commonPrefix = '';
  if (paths.length > 0) {
    const splitPaths = paths.map((p) => p.split('/'));
    const minLen = Math.min(...splitPaths.map((s) => s.length - 1));
    const prefixParts = [];
    for (let i = 0; i < minLen; i++) {
      const seg = splitPaths[0][i];
      if (splitPaths.every((s) => s[i] === seg)) {
        prefixParts.push(seg);
      } else {
        break;
      }
    }
    if (prefixParts.length > 0) {
      commonPrefix = prefixParts.join('/') + '/';
    }
  }

  const directoryGroups = {};
  const subDirectoryGroups = {};
  const nodeToGroup = new Map();
  const nodeToSubGroup = new Map();

  for (const n of fileNodes) {
    const p = norm(n.filePath || n.name);
    const rel = commonPrefix ? p.slice(commonPrefix.length) : p;
    const parts = rel.split('/');
    const topGroup = parts.length > 1 ? parts[0] : 'root';
    if (!directoryGroups[topGroup]) directoryGroups[topGroup] = [];
    directoryGroups[topGroup].push(n.id);
    nodeToGroup.set(n.id, topGroup);

    // Finer sub-group (up to 2 directory levels, or 3 for src/core/services & src/web/client)
    let subGroup = 'root';
    if (parts.length === 2) {
      subGroup = parts[0];
    } else if (parts.length === 3) {
      subGroup = `${parts[0]}/${parts[1]}`;
    } else if (parts.length >= 4) {
      subGroup = `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
    if (!subDirectoryGroups[subGroup]) subDirectoryGroups[subGroup] = [];
    subDirectoryGroups[subGroup].push(n.id);
    nodeToSubGroup.set(n.id, subGroup);
  }

  // B. Node Type Grouping
  const nodeTypeGroups = {};
  for (const n of fileNodes) {
    const t = n.type || 'file';
    if (!nodeTypeGroups[t]) nodeTypeGroups[t] = [];
    nodeTypeGroups[t].push(n.id);
  }

  // C. Import Adjacency Matrix (fan-in, fan-out, group neighbors)
  const fileFanIn = {};
  const fileFanOut = {};
  for (const n of fileNodes) {
    fileFanIn[n.id] = 0;
    fileFanOut[n.id] = 0;
  }

  const interGroupMap = new Map();
  const interSubGroupMap = new Map();
  const groupInternalEdges = {};
  const groupTotalEdges = {};
  const subGroupInternalEdges = {};
  const subGroupTotalEdges = {};

  for (const g of Object.keys(directoryGroups)) {
    groupInternalEdges[g] = 0;
    groupTotalEdges[g] = 0;
  }
  for (const sg of Object.keys(subDirectoryGroups)) {
    subGroupInternalEdges[sg] = 0;
    subGroupTotalEdges[sg] = 0;
  }

  for (const e of importEdges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    fileFanOut[e.source] = (fileFanOut[e.source] || 0) + 1;
    fileFanIn[e.target] = (fileFanIn[e.target] || 0) + 1;

    const gs = nodeToGroup.get(e.source);
    const gt = nodeToGroup.get(e.target);
    if (gs === gt) {
      groupInternalEdges[gs] += 1;
      groupTotalEdges[gs] += 1;
    } else {
      groupTotalEdges[gs] += 1;
      groupTotalEdges[gt] += 1;
      const key = `${gs}|||${gt}`;
      interGroupMap.set(key, (interGroupMap.get(key) || 0) + 1);
    }

    const sgs = nodeToSubGroup.get(e.source);
    const sgt = nodeToSubGroup.get(e.target);
    if (sgs === sgt) {
      subGroupInternalEdges[sgs] += 1;
      subGroupTotalEdges[sgs] += 1;
    } else {
      subGroupTotalEdges[sgs] += 1;
      subGroupTotalEdges[sgt] += 1;
      const skey = `${sgs}|||${sgt}`;
      interSubGroupMap.set(skey, (interSubGroupMap.get(skey) || 0) + 1);
    }
  }

  // D. Cross-Category Dependency Analysis (using allEdges)
  const crossCatMap = new Map();
  const nonCodeConnections = [];
  for (const e of allEdges) {
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    if (!src || !tgt) continue;
    const key = `${src.type}|||${tgt.type}|||${e.type}`;
    crossCatMap.set(key, (crossCatMap.get(key) || 0) + 1);
    if (src.type !== 'file' || tgt.type !== 'file') {
      nonCodeConnections.push({
        source: src.id,
        sourceType: src.type,
        target: tgt.id,
        targetType: tgt.type,
        edgeType: e.type,
      });
    }
  }
  const crossCategoryEdges = Array.from(crossCatMap.entries())
    .map(([k, count]) => {
      const [fromType, toType, edgeType] = k.split('|||');
      return { fromType, toType, edgeType, count };
    })
    .sort((a, b) => b.count - a.count);

  // E. Inter-Group Import Frequency
  const interGroupImports = Array.from(interGroupMap.entries())
    .map(([k, count]) => {
      const [from, to] = k.split('|||');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  const interSubGroupImports = Array.from(interSubGroupMap.entries())
    .map(([k, count]) => {
      const [from, to] = k.split('|||');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  // F. Intra-Group Import Density
  const intraGroupDensity = {};
  for (const g of Object.keys(directoryGroups)) {
    const internal = groupInternalEdges[g];
    const total = groupTotalEdges[g];
    intraGroupDensity[g] = {
      internalEdges: internal,
      totalEdges: total,
      density: total > 0 ? Number((internal / total).toFixed(3)) : 0,
    };
  }

  const intraSubGroupDensity = {};
  for (const sg of Object.keys(subDirectoryGroups)) {
    const internal = subGroupInternalEdges[sg];
    const total = subGroupTotalEdges[sg];
    intraSubGroupDensity[sg] = {
      internalEdges: internal,
      totalEdges: total,
      density: total > 0 ? Number((internal / total).toFixed(3)) : 0,
    };
  }

  // G. Directory & File Pattern Matching
  const dirPatterns = {
    routes: 'api', api: 'api', controllers: 'api', endpoints: 'api', handlers: 'api',
    services: 'service', core: 'service', lib: 'service', domain: 'service', logic: 'service',
    models: 'data', db: 'data', data: 'data', persistence: 'data', repository: 'data', entities: 'data',
    components: 'ui', views: 'ui', pages: 'ui', ui: 'ui', layouts: 'ui', screens: 'ui', tui: 'ui', web: 'ui',
    middleware: 'middleware', plugins: 'middleware', interceptors: 'middleware', guards: 'middleware',
    utils: 'utility', helpers: 'utility', common: 'utility', shared: 'utility', tools: 'utility', scripts: 'utility',
    config: 'config', constants: 'config', env: 'config', settings: 'config',
    __tests__: 'test', test: 'test', tests: 'test', spec: 'test', specs: 'test',
    types: 'types', interfaces: 'types', schemas: 'types', contracts: 'types', dtos: 'types',
    hooks: 'hooks',
    store: 'state', state: 'state', reducers: 'state', actions: 'state', slices: 'state',
    assets: 'assets', static: 'assets', public: 'assets',
    docs: 'documentation', documentation: 'documentation', wiki: 'documentation',
    deploy: 'infrastructure', deployment: 'infrastructure', infra: 'infrastructure', infrastructure: 'infrastructure',
    '.github': 'ci-cd', '.gitlab': 'ci-cd', '.circleci': 'ci-cd',
    k8s: 'infrastructure', kubernetes: 'infrastructure', helm: 'infrastructure', charts: 'infrastructure',
    terraform: 'infrastructure', tf: 'infrastructure', docker: 'infrastructure',
    sql: 'data', database: 'data', schema: 'data', bin: 'entry', cmd: 'entry',
  };

  const patternMatches = {};
  for (const g of Object.keys(directoryGroups)) {
    const lower = g.toLowerCase();
    if (dirPatterns[lower]) {
      patternMatches[g] = dirPatterns[lower];
    } else if (g === 'root') {
      patternMatches[g] = 'root';
    } else if (g === 'src') {
      patternMatches[g] = 'source-root';
    }
  }
  const subPatternMatches = {};
  for (const sg of Object.keys(subDirectoryGroups)) {
    const segs = sg.toLowerCase().split('/');
    const last = segs[segs.length - 1];
    if (dirPatterns[last]) {
      subPatternMatches[sg] = dirPatterns[last];
    } else if (segs.length >= 2 && dirPatterns[segs[1]]) {
      subPatternMatches[sg] = dirPatterns[segs[1]];
    }
  }

  // H. Deployment Topology Detection
  const allFilePaths = fileNodes.map((n) => norm(n.filePath || n.name));
  const hasDockerfile = allFilePaths.some((p) => /(^|\/)Dockerfile(\..+)?$/i.test(p));
  const hasCompose = allFilePaths.some((p) => /(^|\/)docker-compose\..+$/i.test(p));
  const hasK8s = allFilePaths.some((p) => /(^|\/)(k8s|kubernetes|helm|charts)\//i.test(p));
  const hasTerraform = allFilePaths.some((p) => /\.tf(vars)?$/i.test(p));
  const hasCI = allFilePaths.some((p) => /^\.github\/workflows\//.test(p) || /(^|\/)(\.gitlab-ci\.yml|Jenkinsfile)$/.test(p));
  const infraFiles = allFilePaths.filter((p) =>
    /(^|\/)(Dockerfile(\..+)?|docker-compose\..+|Makefile|Jenkinsfile|\.gitlab-ci\.yml)$/.test(p) ||
    /^\.github\/workflows\//.test(p) ||
    /\.tf(vars)?$/i.test(p) ||
    /^scripts\/(build|release|install)/i.test(p)
  );

  const deploymentTopology = {
    hasDockerfile,
    hasCompose,
    hasK8s,
    hasTerraform,
    hasCI,
    infraFiles,
  };

  // I. Data Pipeline Detection
  const dataPipeline = {
    schemaFiles: allFilePaths.filter((p) => /\.(sql|graphql|gql|proto|prisma)$/i.test(p) || /schema/i.test(p)),
    migrationFiles: allFilePaths.filter((p) => /migrations?\//i.test(p)),
    dataModelFiles: allFilePaths.filter((p) => /(models?|entities?|types|locks)\./i.test(p)),
    apiHandlerFiles: allFilePaths.filter((p) => /(api|routes|handlers|controllers)\./i.test(p)),
  };

  // J. Documentation Coverage
  const docNodes = fileNodes.filter((n) => n.type === 'document' || /\.md$/i.test(norm(n.filePath || '')));
  const docTargetGroups = new Set();
  for (const e of allEdges) {
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    if (!src || !tgt) continue;
    if ((src.type === 'document' || /\.md$/i.test(norm(src.filePath || ''))) && tgt.type === 'file') {
      docTargetGroups.add(nodeToGroup.get(tgt.id));
    }
  }
  for (const d of docNodes) {
    const g = nodeToGroup.get(d.id);
    if (g && g !== 'docs' && g !== 'root') {
      docTargetGroups.add(g);
    }
  }
  const codeGroups = Object.keys(directoryGroups).filter((g) => g !== 'docs' && g !== 'root');
  const documentedCodeGroups = codeGroups.filter((g) => docTargetGroups.has(g));
  const undocumentedGroups = codeGroups.filter((g) => !docTargetGroups.has(g));
  const docCoverage = {
    groupsWithDocs: documentedCodeGroups.length,
    totalGroups: codeGroups.length,
    coverageRatio: codeGroups.length > 0 ? Number((documentedCodeGroups.length / codeGroups.length).toFixed(2)) : 0,
    undocumentedGroups,
  };

  // K. Dependency Direction (both top-level and sub-directory level)
  function computeDepDir(interMap) {
    const pairs = new Set();
    for (const k of interMap.keys()) {
      const [a, b] = k.split('|||');
      const canon = a < b ? `${a}|||${b}` : `${b}|||${a}`;
      pairs.add(canon);
    }
    const result = [];
    for (const canon of pairs) {
      const [a, b] = canon.split('|||');
      const ab = interMap.get(`${a}|||${b}`) || 0;
      const ba = interMap.get(`${b}|||${a}`) || 0;
      if (ab > ba) {
        result.push({ dependent: a, dependsOn: b, forwardCount: ab, reverseCount: ba });
      } else if (ba > ab) {
        result.push({ dependent: b, dependsOn: a, forwardCount: ba, reverseCount: ab });
      } else if (ab > 0) {
        result.push({ dependent: a, dependsOn: b, forwardCount: ab, reverseCount: ba, bidirectional: true });
      }
    }
    return result.sort((x, y) => y.forwardCount - x.forwardCount);
  }

  const dependencyDirection = computeDepDir(interGroupMap);
  const subDependencyDirection = computeDepDir(interSubGroupMap);

  // File Stats
  const filesPerGroup = {};
  for (const [g, ids] of Object.entries(directoryGroups)) {
    filesPerGroup[g] = ids.length;
  }
  const filesPerSubGroup = {};
  for (const [sg, ids] of Object.entries(subDirectoryGroups)) {
    filesPerSubGroup[sg] = ids.length;
  }
  const nodeTypeCounts = {};
  for (const [t, ids] of Object.entries(nodeTypeGroups)) {
    nodeTypeCounts[t] = ids.length;
  }

  // Compact node catalog for semantic assignment
  const nodeCatalog = fileNodes
    .map((n) => ({
      id: n.id,
      type: n.type,
      filePath: norm(n.filePath || n.name),
      subGroup: nodeToSubGroup.get(n.id),
      fanIn: fileFanIn[n.id] || 0,
      fanOut: fileFanOut[n.id] || 0,
      tags: n.tags || [],
      summary: n.summary || '',
    }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  const output = {
    scriptCompleted: true,
    commonPrefix,
    directoryGroups,
    subDirectoryGroups,
    nodeTypeGroups,
    crossCategoryEdges,
    interGroupImports,
    interSubGroupImports,
    intraGroupDensity,
    intraSubGroupDensity,
    patternMatches,
    subPatternMatches,
    deploymentTopology,
    dataPipeline,
    docCoverage,
    dependencyDirection,
    subDependencyDirection,
    fileStats: {
      totalFileNodes: fileNodes.length,
      filesPerGroup,
      filesPerSubGroup,
      nodeTypeCounts,
    },
    fileFanIn,
    fileFanOut,
    nodeCatalog,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Analysis complete: ${fileNodes.length} file nodes, ${importEdges.length} import edges, ${allEdges.length} all edges.`);
}

main();
