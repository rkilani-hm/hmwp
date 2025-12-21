import { Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from './Dashboard';
import NewPermit from './NewPermit';
import PermitsList from './PermitsList';
import PermitDetail from './PermitDetail';

const Index = () => {
  const { roles } = useAuth();
  
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

  return (
    <AppLayout currentRole={currentRole}>
      <Routes>
        <Route index element={<Dashboard currentRole={currentRole} />} />
        <Route path="new-permit" element={<NewPermit />} />
        <Route path="permits" element={<PermitsList currentRole={currentRole} />} />
        <Route path="permits/:id" element={<PermitDetail currentRole={currentRole} />} />
        <Route path="approvals" element={<PermitsList currentRole={currentRole} />} />
        <Route path="close-permits" element={<PermitsList currentRole={currentRole} />} />
        <Route path="approvers" element={<Dashboard currentRole={currentRole} />} />
        <Route path="work-types" element={<Dashboard currentRole={currentRole} />} />
      </Routes>
    </AppLayout>
  );
};

export default Index;
