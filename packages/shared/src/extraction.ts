/**
 * Skill extraction from public GitHub repository data.
 *
 * Signals used: languages (with byte counts), repository topics, dependency
 * manifests (package.json, requirements.txt, pom.xml, ...) and notable files in
 * the repository root (Dockerfile, .github/workflows, ...).
 *
 * The output is a list of SUGGESTIONS with evidence. A suggestion is never treated
 * as a skill the user knows until the user confirms it.
 */
import { buildAliasIndex, normalizeKey, type AliasSource } from './normalize';

export interface RepoInput {
  name: string;
  isFork?: boolean;
  pushedAt?: string | Date | null;
  languages?: Record<string, number>; // linguist name -> bytes
  primaryLanguage?: string | null;
  topics?: string[];
  manifests?: Record<string, string>; // path -> file text
  rootEntries?: string[]; // file / folder names in repo root
}

export type SignalKind = 'language' | 'topic' | 'dependency' | 'file';

export interface Evidence {
  repo: string;
  signal: SignalKind;
  detail: string;
}

export interface Detection {
  /** Catalogue slug, or `topic:<name>` for topics that are not in the catalogue. */
  key: string;
  known: boolean;
  /** Display label for unknown topics. */
  label?: string;
  repoCount: number;
  repos: string[];
  signals: SignalKind[];
  evidence: Evidence[];
  /** Share of all language bytes (0..1) when detected as a language. */
  codeShare?: number;
  lastUsed?: string;
}

/** GitHub linguist language name -> catalogue slug(s). */
export const LANGUAGE_MAP: Record<string, string[]> = {
  JavaScript: ['javascript'],
  TypeScript: ['typescript'],
  Python: ['python'],
  Java: ['java'],
  C: ['c'],
  'C++': ['cpp'],
  'C#': ['csharp'],
  Go: ['go'],
  Rust: ['rust'],
  Kotlin: ['kotlin'],
  Swift: ['swift'],
  Dart: ['dart'],
  PHP: ['php'],
  Ruby: ['ruby'],
  R: ['r'],
  Scala: ['scala'],
  MATLAB: ['matlab'],
  Solidity: ['solidity'],
  Shell: ['shell'],
  PowerShell: ['shell'],
  HTML: ['html'],
  CSS: ['css'],
  SCSS: ['sass'],
  Sass: ['sass'],
  'Jupyter Notebook': ['jupyter', 'python'],
  Vue: ['vue'],
  Svelte: ['svelte'],
  Dockerfile: ['docker'],
  Verilog: ['verilog'],
  SystemVerilog: ['verilog'],
  VHDL: ['verilog'],
  Assembly: ['assembly'],
  Haskell: ['haskell'],
  Lua: ['lua'],
  Julia: ['julia'],
  PLpgSQL: ['sql', 'postgresql'],
  TSQL: ['sql'],
  PLSQL: ['sql'],
  HCL: ['terraform'],
  'Objective-C': ['ios'],
  CMake: ['cmake'],
  GDScript: ['game-development'],
  ShaderLab: ['unity'],
};

