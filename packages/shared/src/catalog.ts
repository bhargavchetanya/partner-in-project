/**
 * Default catalogue seeded into the database. Administrators can extend it
 * later from the admin dashboard (skills, categories, roles, interests).
 */

export interface CategorySeed {
  slug: string;
  name: string;
  order: number;
}

export interface SkillSeed {
  slug: string;
  name: string;
  category: string; // category slug
  aliases?: string[];
}

export interface NamedSeed {
  slug: string;
  name: string;
}

export const SKILL_CATEGORIES: CategorySeed[] = [
  { slug: 'languages', name: 'Programming Languages', order: 1 },
  { slug: 'frontend', name: 'Frontend', order: 2 },
  { slug: 'backend', name: 'Backend & APIs', order: 3 },
  { slug: 'mobile', name: 'Mobile', order: 4 },
  { slug: 'databases', name: 'Databases', order: 5 },
  { slug: 'ai-data', name: 'AI, ML & Data', order: 6 },
  { slug: 'devops-cloud', name: 'DevOps & Cloud', order: 7 },
  { slug: 'tools', name: 'Tools & Libraries', order: 8 },
  { slug: 'testing', name: 'Testing', order: 9 },
  { slug: 'design', name: 'Design', order: 10 },
  { slug: 'domains', name: 'Domains & Topics', order: 11 },
  { slug: 'other', name: 'Other', order: 99 },
];

const L = 'languages';
const F = 'frontend';
const B = 'backend';
const M = 'mobile';
const D = 'databases';
const A = 'ai-data';
const O = 'devops-cloud';
const T = 'tools';
const Q = 'testing';
const G = 'design';
const DM = 'domains';

