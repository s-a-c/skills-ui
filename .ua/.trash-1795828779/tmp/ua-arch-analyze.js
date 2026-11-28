#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node ua-arch-analyze.js <input.json> <output.json>');
  process.exit(1);
}

try {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);
  const fileNodes = data.fileNodes || [];
  const importEdges = data.importEdges || [];
  const allEdges = data.allEdges || [];

  const nodeById = new Map();
  for (const node of fileNodes) {
    nodeById.set(node.id, node);
  }

  // Helper: normalize paths
  const paths = fileNodes.map((n) => (n.filePath || '').replace(/\\/g, '/'));

  // Compute common directory prefix
  function getCommonDirPrefix(filePaths) {
    if (filePaths.length === 0) return '';
    const splitDirs = filePaths.map((p) => {
      const parts = p.split('/');
      return parts.slice(0, -1); // directory segments only
    });
    const first = splitDirs[0];
    let commonLen = first.length;
    for (let i = 1; i < splitDirs.length; i++) {
      let j = 0;
      while (j < commonLen && j < splitDirs[i].length && first[j] === splitDirs[i][j]) {
        j++;
      }
      commonLen = j;
      if (commonLen === 0) break;
    }
    return commonLen > 0 ? first.slice(0, commonLen).join('/') + '/' : '';
  }

  const commonPrefix = getCommonDirPrefix(paths);

  // A. Directory Grouping (top-level after common prefix)
  const directoryGroups = {};
  const nodeToGroup = new Map();

  // Also compute granular 2-3 level architectural bucket for deeper insight
  const subDirectoryGroups = {};
  const nodeToSubGroup = new Map();

  for (const node of fileNodes) {
    const p = (node.filePath || '').replace(/\\/g, '/');
    const rel = commonPrefix && p.startsWith(commonPrefix) ? p.slice(commonPrefix.length) : p;
    const parts = rel.split('/');
    const topGroup = parts.length > 1 ? parts[0] : 'root';

    if (!directoryGroups[topGroup]) directoryGroups[topGroup] = [];
    directoryGroups[topGroup].push(node.id);
    nodeToGroup.set(node.id, topGroup);

    // Subdirectory grouping: up to 2 dir segments for src/ and docs/, 1-2 for others
    let subGroup = topGroup;
    if (parts.length > 2) {
      if (parts[0] === 'src' && parts[1] === 'core' && parts.length > 3) {
        subGroup = `${parts[0]}/${parts[1]}/${parts[2]}`;
      } else if (parts[0] === 'src' || parts[0] === 'docs' || parts[0] === 'tests' || parts[0] === '.github') {
        subGroup = `${parts[0]}/${parts[1]}`;
      }
    } else if (parts.length === 2 && parts[0] === 'src') {
      subGroup = 'src (root)';
    }
    if (!subDirectoryGroups[subGroup]) subDirectoryGroups[subGroup] = [];
    subDirectoryGroups[subGroup].push(node.id);
    nodeToSubGroup.set(node.id, subGroup);
  }

  // B. Node Type Grouping
  const nodeTypeGroups = {};
  const nodeTypeCounts = {};
  for (const node of fileNodes) {
    const t = node.type || 'file';
    if (!nodeTypeGroups[t]) nodeTypeGroups[t] = [];
    nodeTypeGroups[t].push(node.id);
    nodeTypeCounts[t] = (nodeTypeCounts[t] || 0) + 1;
  }

  // C. Import Adjacency Matrix + Fan-in / Fan-out
  const fileFanIn = {};
  const fileFanOut = {};
  for (const node of fileNodes) {
    fileFanIn[node.id] = 0;
    fileFanOut[node.id] = 0;
  }

  const groupImportsOut = {};
  const groupImportsIn = {};
  for (const g of Object.keys(directoryGroups)) {
    groupImportsOut[g] = new Set();
    groupImportsIn[g] = new Set();
  }

  for (const edge of importEdges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    fileFanOut[edge.source] = (fileFanOut[edge.source] || 0) + 1;
    fileFanIn[edge.target] = (fileFanIn[edge.target] || 0) + 1;

    const sg = nodeToGroup.get(edge.source);
    const tg = nodeToGroup.get(edge.target);
    if (sg && tg && sg !== tg) {
      groupImportsOut[sg].add(tg);
      groupImportsIn[tg].add(sg);
    }
  }

  // D. Cross-Category Dependency Analysis (using allEdges)
  const crossCatMap = new Map();
  const nonCodeConnections = [];
  for (const edge of allEdges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) continue;
    const key = `${src.type}|${tgt.type}|${edge.type}`;
    crossCatMap.set(key, (crossCatMap.get(key) || 0) + 1);
    if (src.type !== 'file' || tgt.type !== 'file') {
      nonCodeConnections.push({
        source: edge.source,
        sourceType: src.type,
        target: edge.target,
        targetType: tgt.type,
        edgeType: edge.type,
      });
    }
  }
  const crossCategoryEdges = [];
  for (const [key, count] of crossCatMap.entries()) {
    const [fromType, toType, edgeType] = key.split('|');
    crossCategoryEdges.push({ fromType, toType, edgeType, count });
  }
  crossCategoryEdges.sort((a, b) => b.count - a.count);

  // Helper to compute inter-group imports, intra-group density, dependency direction
  function analyzeGrouping(groupsObj, nodeToGroupMap) {
    const interMap = new Map();
    const internalCounts = {};
    const totalCounts = {};
    for (const g of Object.keys(groupsObj)) {
      internalCounts[g] = 0;
      totalCounts[g] = 0;
    }

    for (const edge of importEdges) {
      const sg = nodeToGroupMap.get(edge.source);
      const tg = nodeToGroupMap.get(edge.target);
      if (!sg || !tg) continue;
      if (sg === tg) {
        internalCounts[sg]++;
        totalCounts[sg]++;
      } else {
        totalCounts[sg]++;
        totalCounts[tg]++;
        const k = `${sg}=>${tg}`;
        interMap.set(k, (interMap.get(k) || 0) + 1);
      }
    }

    const interGroupImports = [];
    for (const [k, count] of interMap.entries()) {
      const [from, to] = k.split('=>');
      interGroupImports.push({ from, to, count });
    }
    interGroupImports.sort((a, b) => b.count - a.count);

    const intraGroupDensity = {};
    for (const g of Object.keys(groupsObj)) {
      const internalEdges = internalCounts[g];
      const totalEdges = totalCounts[g];
      intraGroupDensity[g] = {
        internalEdges,
        totalEdges,
        density: totalEdges > 0 ? Number((internalEdges / totalEdges).toFixed(3)) : 0,
      };
    }

    // Dependency direction
    const pairsSeen = new Set();
    const dependencyDirection = [];
    for (const item of interGroupImports) {
      const pairKey = [item.from, item.to].sort().join('::');
      if (pairsSeen.has(pairKey)) continue;
      pairsSeen.add(pairKey);
      const ab = interMap.get(`${item.from}=>${item.to}`) || 0;
      const ba = interMap.get(`${item.to}=>${item.from}`) || 0;
      if (ab > ba) {
        dependencyDirection.push({ dependent: item.from, dependsOn: item.to, forward: ab, reverse: ba });
      } else if (ba > ab) {
        dependencyDirection.push({ dependent: item.to, dependsOn: item.from, forward: ba, reverse: ab });
      } else {
        dependencyDirection.push({ dependent: item.from, dependsOn: item.to, forward: ab, reverse: ba, bidirectional: true });
      }
    }

    return { interGroupImports, intraGroupDensity, dependencyDirection };
  }

  const topAnalysis = analyzeGrouping(directoryGroups, nodeToGroup);
  const subAnalysis = analyzeGrouping(subDirectoryGroups, nodeToSubGroup);

  // G. Directory & File Pattern Matching
  const dirPatternTable = [
    [['routes', 'api', 'controllers', 'endpoints', 'handlers', 'serializers', 'controller', 'routers', 'blueprints'], 'api'],
    [['services', 'core', 'lib', 'domain', 'logic', 'signals', 'internal', 'composables', 'mailers', 'jobs', 'channels'], 'service'],
    [['models', 'db', 'data', 'persistence', 'repository', 'entities', 'migrations', 'entity', 'sql', 'database', 'schema'], 'data'],
    [['components', 'views', 'pages', 'ui', 'layouts', 'screens', 'tui', 'web'], 'ui'],
    [['middleware', 'plugins', 'interceptors', 'guards'], 'middleware'],
    [['utils', 'helpers', 'common', 'shared', 'tools', 'templatetags', 'pkg'], 'utility'],
    [['config', 'constants', 'env', 'settings', 'management', 'commands'], 'config'],
    [['__tests__', 'test', 'tests', 'spec', 'specs'], 'test'],
    [['types', 'interfaces', 'schemas', 'contracts', 'dtos', 'dto', 'request', 'response'], 'types'],
    [['hooks'], 'hooks'],
    [['store', 'state', 'reducers', 'actions', 'slices'], 'state'],
    [['assets', 'static', 'public'], 'assets'],
    [['cmd', 'bin'], 'entry'],
    [['docs', 'documentation', 'wiki'], 'documentation'],
    [['deploy', 'deployment', 'infra', 'infrastructure', 'k8s', 'kubernetes', 'helm', 'charts', 'terraform', 'tf', 'docker'], 'infrastructure'],
    [['.github', '.gitlab', '.circleci'], 'ci-cd'],
    [['scripts'], 'scripts'],
  ];

  function matchDirPattern(name) {
    const seg = name.split('/').pop().toLowerCase();
    for (const [patterns, label] of dirPatternTable) {
      if (patterns.includes(seg)) return label;
    }
    return 'unmatched';
  }

  const patternMatches = {};
  for (const g of Object.keys(directoryGroups)) {
    patternMatches[g] = matchDirPattern(g);
  }
  const subPatternMatches = {};
  for (const g of Object.keys(subDirectoryGroups)) {
    subPatternMatches[g] = matchDirPattern(g);
  }

  function matchFilePattern(filePath) {
    const base = path.posix.basename(filePath);
    const lower = filePath.toLowerCase();
    if (/\.(test|spec)\.[^.]+$/.test(base) || /^test_.*\.py$/.test(base) || /_test\.go$/.test(base)) return 'test';
    if (base.endsWith('.d.ts')) return 'types';
    if (['index.ts', 'index.js', '__init__.py', 'manage.py', 'main.rs', 'lib.rs', 'config.ru'].includes(base)) return 'entry';
    if (['Dockerfile'].includes(base) || /^docker-compose\./.test(base) || /\.(tf|tfvars)$/.test(base) || base === 'Makefile') return 'infrastructure';
    if (lower.startsWith('.github/workflows/') || base === '.gitlab-ci.yml' || base === 'Jenkinsfile') return 'ci-cd';
    if (base.endsWith('.sql')) return 'data';
    if (/\.(graphql|gql|proto)$/.test(base)) return 'types';
    if (/\.(md|rst)$/.test(base)) return 'documentation';
    if (['package.json', 'tsconfig.json', 'Cargo.toml', 'go.mod', 'Gemfile', 'pom.xml', 'build.gradle', 'composer.json'].includes(base) || /\.config\.[^.]+$/.test(base) || /\.(toml|json|ya?ml)$/.test(base)) return 'config';
    return 'code';
  }

  // H. Deployment Topology Detection
  const infraFiles = [];
  let hasDockerfile = false;
  let hasCompose = false;
  let hasK8s = false;
  let hasTerraform = false;
  let hasCI = false;

  for (const node of fileNodes) {
    const p = (node.filePath || '').replace(/\\/g, '/');
    const base = path.posix.basename(p);
    if (/^Dockerfile/i.test(base)) {
      hasDockerfile = true;
      infraFiles.push(p);
    } else if (/^docker-compose/i.test(base)) {
      hasCompose = true;
      infraFiles.push(p);
    } else if (/^(k8s|kubernetes|helm|charts)\//i.test(p)) {
      hasK8s = true;
      infraFiles.push(p);
    } else if (/\.(tf|tfvars)$/i.test(base)) {
      hasTerraform = true;
      infraFiles.push(p);
    } else if (p.startsWith('.github/workflows/') || base === '.gitlab-ci.yml' || base === 'Jenkinsfile') {
      hasCI = true;
      infraFiles.push(p);
    } else if (node.type === 'service' || node.type === 'pipeline' || node.type === 'resource') {
      infraFiles.push(p);
    }
  }

  const deploymentTopology = {
    hasDockerfile,
    hasCompose,
    hasK8s,
    hasTerraform,
    hasCI,
    infraFiles: [...new Set(infraFiles)],
  };

  // I. Data Pipeline Detection
  const dataPipeline = {
    schemaFiles: [],
    migrationFiles: [],
    dataModelFiles: [],
    apiHandlerFiles: [],
  };
  for (const node of fileNodes) {
    const p = (node.filePath || '').replace(/\\/g, '/');
    const lower = p.toLowerCase();
    if (/\.(sql|graphql|gql|proto|prisma)$/.test(lower) || node.type === 'schema' || node.type === 'table') {
      if (lower.includes('migration')) dataPipeline.migrationFiles.push(p);
      else dataPipeline.schemaFiles.push(p);
    }
    if (/(models|entities|schema|types)\//.test(lower) || /types\.ts$/.test(lower)) {
      dataPipeline.dataModelFiles.push(p);
    }
    if (/(routes|api|controllers|endpoints|handlers)/.test(lower) || /\/api\.ts$/.test(lower)) {
      dataPipeline.apiHandlerFiles.push(p);
    }
  }

  // J. Documentation Coverage
  const docGroups = new Set();
  for (const [g, ids] of Object.entries(directoryGroups)) {
    for (const id of ids) {
      const node = nodeById.get(id);
      const p = (node?.filePath || '').toLowerCase();
      if (p.endsWith('readme.md') || node?.type === 'document') {
        docGroups.add(g);
      }
    }
  }
  for (const edge of allEdges) {
    if (edge.type === 'documents') {
      const tgtGroup = nodeToGroup.get(edge.target);
      if (tgtGroup) docGroups.add(tgtGroup);
    }
  }
  const allGroups = Object.keys(directoryGroups);
  const undocumentedGroups = allGroups.filter((g) => !docGroups.has(g));
  const docCoverage = {
    groupsWithDocs: docGroups.size,
    totalGroups: allGroups.length,
    coverageRatio: allGroups.length > 0 ? Number((docGroups.size / allGroups.length).toFixed(2)) : 0,
    undocumentedGroups,
  };

  // File stats
  const filesPerGroup = {};
  for (const [g, ids] of Object.entries(directoryGroups)) {
    filesPerGroup[g] = ids.length;
  }
  const filesPerSubGroup = {};
  for (const [g, ids] of Object.entries(subDirectoryGroups)) {
    filesPerSubGroup[g] = ids.length;
  }

  // Full catalog for semantic review
  const fileCatalog = fileNodes.map((n) => ({
    id: n.id,
    type: n.type,
    filePath: n.filePath,
    subGroup: nodeToSubGroup.get(n.id),
    filePattern: matchFilePattern(n.filePath || ''),
    fanIn: fileFanIn[n.id] || 0,
    fanOut: fileFanOut[n.id] || 0,
    tags: n.tags || [],
    summary: n.summary || '',
  }));

  const result = {
    scriptCompleted: true,
    commonPrefix,
    directoryGroups,
    subDirectoryGroups,
    nodeTypeGroups,
    crossCategoryEdges,
    interGroupImports: topAnalysis.interGroupImports,
    subInterGroupImports: subAnalysis.interGroupImports,
    intraGroupDensity: topAnalysis.intraGroupDensity,
    subIntraGroupDensity: subAnalysis.intraGroupDensity,
    patternMatches,
    subPatternMatches,
    deploymentTopology,
    dataPipeline,
    docCoverage,
    dependencyDirection: topAnalysis.dependencyDirection,
    subDependencyDirection: subAnalysis.dependencyDirection,
    fileStats: {
      totalFileNodes: fileNodes.length,
      filesPerGroup,
      filesPerSubGroup,
      nodeTypeCounts,
    },
    fileFanIn,
    fileFanOut,
    fileCatalog,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Analysis complete: ${fileNodes.length} fileNodes, ${importEdges.length} importEdges, ${allEdges.length} allEdges -> ${outputPath}`);
  process.exit(0);
} catch (err) {
  console.error('Fatal error during structural analysis:', err);
  process.exit(1);
}
