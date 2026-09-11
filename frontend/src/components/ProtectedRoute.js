import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/auth.context';
import InitialSetupWizard from '../pages/setup/InitialSetupWizard';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#080d1a]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If the tenant organization has not completed initial configuration (at least 1 platform & 1 keyword),
  // lock the entire application and display the setup wizard.
  if (user.setup_status && user.setup_status.is_configured === false) {
    return <InitialSetupWizard />;
  }

  return children;
};

export default ProtectedRoute;