export const SKILLS: SkillSeed[] = [
  // Languages
  { slug: 'javascript', name: 'JavaScript', category: L, aliases: ['js', 'es6', 'ecmascript'] },
  { slug: 'typescript', name: 'TypeScript', category: L, aliases: ['ts'] },
  { slug: 'python', name: 'Python', category: L, aliases: ['python3', 'py'] },
  { slug: 'java', name: 'Java', category: L },
  { slug: 'c', name: 'C', category: L },
  { slug: 'cpp', name: 'C++', category: L, aliases: ['c++', 'cplusplus', 'cpp'] },
  { slug: 'csharp', name: 'C#', category: L, aliases: ['c#', 'c-sharp', 'csharp'] },
  { slug: 'go', name: 'Go', category: L, aliases: ['golang'] },
  { slug: 'rust', name: 'Rust', category: L },
  { slug: 'kotlin', name: 'Kotlin', category: L },
  { slug: 'swift', name: 'Swift', category: L },
  { slug: 'dart', name: 'Dart', category: L },
  { slug: 'php', name: 'PHP', category: L },
  { slug: 'ruby', name: 'Ruby', category: L },
  { slug: 'r', name: 'R', category: L, aliases: ['r-lang', 'rlang'] },
  { slug: 'scala', name: 'Scala', category: L },
  { slug: 'matlab', name: 'MATLAB', category: L },
  { slug: 'solidity', name: 'Solidity', category: L },
  { slug: 'shell', name: 'Shell / Bash', category: L, aliases: ['bash', 'shell-script', 'shellscript', 'zsh'] },
  { slug: 'sql', name: 'SQL', category: L, aliases: ['plsql', 'tsql'] },
  { slug: 'html', name: 'HTML', category: L, aliases: ['html5'] },
  { slug: 'css', name: 'CSS', category: L, aliases: ['css3'] },
  { slug: 'sass', name: 'Sass / SCSS', category: L, aliases: ['scss'] },
  { slug: 'verilog', name: 'Verilog', category: L, aliases: ['systemverilog', 'vhdl'] },
  { slug: 'assembly', name: 'Assembly', category: L, aliases: ['asm'] },
  { slug: 'haskell', name: 'Haskell', category: L },
  { slug: 'lua', name: 'Lua', category: L },
  { slug: 'julia', name: 'Julia', category: L },

  // Frontend
  { slug: 'react', name: 'React', category: F, aliases: ['reactjs', 'react-js', 'react.js'] },
  { slug: 'nextjs', name: 'Next.js', category: F, aliases: ['next', 'next-js', 'next.js'] },
  { slug: 'vue', name: 'Vue.js', category: F, aliases: ['vuejs', 'vue-js', 'vue.js', 'vue3'] },
  { slug: 'nuxt', name: 'Nuxt', category: F, aliases: ['nuxtjs', 'nuxt.js'] },
  { slug: 'angular', name: 'Angular', category: F, aliases: ['angularjs'] },
  { slug: 'svelte', name: 'Svelte', category: F, aliases: ['sveltekit'] },
  { slug: 'tailwindcss', name: 'Tailwind CSS', category: F, aliases: ['tailwind', 'tailwind-css'] },
  { slug: 'bootstrap', name: 'Bootstrap', category: F },
  { slug: 'redux', name: 'Redux', category: F, aliases: ['redux-toolkit', 'reduxjs'] },
  { slug: 'jquery', name: 'jQuery', category: F },
  { slug: 'threejs', name: 'Three.js', category: F, aliases: ['three', 'three.js'] },
  { slug: 'vite', name: 'Vite', category: F, aliases: ['vitejs'] },
  { slug: 'webpack', name: 'Webpack', category: F },
  { slug: 'material-ui', name: 'Material UI', category: F, aliases: ['mui', 'materialui'] },
  { slug: 'framer-motion', name: 'Framer Motion', category: F, aliases: ['framer'] },
  { slug: 'd3', name: 'D3.js', category: F, aliases: ['d3js', 'd3.js'] },
  { slug: 'chartjs', name: 'Chart.js', category: F, aliases: ['chart.js'] },
  { slug: 'streamlit', name: 'Streamlit', category: F },

  // Backend
  { slug: 'nodejs', name: 'Node.js', category: B, aliases: ['node', 'node-js', 'node.js'] },
  { slug: 'express', name: 'Express.js', category: B, aliases: ['expressjs', 'express-js', 'express.js'] },
  { slug: 'nestjs', name: 'NestJS', category: B, aliases: ['nest'] },
  { slug: 'django', name: 'Django', category: B },
  { slug: 'flask', name: 'Flask', category: B },
  { slug: 'fastapi', name: 'FastAPI', category: B },
  { slug: 'spring-boot', name: 'Spring Boot', category: B, aliases: ['springboot', 'spring', 'spring-framework'] },
  { slug: 'hibernate', name: 'Hibernate', category: B, aliases: ['jpa'] },
  { slug: 'dotnet', name: '.NET', category: B, aliases: ['.net', 'asp.net', 'aspnet', 'dotnet-core'] },
  { slug: 'laravel', name: 'Laravel', category: B },
  { slug: 'rails', name: 'Ruby on Rails', category: B, aliases: ['ruby-on-rails', 'rubyonrails'] },
  { slug: 'graphql', name: 'GraphQL', category: B, aliases: ['apollo', 'apollo-graphql'] },
  { slug: 'rest-api', name: 'REST APIs', category: B, aliases: ['rest', 'restful', 'restful-api', 'api'] },
  { slug: 'socketio', name: 'Socket.IO', category: B, aliases: ['socket.io', 'socket-io', 'websockets', 'websocket'] },
  { slug: 'gin', name: 'Gin (Go)', category: B },
  { slug: 'grpc', name: 'gRPC', category: B },
  { slug: 'jwt', name: 'JWT Auth', category: B, aliases: ['jsonwebtoken'] },
  { slug: 'prisma', name: 'Prisma', category: B },

  // Mobile
  { slug: 'android', name: 'Android', category: M, aliases: ['android-development'] },
  { slug: 'ios', name: 'iOS', category: M, aliases: ['ios-development'] },
  { slug: 'flutter', name: 'Flutter', category: M },
  { slug: 'react-native', name: 'React Native', category: M, aliases: ['reactnative'] },
  { slug: 'jetpack-compose', name: 'Jetpack Compose', category: M, aliases: ['compose'] },
  { slug: 'swiftui', name: 'SwiftUI', category: M },
  { slug: 'expo', name: 'Expo', category: M },

  // Databases
  { slug: 'mongodb', name: 'MongoDB', category: D, aliases: ['mongo', 'mongoose'] },
  { slug: 'mysql', name: 'MySQL', category: D },
  { slug: 'postgresql', name: 'PostgreSQL', category: D, aliases: ['postgres', 'psql', 'pg'] },
  { slug: 'sqlite', name: 'SQLite', category: D },
  { slug: 'redis', name: 'Redis', category: D },
  { slug: 'firebase', name: 'Firebase', category: D, aliases: ['firestore'] },
  { slug: 'supabase', name: 'Supabase', category: D },
  { slug: 'oracle-db', name: 'Oracle DB', category: D, aliases: ['oracle'] },
  { slug: 'cassandra', name: 'Cassandra', category: D },
  { slug: 'elasticsearch', name: 'Elasticsearch', category: D, aliases: ['elastic'] },
  { slug: 'neo4j', name: 'Neo4j', category: D },
  { slug: 'dynamodb', name: 'DynamoDB', category: D },

  // AI / ML / Data
  { slug: 'machine-learning', name: 'Machine Learning', category: A, aliases: ['ml', 'machinelearning'] },
  { slug: 'deep-learning', name: 'Deep Learning', category: A, aliases: ['dl', 'deeplearning', 'neural-networks', 'neural-network'] },
  { slug: 'tensorflow', name: 'TensorFlow', category: A, aliases: ['tf', 'tensorflow2'] },
  { slug: 'keras', name: 'Keras', category: A },
  { slug: 'pytorch', name: 'PyTorch', category: A, aliases: ['torch'] },
  { slug: 'scikit-learn', name: 'scikit-learn', category: A, aliases: ['sklearn', 'scikitlearn'] },
  { slug: 'pandas', name: 'Pandas', category: A },
  { slug: 'numpy', name: 'NumPy', category: A },
  { slug: 'matplotlib', name: 'Matplotlib', category: A, aliases: ['seaborn'] },
  { slug: 'opencv', name: 'OpenCV', category: A, aliases: ['cv2', 'opencv-python'] },
  { slug: 'nlp', name: 'NLP', category: A, aliases: ['natural-language-processing', 'nltk', 'spacy'] },
  { slug: 'computer-vision', name: 'Computer Vision', category: A, aliases: ['cv', 'image-processing'] },
  { slug: 'llm', name: 'LLMs & GenAI', category: A, aliases: ['llms', 'generative-ai', 'genai', 'gpt', 'openai', 'langchain', 'rag', 'large-language-models'] },
  { slug: 'huggingface', name: 'Hugging Face', category: A, aliases: ['transformers', 'hugging-face'] },
  { slug: 'data-analysis', name: 'Data Analysis', category: A, aliases: ['data-analytics', 'eda', 'data-science', 'datascience'] },
  { slug: 'jupyter', name: 'Jupyter', category: A, aliases: ['jupyter-notebook', 'ipynb'] },
  { slug: 'power-bi', name: 'Power BI', category: A, aliases: ['powerbi', 'tableau'] },
  { slug: 'xgboost', name: 'XGBoost', category: A, aliases: ['lightgbm'] },
  { slug: 'reinforcement-learning', name: 'Reinforcement Learning', category: A, aliases: ['rl'] },
  { slug: 'gnn', name: 'Graph Neural Networks', category: A, aliases: ['graph-neural-networks', 'pytorch-geometric'] },

  // DevOps & Cloud
  { slug: 'docker', name: 'Docker', category: O, aliases: ['dockerfile', 'docker-compose'] },
  { slug: 'kubernetes', name: 'Kubernetes', category: O, aliases: ['k8s'] },
  { slug: 'aws', name: 'AWS', category: O, aliases: ['amazon-web-services', 'aws-lambda', 's3', 'ec2'] },
  { slug: 'gcp', name: 'Google Cloud', category: O, aliases: ['google-cloud', 'google-cloud-platform'] },
  { slug: 'azure', name: 'Azure', category: O, aliases: ['microsoft-azure'] },
  { slug: 'github-actions', name: 'GitHub Actions', category: O, aliases: ['ci-cd', 'cicd', 'ci'] },
  { slug: 'linux', name: 'Linux', category: O, aliases: ['ubuntu', 'unix'] },
  { slug: 'nginx', name: 'Nginx', category: O },
  { slug: 'terraform', name: 'Terraform', category: O },
  { slug: 'vercel', name: 'Vercel', category: O },
  { slug: 'netlify', name: 'Netlify', category: O },
  { slug: 'jenkins', name: 'Jenkins', category: O },
  { slug: 'serverless', name: 'Serverless', category: O },

  // Tools
  { slug: 'git', name: 'Git', category: T, aliases: ['github', 'version-control'] },
  { slug: 'postman', name: 'Postman', category: T },
  { slug: 'arduino', name: 'Arduino', category: T, aliases: ['esp32', 'esp8266'] },
  { slug: 'raspberry-pi', name: 'Raspberry Pi', category: T, aliases: ['raspberrypi'] },
  { slug: 'unity', name: 'Unity', category: T, aliases: ['unity3d'] },
  { slug: 'unreal', name: 'Unreal Engine', category: T, aliases: ['unreal-engine'] },
  { slug: 'electron', name: 'Electron', category: T },
  { slug: 'web3', name: 'Web3.js / Ethers', category: T, aliases: ['ethers', 'web3js', 'hardhat', 'truffle'] },
  { slug: 'cmake', name: 'CMake', category: T },
  { slug: 'maven', name: 'Maven', category: T },
  { slug: 'gradle', name: 'Gradle', category: T },
  { slug: 'axios', name: 'Axios', category: T },
  { slug: 'stripe', name: 'Stripe', category: T },
  { slug: 'selenium', name: 'Selenium', category: Q, aliases: ['web-scraping', 'beautifulsoup', 'scrapy'] },

  // Testing
  { slug: 'jest', name: 'Jest', category: Q },
  { slug: 'pytest', name: 'Pytest', category: Q },
  { slug: 'junit', name: 'JUnit', category: Q },
  { slug: 'cypress', name: 'Cypress', category: Q },
  { slug: 'playwright', name: 'Playwright', category: Q },
  { slug: 'mocha', name: 'Mocha / Chai', category: Q, aliases: ['chai'] },
  { slug: 'vitest', name: 'Vitest', category: Q },

  // Design
  { slug: 'figma', name: 'Figma', category: G },
  { slug: 'ui-ux', name: 'UI/UX Design', category: G, aliases: ['ui', 'ux', 'uiux', 'ui-design', 'ux-design'] },
  { slug: 'canva', name: 'Canva', category: G },
  { slug: 'blender', name: 'Blender', category: G },
  { slug: 'adobe-xd', name: 'Adobe XD', category: G, aliases: ['photoshop', 'illustrator'] },

  // Domains & topics
  { slug: 'blockchain', name: 'Blockchain', category: DM, aliases: ['ethereum', 'smart-contracts', 'crypto', 'cryptocurrency', 'defi', 'nft'] },
  { slug: 'iot', name: 'IoT', category: DM, aliases: ['internet-of-things', 'embedded', 'embedded-systems'] },
  { slug: 'cybersecurity', name: 'Cybersecurity', category: DM, aliases: ['security', 'infosec', 'ctf', 'penetration-testing', 'cryptography'] },
  { slug: 'dsa', name: 'Data Structures & Algorithms', category: DM, aliases: ['algorithms', 'data-structures', 'leetcode', 'competitive-programming', 'cp'] },
  { slug: 'game-development', name: 'Game Development', category: DM, aliases: ['gamedev', 'game-dev', 'game'] },
  { slug: 'ar-vr', name: 'AR / VR', category: DM, aliases: ['augmented-reality', 'virtual-reality', 'arvr', 'xr'] },
  { slug: 'networking', name: 'Computer Networks', category: DM, aliases: ['networks', 'computer-networks', 'sdn'] },
  { slug: 'operating-systems', name: 'Operating Systems', category: DM, aliases: ['os'] },
  { slug: 'chrome-extension', name: 'Browser Extensions', category: DM, aliases: ['chrome-extensions', 'browser-extension'] },
  { slug: 'pwa', name: 'Progressive Web Apps', category: DM, aliases: ['progressive-web-app'] },
];

