/**
 * Seeds clearly-labelled demo accounts and team posts so the platform is not empty
 * during a demonstration. Safe to run more than once.
 *
 *   npm run seed:demo
 *
 * All demo accounts use the email domain @demo.partnerinproject.app and the
 * password printed at the end.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../db';
import { User, Profile, UserSkill, Opportunity, TeamMember, Application } from '../models';
import { refreshProfileDerived } from '../lib/people';
import { ensureTeamConversation } from '../services/teams';

const PASSWORD = 'DemoPass#2026';
const DOMAIN = 'demo.partnerinproject.app';

interface DemoStudent {
  key: string;
  name: string;
  college: string;
  branch: string;
  year: number;
  headline: string;
  bio: string;
  roles: string[];
  interests: string[];
  hours: number;
  skills: [string, 'beginner' | 'intermediate' | 'advanced' | 'expert'][];
}

const students: DemoStudent[] = [
  { key: 'ananya', name: 'Ananya Sharma', college: 'Thapar Institute of Engineering & Technology', branch: 'COE', year: 3, headline: 'Full-stack dev · MERN', bio: 'I love shipping web apps fast. Built a campus marketplace used by 800+ students.', roles: ['fullstack', 'frontend'], interests: ['web', 'edtech', 'open-source'], hours: 14, skills: [['react', 'advanced'], ['nodejs', 'advanced'], ['express', 'advanced'], ['mongodb', 'intermediate'], ['typescript', 'intermediate'], ['tailwindcss', 'advanced']] },
  { key: 'rahul', name: 'Rahul Verma', college: 'IIT Delhi', branch: 'CSE', year: 4, headline: 'ML engineer · NLP & LLMs', bio: 'Research intern working on retrieval-augmented generation. Kaggle expert.', roles: ['ai-ml', 'research'], interests: ['ai-ml', 'research', 'data-science'], hours: 10, skills: [['python', 'expert'], ['pytorch', 'advanced'], ['huggingface', 'advanced'], ['llm', 'advanced'], ['nlp', 'advanced'], ['fastapi', 'intermediate']] },
  { key: 'priya', name: 'Priya Nair', college: 'NIT Trichy', branch: 'ECE', year: 2, headline: 'UI/UX designer who codes', bio: 'Figma-first designer. I prototype, test with users, and hand off clean specs.', roles: ['ui-ux', 'frontend'], interests: ['ui-ux', 'social-impact', 'healthtech'], hours: 12, skills: [['figma', 'expert'], ['ui-ux', 'advanced'], ['html', 'advanced'], ['css', 'advanced'], ['react', 'beginner']] },
  { key: 'arjun', name: 'Arjun Mehta', college: 'BITS Pilani', branch: 'CS', year: 3, headline: 'Backend & cloud · Java/Spring', bio: 'Spring Boot microservices, Docker, and AWS. Winner of two national hackathons.', roles: ['backend', 'devops'], interests: ['cloud-devops', 'fintech', 'web'], hours: 16, skills: [['java', 'expert'], ['spring-boot', 'advanced'], ['mysql', 'advanced'], ['docker', 'advanced'], ['aws', 'intermediate'], ['kubernetes', 'beginner']] },
  { key: 'sneha', name: 'Sneha Gupta', college: 'Thapar Institute of Engineering & Technology', branch: 'CSE', year: 2, headline: 'Flutter dev · mobile-first', bio: 'Built 3 Play Store apps. Love Firebase and clean architecture.', roles: ['mobile'], interests: ['mobile', 'healthtech', 'social-impact'], hours: 10, skills: [['flutter', 'advanced'], ['dart', 'advanced'], ['firebase', 'advanced'], ['kotlin', 'beginner']] },
  { key: 'kabir', name: 'Kabir Singh', college: 'Punjab Engineering College', branch: 'Electrical', year: 3, headline: 'IoT & embedded systems', bio: 'ESP32, Raspberry Pi and MQTT. Building smart-farming sensor networks.', roles: ['embedded'], interests: ['iot', 'sustainability', 'robotics'], hours: 8, skills: [['iot', 'advanced'], ['arduino', 'advanced'], ['raspberry-pi', 'intermediate'], ['cpp', 'intermediate'], ['python', 'intermediate']] },
  { key: 'meera', name: 'Meera Iyer', college: 'VIT Vellore', branch: 'IT', year: 4, headline: 'Data scientist · analytics', bio: 'I turn messy data into decisions. Pandas, SQL and Power BI dashboards.', roles: ['data', 'ai-ml'], interests: ['data-science', 'fintech', 'ai-ml'], hours: 9, skills: [['python', 'advanced'], ['pandas', 'advanced'], ['sql', 'advanced'], ['scikit-learn', 'intermediate'], ['power-bi', 'advanced']] },
  { key: 'vikram', name: 'Vikram Rao', college: 'IIIT Hyderabad', branch: 'CSE', year: 3, headline: 'Web3 & smart contracts', bio: 'Solidity auditor in training. Shipped a DAO voting dApp at ETHIndia.', roles: ['blockchain', 'backend'], interests: ['blockchain', 'fintech', 'open-source'], hours: 12, skills: [['solidity', 'advanced'], ['web3', 'advanced'], ['blockchain', 'advanced'], ['typescript', 'intermediate'], ['nodejs', 'intermediate']] },
  { key: 'isha', name: 'Isha Kapoor', college: 'Thapar Institute of Engineering & Technology', branch: 'COE', year: 3, headline: 'Security enthusiast · CTF player', bio: 'Top-50 in national CTFs. Interested in web security and secure auth.', roles: ['security', 'backend'], interests: ['cybersecurity', 'competitive-programming'], hours: 8, skills: [['cybersecurity', 'advanced'], ['linux', 'advanced'], ['python', 'advanced'], ['go', 'beginner'], ['docker', 'intermediate']] },
  { key: 'dev', name: 'Dev Patel', college: 'DTU Delhi', branch: 'Software Engineering', year: 2, headline: 'Frontend · React & motion', bio: 'Pixel-perfect UIs with React, Tailwind and Framer Motion.', roles: ['frontend', 'ui-ux'], interests: ['web', 'ui-ux', 'game-dev'], hours: 15, skills: [['react', 'advanced'], ['nextjs', 'intermediate'], ['tailwindcss', 'advanced'], ['framer-motion', 'advanced'], ['javascript', 'advanced']] },
  { key: 'zoya', name: 'Zoya Khan', college: 'Jamia Millia Islamia', branch: 'CSE', year: 4, headline: 'Computer vision researcher', bio: 'Medical imaging with deep learning; one paper at a national conference.', roles: ['ai-ml', 'research'], interests: ['ai-ml', 'healthtech', 'research'], hours: 7, skills: [['python', 'expert'], ['tensorflow', 'advanced'], ['opencv', 'advanced'], ['computer-vision', 'advanced'], ['deep-learning', 'advanced']] },
  { key: 'aman', name: 'Aman Joshi', college: 'Chitkara University', branch: 'CSE', year: 1, headline: 'First-year · learning fast', bio: 'Started with C++ and DSA, now exploring web dev. Looking for my first hackathon team!', roles: ['frontend', 'presenter'], interests: ['web', 'competitive-programming'], hours: 20, skills: [['cpp', 'intermediate'], ['dsa', 'intermediate'], ['html', 'intermediate'], ['css', 'beginner'], ['git', 'beginner']] },
];

const posts = [
  { leader: 'ananya', title: 'CampusCart — peer-to-peer marketplace', event: 'Smart India Hackathon 2026', type: 'hackathon', domains: ['web', 'edtech'], days: 9, size: 4, hours: 12, skills: ['react', 'nodejs', 'mongodb', 'figma', 'docker'], roles: [['backend', 1], ['ui-ux', 1], ['devops', 1]], desc: 'A trusted marketplace for students to buy and sell books, cycles and gadgets on campus, with verified college emails, chat and safe meetup spots.' },
  { leader: 'rahul', title: 'StudyBuddy — RAG tutor for course notes', event: 'HackThapar 2026', type: 'hackathon', domains: ['ai-ml', 'edtech'], days: 6, size: 3, hours: 10, skills: ['python', 'llm', 'fastapi', 'react', 'mongodb'], roles: [['frontend', 1], ['backend', 1]], desc: 'Upload your lecture slides and get a tutor that answers with citations. We have the retrieval pipeline; need a polished web app and API.' },
  { leader: 'arjun', title: 'PayLater for canteens', event: 'FinTech Innovation Challenge', type: 'competition', domains: ['fintech', 'web'], days: 14, size: 4, hours: 8, skills: ['java', 'spring-boot', 'mysql', 'react', 'flutter'], roles: [['frontend', 1], ['mobile', 1], ['pm', 1]], desc: 'Micro-credit for campus canteens with UPI settlement and spending insights. Backend is ready; we need the student app and a dashboard.' },
  { leader: 'kabir', title: 'FarmSense — soil moisture network', event: 'Research project (Dept. of EE)', type: 'research', domains: ['iot', 'sustainability'], days: 30, size: 3, hours: 6, skills: ['iot', 'arduino', 'python', 'data-analysis', 'react'], roles: [['data', 1], ['frontend', 1]], desc: 'Low-cost LoRa sensor nodes reporting soil moisture to a dashboard with irrigation recommendations. Looking for data and frontend help.' },
  { leader: 'zoya', title: 'Skin lesion triage app', event: 'HealthTech Hackathon', type: 'hackathon', domains: ['healthtech', 'ai-ml', 'mobile'], days: 4, size: 4, hours: 10, skills: ['tensorflow', 'computer-vision', 'flutter', 'firebase', 'ui-ux'], roles: [['mobile', 1], ['ui-ux', 1], ['backend', 1]], desc: 'On-device model that helps rural clinics prioritise dermatology referrals. Model is trained; we need the mobile app, UX and a sync backend.' },
] as const;

async function main() {
  await connectDb();
  const hash = await bcrypt.hash(PASSWORD, 12);
  const ids = new Map<string, mongoose.Types.ObjectId>();

  for (const s of students) {
    const email = `${s.key}@${DOMAIN}`;
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, name: s.name, passwordHash: hash, emailVerified: true, institutionVerified: false });
    }
    ids.set(s.key, user._id);
    await Profile.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          name: s.name, college: s.college, branch: s.branch, year: s.year, headline: s.headline, bio: s.bio,
          preferredRoles: s.roles, interests: s.interests, availabilityHours: s.hours,
          achievements: [{ title: 'Demo account', description: 'Sample profile created for demonstration.', date: '' }],
        },
      },
      { upsert: true },
    );
    for (const [skill, proficiency] of s.skills) {
      await UserSkill.updateOne(
        { userId: user._id, skill },
        { $setOnInsert: { userId: user._id, skill, source: 'manual', status: 'confirmed', proficiency } },
        { upsert: true },
      );
    }
    await refreshProfileDerived(user._id);
  }

  for (const p of posts) {
    const leaderId = ids.get(p.leader)!;
    if (await Opportunity.exists({ leaderId, title: p.title })) continue;
    const opp = await Opportunity.create({
      leaderId,
      title: p.title,
      description: p.desc,
      eventName: p.event,
      type: p.type,
      domains: p.domains,
      deadline: new Date(Date.now() + p.days * 86400_000),
      teamSize: p.size,
      commitmentHours: p.hours,
      requiredSkills: p.skills,
      openRoles: p.roles.map(([role, slots]) => ({ role, slots, filled: 0 })),
      status: 'open',
      approvedAt: new Date(),
    });
    await TeamMember.create({ opportunityId: opp._id, userId: leaderId, role: 'leader', isLeader: true });
    await ensureTeamConversation(opp);
  }

  // A couple of pending applications so the review screen has content
  const campus = await Opportunity.findOne({ title: posts[0].title });
  if (campus) {
    for (const [key, role] of [['arjun', 'backend'], ['priya', 'ui-ux']] as const) {
      await Application.updateOne(
        { opportunityId: campus._id, applicantId: ids.get(key)! },
        { $setOnInsert: { opportunityId: campus._id, applicantId: ids.get(key)!, role, message: 'Would love to join — I can start this week!', status: 'pending', matchScore: 0 } },
        { upsert: true },
      );
    }
  }

  console.log(`\nDemo data ready: ${students.length} students, ${posts.length} team posts.`);
  console.log(`Log in as any of them, e.g. ananya@${DOMAIN} / ${PASSWORD}\n`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