/** Dependency / package name -> catalogue slug(s). Keys are lower-case. */
export const DEPENDENCY_MAP: Record<string, string[]> = {
  // JavaScript / TypeScript (npm)
  react: ['react'],
  'react-dom': ['react'],
  next: ['nextjs', 'react'],
  vue: ['vue'],
  nuxt: ['nuxt', 'vue'],
  '@angular/core': ['angular', 'typescript'],
  svelte: ['svelte'],
  '@sveltejs/kit': ['svelte'],
  'react-native': ['react-native'],
  expo: ['expo', 'react-native'],
  tailwindcss: ['tailwindcss'],
  bootstrap: ['bootstrap'],
  'react-bootstrap': ['bootstrap'],
  redux: ['redux'],
  '@reduxjs/toolkit': ['redux'],
  jquery: ['jquery'],
  three: ['threejs'],
  '@react-three/fiber': ['threejs'],
  vite: ['vite'],
  webpack: ['webpack'],
  '@mui/material': ['material-ui'],
  '@material-ui/core': ['material-ui'],
  'framer-motion': ['framer-motion'],
  motion: ['framer-motion'],
  d3: ['d3'],
  'chart.js': ['chartjs'],
  'react-chartjs-2': ['chartjs'],
  express: ['express', 'nodejs'],
  koa: ['nodejs'],
  fastify: ['nodejs'],
  '@nestjs/core': ['nestjs', 'nodejs'],
  mongoose: ['mongodb'],
  mongodb: ['mongodb'],
  mysql: ['mysql'],
  mysql2: ['mysql'],
  pg: ['postgresql'],
  sequelize: ['sql'],
  'better-sqlite3': ['sqlite'],
  sqlite3: ['sqlite'],
  redis: ['redis'],
  ioredis: ['redis'],
  firebase: ['firebase'],
  'firebase-admin': ['firebase'],
  '@supabase/supabase-js': ['supabase'],
  prisma: ['prisma'],
  '@prisma/client': ['prisma'],
  graphql: ['graphql'],
  '@apollo/client': ['graphql'],
  '@apollo/server': ['graphql'],
  'apollo-server': ['graphql'],
  'socket.io': ['socketio', 'nodejs'],
  'socket.io-client': ['socketio'],
  ws: ['socketio'],
  jsonwebtoken: ['jwt'],
  axios: ['axios'],
  stripe: ['stripe'],
  electron: ['electron'],
  ethers: ['web3', 'blockchain'],
  web3: ['web3', 'blockchain'],
  hardhat: ['web3', 'blockchain'],
  truffle: ['web3', 'blockchain'],
  '@tensorflow/tfjs': ['tensorflow'],
  openai: ['llm'],
  langchain: ['llm'],
  '@langchain/core': ['llm'],
  jest: ['jest'],
  vitest: ['vitest'],
  mocha: ['mocha'],
  chai: ['mocha'],
  cypress: ['cypress'],
  '@playwright/test': ['playwright'],
  playwright: ['playwright'],
  puppeteer: ['selenium'],
  'selenium-webdriver': ['selenium'],
  typescript: ['typescript'],
  'aws-sdk': ['aws'],
  '@aws-sdk/client-s3': ['aws'],
  serverless: ['serverless'],
  'chrome-types': ['chrome-extension'],
  '@types/chrome': ['chrome-extension'],
  // Python (pip)
  django: ['django', 'python'],
  djangorestframework: ['django', 'rest-api'],
  flask: ['flask', 'python'],
  fastapi: ['fastapi', 'python'],
  streamlit: ['streamlit'],
  tensorflow: ['tensorflow', 'deep-learning'],
  'tensorflow-gpu': ['tensorflow', 'deep-learning'],
  keras: ['keras', 'deep-learning'],
  torch: ['pytorch', 'deep-learning'],
  torchvision: ['pytorch', 'computer-vision'],
  'torch-geometric': ['gnn', 'pytorch'],
  torch_geometric: ['gnn', 'pytorch'],
  dgl: ['gnn'],
  'scikit-learn': ['scikit-learn', 'machine-learning'],
  sklearn: ['scikit-learn', 'machine-learning'],
  pandas: ['pandas', 'data-analysis'],
  numpy: ['numpy'],
  matplotlib: ['matplotlib'],
  seaborn: ['matplotlib', 'data-analysis'],
  plotly: ['data-analysis'],
  'opencv-python': ['opencv', 'computer-vision'],
  'opencv-contrib-python': ['opencv', 'computer-vision'],
  'opencv-python-headless': ['opencv', 'computer-vision'],
  nltk: ['nlp'],
  spacy: ['nlp'],
  transformers: ['huggingface', 'nlp'],
  datasets: ['huggingface'],
  'sentence-transformers': ['huggingface', 'nlp'],
  langchain_core: ['llm'],
  'langchain-core': ['llm'],
  'llama-index': ['llm'],
  'google-generativeai': ['llm'],
  anthropic: ['llm'],
  xgboost: ['xgboost', 'machine-learning'],
  lightgbm: ['xgboost', 'machine-learning'],
  gym: ['reinforcement-learning'],
  gymnasium: ['reinforcement-learning'],
  'stable-baselines3': ['reinforcement-learning'],
  jupyter: ['jupyter'],
  notebook: ['jupyter'],
  sqlalchemy: ['sql'],
  psycopg2: ['postgresql'],
  'psycopg2-binary': ['postgresql'],
  pymongo: ['mongodb'],
  'mysql-connector-python': ['mysql'],
  pymysql: ['mysql'],
  pytest: ['pytest'],
  selenium: ['selenium'],
  beautifulsoup4: ['selenium'],
  scrapy: ['selenium'],
  boto3: ['aws'],
  'firebase-admin-python': ['firebase'],
  pyrebase: ['firebase'],
  web3py: ['web3', 'blockchain'],
  'web3.py': ['web3', 'blockchain'],
  pygame: ['game-development'],
  'rpi.gpio': ['raspberry-pi'],
  paho_mqtt: ['iot'],
  'paho-mqtt': ['iot'],
  // Java / Kotlin (Maven + Gradle artifacts)
  'spring-boot-starter-web': ['spring-boot', 'java', 'rest-api'],
  'spring-boot-starter': ['spring-boot', 'java'],
  'spring-boot-starter-data-jpa': ['spring-boot', 'hibernate'],
  'spring-boot-starter-security': ['spring-boot'],
  'spring-boot-starter-data-mongodb': ['spring-boot', 'mongodb'],
  'spring-boot-starter-websocket': ['spring-boot', 'socketio'],
  'mysql-connector-java': ['mysql'],
  'mysql-connector-j': ['mysql'],
  postgresql: ['postgresql'],
  'hibernate-core': ['hibernate'],
  junit: ['junit'],
  'junit-jupiter': ['junit'],
  'junit-jupiter-api': ['junit'],
  lombok: ['java'],
  'jjwt-api': ['jwt'],
  jjwt: ['jwt'],
  'firebase-firestore': ['firebase', 'android'],
  'compose-ui': ['jetpack-compose', 'android'],
  'androidx.compose.ui': ['jetpack-compose', 'android'],
  'ui-tooling': ['jetpack-compose'],
  retrofit: ['android', 'rest-api'],
  // Go modules (last path segment or full path)
  'github.com/gin-gonic/gin': ['gin', 'go'],
  'go.mongodb.org/mongo-driver': ['mongodb'],
  'gorm.io/gorm': ['sql'],
  'google.golang.org/grpc': ['grpc'],
  'github.com/gorilla/websocket': ['socketio'],
  // Rust crates
  tokio: ['rust'],
  actix: ['rust', 'rest-api'],
  'actix-web': ['rust', 'rest-api'],
  axum: ['rust', 'rest-api'],
  // PHP (composer)
  'laravel/framework': ['laravel', 'php'],
  // Ruby (gems)
  rails: ['rails', 'ruby'],
  // Dart / Flutter (pubspec)
  flutter: ['flutter', 'dart'],
  cloud_firestore: ['firebase'],
  firebase_core: ['firebase'],
  provider: ['flutter'],
  flutter_bloc: ['flutter'],
  http: [],
};

