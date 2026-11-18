import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AppShell, GuestOnly, RequireAuth } from './components/layout';
import { PageLoader } from './components/ui';
import { Landing } from './pages/Landing';
import { Privacy, Terms } from './pages/Legal';
import { Login, Register, VerifyEmail, ForgotPassword, ResetPassword } from './pages/Auth';
import { NotFound } from './pages/NotFound';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const EditProfile = lazy(() => import('./pages/EditProfile'));
const Skills = lazy(() => import('./pages/Skills'));
const Repos = lazy(() => import('./pages/Repos'));
const Discover = lazy(() => import('./pages/Discover'));
const Opportunities = lazy(() => import('./pages/Opportunities'));
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail'));
const OpportunityForm = lazy(() => import('./pages/OpportunityForm'));
const MyApplications = lazy(() => import('./pages/Applications'));
const ManageApplications = lazy(() => import('./pages/ManageApplications'));
const Teams = lazy(() => import('./pages/Teams'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const SkillGapPage = lazy(() => import('./pages/SkillGap'));
const Messages = lazy(() => import('./pages/Messages'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Connections = lazy(() => import('./pages/Connections'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<RequireAuth />}>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/onboarding" element={<EditProfile onboarding />} />
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/edit" element={<EditProfile />} />
              <Route path="/u/:userId" element={<ProfilePage />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/github" element={<Repos />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/opportunities" element={<Opportunities />} />
              <Route path="/opportunities/new" element={<OpportunityForm />} />
              <Route path="/opportunities/:id" element={<OpportunityDetail />} />
              <Route path="/opportunities/:id/edit" element={<OpportunityForm />} />
              <Route path="/opportunities/:id/applications" element={<ManageApplications />} />
              <Route path="/opportunities/:id/team" element={<TeamPage />} />
              <Route path="/opportunities/:id/skill-gap" element={<SkillGapPage />} />
              <Route path="/applications" element={<MyApplications />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
              <Route path="/admin/:tab" element={<RequireAuth admin><Admin /></RequireAuth>} />
              <Route path="*" element={<NotFound inApp />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
