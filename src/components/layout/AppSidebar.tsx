import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  Users,
  Settings,
  LogOut,
  Shield,
  Wrench,
  Building,
  Zap,
  HardHat,
  Leaf,
  Cog,
  UserCheck,
  ChevronDown,
  BarChart3,
  Timer,
  Send,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

type UserRole = 'contractor' | 'helpdesk' | 'pm' | 'pd' | 'bdcr' | 'mpr' | 'it' | 'fitout' | 'soft_facilities' | 'hard_facilities' | 'pm_service' | 'admin';

const roleLabels: Record<UserRole, string> = {
  contractor: 'Contractor',
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  soft_facilities: 'Soft Facilities',
  hard_facilities: 'Hard Facilities',
  pm_service: 'PM Service Provider',
  admin: 'Administrator',
};

interface AppSidebarProps {
  currentRole: UserRole;
}

const navigationItems = {
  contractor: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FileText, label: 'New Permit', path: '/new-permit' },
    { icon: ClipboardCheck, label: 'My Permits', path: '/permits' },
  ],
  helpdesk: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FileText, label: 'New Permit', path: '/new-permit' },
    { icon: ClipboardCheck, label: 'Inbox', path: '/inbox' },
    { icon: Send, label: 'Outbox', path: '/outbox' },
    { icon: ClipboardCheck, label: 'All Permits', path: '/permits' },
    { icon: ClipboardCheck, label: 'Close Permits', path: '/close-permits' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FileText, label: 'New Permit', path: '/new-permit' },
    { icon: ClipboardCheck, label: 'Inbox', path: '/inbox' },
    { icon: Send, label: 'Outbox', path: '/outbox' },
    { icon: ClipboardCheck, label: 'All Permits', path: '/permits' },
    { icon: Timer, label: 'SLA Dashboard', path: '/sla-dashboard' },
    { icon: BarChart3, label: 'Reports', path: '/reports' },
    { icon: Users, label: 'User Management', path: '/approvers' },
    { icon: Settings, label: 'Work Types', path: '/work-types' },
  ],
  approver: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FileText, label: 'New Permit', path: '/new-permit' },
    { icon: ClipboardCheck, label: 'Inbox', path: '/inbox' },
    { icon: Send, label: 'Outbox', path: '/outbox' },
    { icon: ClipboardCheck, label: 'History', path: '/permits' },
  ],
};

const getRoleIcon = (role: UserRole) => {
  const icons: Record<UserRole, typeof Shield> = {
    contractor: HardHat,
    helpdesk: Users,
    pm: Building,
    pd: Wrench,
    bdcr: Shield,
    mpr: Zap,
    it: Cog,
    fitout: Wrench,
    soft_facilities: Leaf,
    hard_facilities: Cog,
    pm_service: UserCheck,
    admin: Settings,
  };
  return icons[role];
};

const getNavItems = (role: UserRole) => {
  if (role === 'contractor') return navigationItems.contractor;
  if (role === 'helpdesk') return navigationItems.helpdesk;
  if (role === 'admin') return navigationItems.admin;
  return navigationItems.approver;
};

export function AppSidebar({ currentRole }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const navItems = getNavItems(currentRole);
  const RoleIcon = getRoleIcon(currentRole);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={alHamraLogo} 
              alt="Al Hamra" 
              className="h-12 w-auto object-contain"
            />
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Role Display */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3 py-3 px-3 bg-sidebar-accent rounded-lg">
          <div className="w-8 h-8 bg-sidebar-primary/20 rounded-lg flex items-center justify-center">
            <RoleIcon className="w-4 h-4 text-sidebar-primary" />
          </div>
          <div className="text-left">
            <p className="text-xs text-sidebar-foreground/60">Current Role</p>
            <p className="text-sm font-medium">{roleLabels[currentRole]}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-sidebar-primary/20 text-sidebar-primary text-sm">
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{profile?.email}</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