/** Notable root files / folders -> catalogue slug(s). Keys are lower-case. */
export const FILE_MAP: Record<string, string[]> = {
  dockerfile: ['docker'],
  'docker-compose.yml': ['docker'],
  'docker-compose.yaml': ['docker'],
  'compose.yml': ['docker'],
  '.github': ['github-actions'],
  'cmakelists.txt': ['cmake'],
  'pom.xml': ['maven', 'java'],
  'build.gradle': ['gradle'],
  'build.gradle.kts': ['gradle', 'kotlin'],
  'vercel.json': ['vercel'],
  'netlify.toml': ['netlify'],
  'firebase.json': ['firebase'],
  'serverless.yml': ['serverless'],
  'manage.py': ['django', 'python'],
  'pubspec.yaml': ['flutter', 'dart'],
  'hardhat.config.js': ['web3', 'blockchain'],
  'hardhat.config.ts': ['web3', 'blockchain'],
  'truffle-config.js': ['web3', 'blockchain'],
  'tailwind.config.js': ['tailwindcss'],
  'tailwind.config.ts': ['tailwindcss'],
  'tailwind.config.cjs': ['tailwindcss'],
  'next.config.js': ['nextjs'],
  'next.config.mjs': ['nextjs'],
  'next.config.ts': ['nextjs'],
  'vite.config.js': ['vite'],
  'vite.config.ts': ['vite'],
  'jest.config.js': ['jest'],
  'jest.config.ts': ['jest'],
  'playwright.config.ts': ['playwright'],
  'cypress.config.js': ['cypress'],
  'cypress.config.ts': ['cypress'],
  cypress: ['cypress'],
  'jenkinsfile': ['jenkins'],
  'nginx.conf': ['nginx'],
  'main.tf': ['terraform'],
  'k8s': ['kubernetes'],
  'kubernetes': ['kubernetes'],
  'helm': ['kubernetes'],
  'manifest.json': [],
  'platformio.ini': ['arduino', 'iot'],
  'requirements.txt': ['python'],
  'pyproject.toml': ['python'],
  'go.mod': ['go'],
  'cargo.toml': ['rust'],
  'gemfile': ['ruby'],
  'composer.json': ['php'],
  'app.json': [],
};

