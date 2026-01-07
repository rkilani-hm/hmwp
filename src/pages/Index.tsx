import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from './Dashboard';
import NewPermit from './NewPermit';
import PermitsList from './PermitsList';
import PermitDetail from './PermitDetail';
import ApproverInbox from './ApproverInbox';
import ApproverOutbox from './ApproverOutbox';
import ApproversManagement from './admin/ApproversManagement';
import WorkTypesManagement from './admin/WorkTypesManagement';
import RolesManagement from './admin/RolesManagement';
import PermissionsManagement from './admin/PermissionsManagement';
import Reports from './admin/Reports';
import SLADashboard from './admin/SLADashboard';
import UserActivityLogs from './admin/UserActivityLogs';
import MyPerformance from './MyPerformance';
import ApproverPerformance from './admin/ApproverPerformance';
import ScanVerify from './ScanVerify';
const Index = () => {
  const { roles, hasRole } = useAuth();
  
  // Get the primary role for navigation
  const getPrimaryRole = () => {
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('helpdesk')) return 'helpdesk';
    const approverRoles = ['pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'ecovert_supervisor', 'pmd_coordinator'] as const;
    for (const role of approverRoles) {
      if (roles.includes(role)) return role;
    }
    return 'contractor';
  };

  const currentRole = getPrimaryRole();
  const isAdmin = hasRole('admin');
  const isApprover = roles.some(r => ['helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'ecovert_supervisor', 'pmd_coordinator'].includes(r));

  return (
    <AppLayout currentRole={currentRole}>
      <Routes>
        <Route index element={<Dashboard currentRole={currentRole} />} />
        <Route path="new-permit" element={<NewPermit />} />
        <Route path="permits" element={<PermitsList currentRole={currentRole} />} />
        <Route path="permits/:id" element={<PermitDetail currentRole={currentRole} />} />
        <Route path="inbox" element={isApprover ? <ApproverInbox /> : <Navigate to="/" replace />} />
        <Route path="outbox" element={isApprover ? <ApproverOutbox /> : <Navigate to="/" replace />} />
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
          path="roles" 
          element={isAdmin ? <RolesManagement /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="permissions" 
          element={isAdmin ? <PermissionsManagement /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="reports" 
          element={isAdmin ? <Reports /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="sla-dashboard" 
          element={isAdmin ? <SLADashboard /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="activity-logs" 
          element={isAdmin ? <UserActivityLogs /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="my-performance" 
          element={isApprover ? <MyPerformance /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="approver-performance" 
          element={isAdmin ? <ApproverPerformance /> : <Navigate to="/" replace />} 
        />
        <Route path="scan-verify" element={<ScanVerify />} />
      </Routes>
    </AppLayout>
  );
};

export default Index;
