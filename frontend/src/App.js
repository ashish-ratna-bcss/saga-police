import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './context/auth.context';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './layout';
import Login from './pages/auth/Login';

// Lazy load heavy pages
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const SocialProfiles = lazy(() => import('./pages/profiles/SocialProfiles'));
const AnalyticsHub = lazy(() => import('./pages/analytics/AnalyticsHub'));
const SocialProfileDetail = lazy(() => import('./pages/profiles/SocialProfileDetail'));
const ContentFeed = lazy(() => import('./pages/monitors/ContentFeed'));
const YouTubeMonitor = lazy(() => import('./pages/monitors/YouTubeMonitor'));
const XMonitor = lazy(() => import('./pages/monitors/XMonitor'));
const FacebookMonitor = lazy(() => import('./pages/monitors/FacebookMonitor'));
const InstagramMonitor = lazy(() => import('./pages/monitors/InstagramMonitor'));
const InstagramProfile = lazy(() => import('./pages/monitors/InstagramProfile'));
const Grievances = lazy(() => import('./pages/grievances/Grievances'));
const Alerts = lazy(() => import('./pages/alerts/Alerts'));
const Analytics = lazy(() => import('./pages/legacy-ui/Analytics'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const ActiveThreats = lazy(() => import('./pages/legacy-ui/ActiveThreats'));
const Surveillance = lazy(() => import('./pages/legacy-ui/Surveillance'));
const IntelProcessed = lazy(() => import('./pages/legacy-ui/IntelProcessed'));
const CaseReports = lazy(() => import('./pages/reports/CaseReports'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const HelpGuide = lazy(() => import('./pages/Help'));
const GlobalSearch = lazy(() => import('./pages/intelligence/GlobalSearch'));
const Events = lazy(() => import('./pages/events/Events'));
const Announcements = lazy(() => import('./pages/events/Announcements'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const Periscope = lazy(() => import('./pages/periscope/Periscope'));
const GenerateReport = lazy(() => import('./pages/reports/GenerateReport'));
const Dial100IncidentReporting = lazy(() => import('./pages/reports/Dial100IncidentReporting'));
const UnifiedReports = lazy(() => import('./pages/reports/UnifiedReports'));
const IntelligenceDashboard = lazy(() => import('./pages/intelligence/IntelligenceDashboard'));
const PolicyManager = lazy(() => import('./components/PolicyManager'));
const PersonOfInterest = lazy(() => import('./pages/POI/PersonOfInterest'));
const POIDetail = lazy(() => import('./pages/POI/POIDetail'));
const UsersManagement = lazy(() => import('./pages/admin/UsersManagement'));
const AnalysisTools = lazy(() => import('./pages/intelligence/AnalysisTools'));
const WebIntelligence = lazy(() => import('./pages/intelligence/WebIntelligence'));
const OSINTLayout = lazy(() => import('./pages/osint/OSINTLayout'));
const OSINTDashboard = lazy(() => import('./pages/osint/OSINTDashboard'));
const EmailTools = lazy(() => import('./pages/osint/EmailTools'));
const UsernameTools = lazy(() => import('./pages/osint/UsernameTools'));
const PhoneToolsPage = lazy(() => import('./pages/osint/PhoneTools'));
const ImageIntel = lazy(() => import('./pages/osint/ImageIntel'));
const InfrastructureIntel = lazy(() => import('./pages/osint/InfrastructureIntel'));
const AIAssistantPage = lazy(() => import('./pages/osint/AIAssistant'));
const AskAIPage = lazy(() => import('./pages/osint/AskAI'));
const MasterPromptPage = lazy(() => import('./pages/osint/MasterPrompt'));
const OtherLinksPage = lazy(() => import('./pages/osint/OtherLinks'));
const EventsReport = lazy(() => import('./pages/events/EventsReport'));
const MaigretSearch = lazy(() => import('./pages/intelligence/MaigretSearch'));
const WhatsMyNameSearch = lazy(() => import('./pages/intelligence/WhatsMyNameSearch'));
const AiAssistant = lazy(() => import('./pages/intelligence/AiAssistant'));
const PostLocationLookup = lazy(() => import('./pages/intelligence/PostLocationLookup'));
const SystemHealth = lazy(() => import('./pages/admin/SystemHealth'));
const InitialSetupWizard = lazy(() => import('./pages/setup/InitialSetupWizard'));

// Loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
  </div>
);

import './App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" expand={true} richColors closeButton duration={1000} />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="sources" element={<Navigate to="/social-profiles" replace />} />
              <Route path="social-profiles" element={<SocialProfiles />} />
              <Route path="analytics-hub" element={<AnalyticsHub />} />
              <Route path="social-profiles/:id" element={<SocialProfileDetail />} />
              <Route path="content" element={<ContentFeed />} />
              <Route path="youtube-monitor" element={<YouTubeMonitor />} />
              <Route path="x-monitor" element={<XMonitor />} />
              <Route path="facebook-monitor" element={<FacebookMonitor />} />
              <Route path="instagram-monitor" element={<InstagramMonitor />} />
              <Route path="instagram-monitor/:sourceId" element={<InstagramProfile />} />
              <Route path="grievances" element={<Grievances />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="global-search" element={<GlobalSearch />} />
              <Route path="events" element={<ErrorBoundary label="Events page"><Events /></ErrorBoundary>} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="unified-reports" element={<UnifiedReports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="setup" element={<InitialSetupWizard />} />
              <Route path="intelligence-dashboard" element={<IntelligenceDashboard />} />
              <Route path="policies" element={<PolicyManager />} />
              <Route path="active-threats" element={<ActiveThreats />} />
              <Route path="surveillance" element={<Surveillance />} />
              <Route path="intel-processed" element={<IntelProcessed />} />
              <Route path="case-reports" element={<CaseReports />} />
              <Route path="reports" element={<Reports />} />
              <Route path="periscope" element={<Periscope />} />
              <Route path="reports/generate/:id" element={<GenerateReport />} />
              <Route path="dial-100-incident-reporting" element={<Dial100IncidentReporting />} />
              <Route path="audit-logs" element={<AuditLogs />} />
              <Route path="users-management" element={<UsersManagement />} />
              <Route path="person-of-interest" element={<PersonOfInterest />} />
              <Route path="person-of-interest/:id" element={<POIDetail />} />
              <Route path="analysis-tools" element={<AnalysisTools />} />
              <Route path="web-intelligence" element={<WebIntelligence />} />
              <Route path="system-health" element={<SystemHealth />} />
              <Route path="analysis-tools/osint-tools" element={<OSINTLayout />}>
                <Route index element={<OSINTDashboard />} />
                <Route path="email" element={<EmailTools />} />
                <Route path="username" element={<UsernameTools />} />
                <Route path="phone" element={<PhoneToolsPage />} />
                <Route path="image" element={<ImageIntel />} />
                <Route path="infrastructure" element={<InfrastructureIntel />} />
                <Route path="ai-assistant" element={<AIAssistantPage />} />
                <Route path="ask-ai" element={<AskAIPage />} />
                <Route path="master-prompt" element={<MasterPromptPage />} />
                <Route path="other-links" element={<OtherLinksPage />} />
              </Route>
              <Route path="maigret-search" element={<MaigretSearch />} />
              <Route path="whatsmyname-search" element={<WhatsMyNameSearch />} />
              <Route path="events-report" element={<EventsReport />} />
              <Route path="help" element={<HelpGuide />} />
              <Route path="ai-assistant" element={<AiAssistant />} />
              <Route path="post-location-lookup" element={<PostLocationLookup />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