/** Topics that describe the repo, not a skill. */
const TOPIC_STOPLIST = new Set(
  [
    'hacktoberfest', 'hacktoberfest2023', 'hacktoberfest2024', 'hacktoberfest2025', 'hacktoberfest2026',
    'project', 'projects', 'beginner', 'beginners', 'beginner-friendly', 'assignment', 'college', 'college-project',
    'university', 'hackathon', 'portfolio', 'portfolio-website', 'website', 'app', 'application', 'learning', 'tutorial',
    'awesome', 'awesome-list', 'good-first-issue', 'first-contributions', 'open-source', 'opensource', 'student',
    'students', 'demo', 'template', 'boilerplate', 'starter', 'mini-project', 'final-year-project', 'lab', 'practice',
  ].map(normalizeKey),
);

/** Manifest file names we ask GitHub for (repo root and common sub-folders). */
export const MANIFEST_FILES = [
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'go.mod',
  'Cargo.toml',
  'composer.json',
  'Gemfile',
  'pubspec.yaml',
] as const;

export const MANIFEST_SUBFOLDERS = ['frontend', 'backend', 'client', 'server', 'app'] as const;

// ---------------------------------------------------------------------------
// Manifest parsers — deliberately forgiving: a malformed file yields [].

export function parsePackageJson(text: string): string[] {
  try {
    const json = JSON.parse(text);
    return [
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.devDependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

export function parseRequirements(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter((l) => l && !l.startsWith('-'))
    .map((l) => l.split(/[<>=!~;\[\s@]/)[0].trim())
    .filter(Boolean);
}

export function parsePyproject(text: string): string[] {
  const names = new Set<string>();
  // PEP 621: dependencies = ["fastapi>=0.1", "torch"]
  const arrays = text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/g) ?? [];
  for (const arr of arrays) {
    for (const m of arr.matchAll(/["']([A-Za-z0-9_.\-]+)/g)) names.add(m[1]);
  }
  // Poetry: [tool.poetry.dependencies] name = "^1.0"
  const poetry = text.split(/\[tool\.poetry\.(?:dev-)?dependencies\]/).slice(1);
  for (const section of poetry) {
    const body = section.split(/\n\[/)[0];
    for (const m of body.matchAll(/^\s*([A-Za-z0-9_.\-]+)\s*=/gm)) names.add(m[1]);
  }
  names.delete('python');
  return [...names];
}

export function parsePom(text: string): string[] {
  return [...text.matchAll(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g)].map((m) => m[1]);
}

export function parseGradle(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/["']([\w.\-]+):([\w.\-]+)(?::[^"']*)?["']/g)) {
    out.push(m[2]);
    out.push(`${m[1]}.${m[2]}`);
  }
  if (/org\.springframework\.boot/.test(text)) out.push('spring-boot-starter');
  if (/com\.android\.(application|library)/.test(text)) out.push('android-gradle');
  if (/compose\s*(=|true)|buildFeatures\s*\{[^}]*compose/.test(text)) out.push('compose-ui');
  return out;
}

export function parseGoMod(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(?:require\s+)?([a-z0-9.\-]+\.[a-z]{2,}\/[^\s]+)\s+v[\d.]/gim)) out.push(m[1]);
  return out;
}

export function parseCargo(text: string): string[] {
  const out: string[] = [];
  const sections = text.split(/\[(?:dev-)?dependencies\]/).slice(1);
  for (const s of sections) {
    const body = s.split(/\n\[/)[0];
    for (const m of body.matchAll(/^\s*([A-Za-z0-9_\-]+)\s*=/gm)) out.push(m[1]);
  }
  return out;
}

export function parseComposer(text: string): string[] {
  try {
    const json = JSON.parse(text);
    return [...Object.keys(json.require ?? {}), ...Object.keys(json['require-dev'] ?? {})];
  } catch {
    return [];
  }
}

export function parseGemfile(text: string): string[] {
  return [...text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

export function parsePubspec(text: string): string[] {
  const out: string[] = ['flutter'];
  const deps = text.split(/^(?:dev_)?dependencies:\s*$/m).slice(1);
  for (const d of deps) {
    for (const line of d.split(/\r?\n/)) {
      if (/^\S/.test(line) && line.trim()) break;
      const m = line.match(/^\s{2}([a-z0-9_]+)\s*:/);
      if (m) out.push(m[1]);
    }
  }
  return out;
}

export function parseManifest(path: string, text: string): string[] {
  const file = path.split('/').pop()!.toLowerCase();
  switch (file) {
    case 'package.json':
      return parsePackageJson(text);
    case 'requirements.txt':
      return parseRequirements(text);
    case 'pyproject.toml':
      return parsePyproject(text);
    case 'pom.xml':
      return parsePom(text);
    case 'build.gradle':
    case 'build.gradle.kts':
      return parseGradle(text);
    case 'go.mod':
      return parseGoMod(text);
    case 'cargo.toml':
      return parseCargo(text);
    case 'composer.json':
      return parseComposer(text);
    case 'gemfile':
      return parseGemfile(text);
    case 'pubspec.yaml':
      return parsePubspec(text);
    default:
      return [];
  }
}

function dependencySlugs(dep: string): string[] {
  const key = dep.toLowerCase().trim();
  if (DEPENDENCY_MAP[key]) return DEPENDENCY_MAP[key];
  if (key.startsWith('@nestjs/')) return ['nestjs', 'nodejs'];
  if (key.startsWith('@angular/')) return ['angular'];
  if (key.startsWith('@tensorflow/')) return ['tensorflow'];
  if (key.startsWith('@aws-sdk/')) return ['aws'];
  if (key.startsWith('@google-cloud/')) return ['gcp'];
  if (key.startsWith('@azure/')) return ['azure'];
  if (key.startsWith('@langchain/')) return ['llm'];
  if (key.startsWith('spring-boot-starter')) return ['spring-boot', 'java'];
  if (key.startsWith('androidx.') || key === 'android-gradle') return ['android'];
  if (key.startsWith('firebase_') || key.startsWith('@firebase/')) return ['firebase'];
  // Go: match by full module path prefix
  for (const k of Object.keys(DEPENDENCY_MAP)) {
    if (k.includes('/') && key.startsWith(k)) return DEPENDENCY_MAP[k];
  }
  return [];
}

export interface ExtractOptions {
  includeForks?: boolean;
  /** Catalogue entries used to resolve topics and to drop slugs not in the catalogue. */
  catalog: AliasSource[];
}

/**
 * Turns repositories into skill detections. ALL detections are returned (no top-N),
 * each with its evidence.
 */
export function extractSkills(repos: RepoInput[], options: ExtractOptions): Detection[] {
  const aliasIndex = buildAliasIndex(options.catalog);
  const known = new Set(options.catalog.map((c) => c.slug));
  const byKey = new Map<string, Detection & { bytes: number }>();
  let totalBytes = 0;

  const add = (key: string, repo: RepoInput, signal: SignalKind, detail: string, label?: string) => {
    const isKnown = known.has(key);
    if (!isKnown && !key.startsWith('topic:')) return;
    let d = byKey.get(key);
    if (!d) {
      d = { key, known: isKnown, label, repoCount: 0, repos: [], signals: [], evidence: [], bytes: 0 };
      byKey.set(key, d);
    }
    if (!d.repos.includes(repo.name)) {
      d.repos.push(repo.name);
      d.repoCount = d.repos.length;
    }
    if (!d.signals.includes(signal)) d.signals.push(signal);
    if (!d.evidence.some((e) => e.repo === repo.name && e.signal === signal && e.detail === detail)) {
      d.evidence.push({ repo: repo.name, signal, detail });
    }
    const pushed = repo.pushedAt ? new Date(repo.pushedAt).toISOString() : undefined;
    if (pushed && (!d.lastUsed || pushed > d.lastUsed)) d.lastUsed = pushed;
  };

  const usable = repos.filter((r) => options.includeForks || !r.isFork);

  for (const repo of usable) {
    // 1. Languages
    const langs: Record<string, number> = { ...(repo.languages ?? {}) };
    if (Object.keys(langs).length === 0 && repo.primaryLanguage) langs[repo.primaryLanguage] = 1;
    for (const [lang, bytes] of Object.entries(langs)) {
      totalBytes += bytes;
      for (const slug of LANGUAGE_MAP[lang] ?? []) {
        add(slug, repo, 'language', lang);
        const d = byKey.get(slug);
        if (d) d.bytes += bytes;
      }
    }

    // 2. Topics
    for (const topic of repo.topics ?? []) {
      const norm = normalizeKey(topic);
      if (!norm || TOPIC_STOPLIST.has(norm)) continue;
      const slug = aliasIndex.get(norm);
      if (slug) add(slug, repo, 'topic', topic);
      else add(`topic:${topic.toLowerCase()}`, repo, 'topic', topic, prettifyTopic(topic));
    }

    // 3. Dependency manifests
    for (const [path, text] of Object.entries(repo.manifests ?? {})) {
      if (!text) continue;
      for (const dep of parseManifest(path, text)) {
        for (const slug of dependencySlugs(dep)) add(slug, repo, 'dependency', `${dep} (${path})`);
      }
    }

    // 4. Notable files
    for (const entry of repo.rootEntries ?? []) {
      const lower = entry.toLowerCase();
      const slugs = FILE_MAP[lower] ?? (lower.endsWith('.tf') ? ['terraform'] : []);
      for (const slug of slugs) add(slug, repo, 'file', entry);
    }
  }

  return [...byKey.values()]
    .map(({ bytes, ...d }) => ({
      ...d,
      codeShare: bytes > 0 && totalBytes > 0 ? Math.round((bytes / totalBytes) * 1000) / 1000 : undefined,
    }))
    .sort((a, b) => b.repoCount - a.repoCount || (b.codeShare ?? 0) - (a.codeShare ?? 0) || a.key.localeCompare(b.key));
}

export function prettifyTopic(topic: string): string {
  return topic
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Human summary of a detection's evidence, e.g. "Seen in 4 repos · 38% of your code". */
export function describeEvidence(d: Pick<Detection, 'repoCount' | 'codeShare' | 'signals' | 'lastUsed'>): string {
  const parts = [`Seen in ${d.repoCount} repo${d.repoCount === 1 ? '' : 's'}`];
  if (d.codeShare !== undefined && d.codeShare >= 0.01) parts.push(`${Math.round(d.codeShare * 100)}% of your code`);
  const kinds: Record<SignalKind, string> = {
    language: 'language',
    topic: 'topic',
    dependency: 'dependency',
    file: 'config file',
  };
  parts.push(`via ${d.signals.map((s) => kinds[s]).join(', ')}`);
  return parts.join(' · ');
}
