import { Navigate } from 'react-router-dom';

/** Legacy route — module reports now live on the sidebar Reports page. */
const UnifiedReports = () => <Navigate to="/reports" replace />;

export default UnifiedReports;
