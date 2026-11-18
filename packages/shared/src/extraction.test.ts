import { extractSkills, parseRequirements, parsePom, parseGradle, parsePyproject, parseGoMod, parsePubspec, describeEvidence } from './extraction';
import { SKILLS } from './catalog';
import type { RepoInput } from './extraction';

const catalog = SKILLS;

describe('manifest parsers', () => {
  test('requirements.txt', () => {
    expect(parseRequirements('torch==2.1\n# comment\nscikit-learn>=1.3\n-r base.txt\npandas[extra] ; python_version>"3"\n')).toEqual([
      'torch',
      'scikit-learn',
      'pandas',
    ]);
  });
  test('pom.xml', () => {
    expect(parsePom('<dependency><artifactId>spring-boot-starter-web</artifactId></dependency>')).toEqual(['spring-boot-starter-web']);
  });
  test('build.gradle', () => {
    const out = parseGradle("plugins { id 'org.springframework.boot' }\nimplementation 'com.mysql:mysql-connector-j:8.0'");
    expect(out).toContain('mysql-connector-j');
    expect(out).toContain('spring-boot-starter');
  });
  test('pyproject (PEP 621 + poetry)', () => {
    const out = parsePyproject('[project]\ndependencies = ["fastapi>=0.1", "uvicorn"]\n[tool.poetry.dependencies]\npython = "^3.11"\ntorch = "^2"\n');
    expect(out).toEqual(expect.arrayContaining(['fastapi', 'uvicorn', 'torch']));
    expect(out).not.toContain('python');
  });
  test('go.mod', () => {
    expect(parseGoMod('module x\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n')).toEqual(['github.com/gin-gonic/gin']);
  });
  test('pubspec.yaml', () => {
    expect(parsePubspec('name: app\ndependencies:\n  flutter:\n    sdk: flutter\n  cloud_firestore: ^4.0.0\ndev_dependencies:\n  test: any\n')).toEqual(
      expect.arrayContaining(['flutter', 'cloud_firestore']),
    );
  });
});

describe('extractSkills', () => {
  const repos: RepoInput[] = [
    {
      name: 'campus-connect',
      pushedAt: '2026-10-01T00:00:00Z',
      languages: { TypeScript: 8000, CSS: 2000 },
      topics: ['react', 'hacktoberfest', 'mern-stack'],
      manifests: { 'package.json': JSON.stringify({ dependencies: { react: '18', express: '4', mongoose: '8' } }) },
      rootEntries: ['Dockerfile', 'README.md'],
    },
    {
      name: 'face-attendance',
      pushedAt: '2026-05-01T00:00:00Z',
      languages: { Python: 10000 },
      topics: ['computer-vision'],
      manifests: { 'requirements.txt': 'opencv-python\nflask\n' },
    },
    { name: 'forked-thing', isFork: true, languages: { Rust: 99999 } },
  ];

  const result = extractSkills(repos, { catalog });
  const keys = result.map((d) => d.key);

  test('detects languages, frameworks, databases, tools and topics', () => {
    expect(keys).toEqual(
      expect.arrayContaining(['typescript', 'css', 'react', 'express', 'nodejs', 'mongodb', 'docker', 'python', 'opencv', 'flask', 'computer-vision']),
    );
  });

  test('ignores forks by default and stoplisted topics', () => {
    expect(keys).not.toContain('rust');
    expect(keys.some((k) => k.includes('hacktoberfest'))).toBe(false);
  });

  test('includes forks when asked', () => {
    expect(extractSkills(repos, { catalog, includeForks: true }).map((d) => d.key)).toContain('rust');
  });

  test('unknown topics are kept as topic suggestions (nothing hidden)', () => {
    const t = result.find((d) => d.key === 'topic:mern-stack');
    expect(t).toBeDefined();
    expect(t!.known).toBe(false);
    expect(t!.label).toBe('Mern Stack');
  });

  test('evidence records repo, signal and code share', () => {
    const react = result.find((d) => d.key === 'react')!;
    expect(react.signals).toEqual(expect.arrayContaining(['topic', 'dependency']));
    expect(react.repos).toEqual(['campus-connect']);
    const python = result.find((d) => d.key === 'python')!;
    expect(python.codeShare).toBeCloseTo(0.5, 2);
    expect(describeEvidence(python)).toMatch(/Seen in 1 repo · 50% of your code/);
  });

  test('React via alias "reactjs" resolves to the same skill', () => {
    const r = extractSkills([{ name: 'x', topics: ['reactjs'] }], { catalog });
    expect(r.map((d) => d.key)).toEqual(['react']);
  });
});
