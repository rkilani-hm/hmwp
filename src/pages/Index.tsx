import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { UserRole } from '@/types/workPermit';
import Dashboard from './Dashboard';
import NewPermit from './NewPermit';
import PermitsList from './PermitsList';
import PermitDetail from './PermitDetail';

const Index = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>('contractor');

  return (
    <AppLayout currentRole={currentRole} onRoleChange={setCurrentRole}>
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