export const ROLES: NamedSeed[] = [
  { slug: 'frontend', name: 'Frontend Developer' },
  { slug: 'backend', name: 'Backend Developer' },
  { slug: 'fullstack', name: 'Full Stack Developer' },
  { slug: 'mobile', name: 'Mobile Developer' },
  { slug: 'ai-ml', name: 'AI/ML Developer' },
  { slug: 'data', name: 'Data Analyst / Scientist' },
  { slug: 'ui-ux', name: 'UI/UX Designer' },
  { slug: 'devops', name: 'DevOps / Cloud Engineer' },
  { slug: 'blockchain', name: 'Blockchain Developer' },
  { slug: 'embedded', name: 'Embedded / IoT Engineer' },
  { slug: 'security', name: 'Security Engineer' },
  { slug: 'game', name: 'Game Developer' },
  { slug: 'research', name: 'Researcher' },
  { slug: 'pm', name: 'Product / Project Manager' },
  { slug: 'presenter', name: 'Pitch & Presentation' },
];

export const INTERESTS: NamedSeed[] = [
  { slug: 'web', name: 'Web Development' },
  { slug: 'ai-ml', name: 'AI / Machine Learning' },
  { slug: 'data-science', name: 'Data Science' },
  { slug: 'mobile', name: 'Mobile Apps' },
  { slug: 'cloud-devops', name: 'Cloud & DevOps' },
  { slug: 'blockchain', name: 'Blockchain & Web3' },
  { slug: 'iot', name: 'IoT & Embedded' },
  { slug: 'cybersecurity', name: 'Cybersecurity' },
  { slug: 'game-dev', name: 'Game Development' },
  { slug: 'ar-vr', name: 'AR / VR' },
  { slug: 'fintech', name: 'FinTech' },
  { slug: 'healthtech', name: 'HealthTech' },
  { slug: 'edtech', name: 'EdTech' },
  { slug: 'sustainability', name: 'Sustainability & Climate' },
  { slug: 'open-source', name: 'Open Source' },
  { slug: 'research', name: 'Research' },
  { slug: 'robotics', name: 'Robotics' },
  { slug: 'ui-ux', name: 'Design & UX' },
  { slug: 'social-impact', name: 'Social Impact' },
  { slug: 'competitive-programming', name: 'Competitive Programming' },
];

/** Email domains that earn the "Verified Student" badge (FR2). Wildcards match subdomains. */
export const DEFAULT_INSTITUTION_DOMAINS: string[] = [
  'thapar.edu',
  '*.thapar.edu',
  '*.ac.in',
  '*.edu.in',
  '*.edu',
  '*.ac.uk',
];

export const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type Proficiency = (typeof PROFICIENCY_LEVELS)[number];

export function isInstitutionalEmail(email: string, domains: string[]): boolean {
  const host = email.split('@')[1]?.toLowerCase().trim();
  if (!host) return false;
  return domains.some((raw) => {
    const d = raw.toLowerCase().trim();
    if (d.startsWith('*.')) {
      const base = d.slice(2);
      return host === base || host.endsWith('.' + base);
    }
    return host === d;
  });
}
