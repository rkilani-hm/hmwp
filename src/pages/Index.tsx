import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from './Dashboard';
import NewPermit from './NewPermit';
import PermitsList from './PermitsList';
import PermitDetail from './PermitDetail';
import ApproversManagement from './admin/ApproversManagement';
import WorkTypesManagement from './admin/WorkTypesManagement';
import Reports from './admin/Reports';

const Index = () => {
  const { roles, hasRole } = useAuth();
  
  // Get the primary role for navigation
  const getPrimaryRole = () => {
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('helpdesk')) return 'helpdesk';
    const approverRoles = ['pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'soft_facilities', 'hard_facilities', 'pm_service'] as const;
    for (const role of approverRoles) {
      if (roles.includes(role)) return role;
    }
    return 'contractor';
  };

  const currentRole = getPrimaryRole();
  const isAdmin = hasRole('admin');

  return (
    <AppLayout currentRole={currentRole}>
      <Routes>
        <Route index element={<Dashboard currentRole={currentRole} />} />
        <Route path="new-permit" element={<NewPermit />} />
        <Route path="permits" element={<PermitsList currentRole={currentRole} />} />
        <Route path="permits/:id" element={<PermitDetail currentRole={currentRole} />} />
        <Route path="approvals" element={<PermitsList currentRole={currentRole} />} />
        <Route path="close-permits" element={<PermitsList currentRole={currentRole} />} />
        <Route 
          path="approvers" 
          element={isAdmin ? <ApproversManagement /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="work-types" 
          element={isAdmin ? <WorkTypesManagement /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="reports" 
          element={isAdmin ? <Reports /> : <Navigate to="/" replace />} 
        />
      </Routes>
    </AppLayout>
  );
};

export default Index;
