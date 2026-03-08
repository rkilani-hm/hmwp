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
  Activity,
  Key,
  QrCode,
  MapPin,
  GitBranch,
  CheckCircle,
  Package,
  BookOpen,
  ScanLine,
  Inbox,
  PieChart,
  ShieldCheck,
  FolderCog,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';

type UserRole = string;

const roleLabels: Record<string, string> = {
  contractor: 'Client',
  customer_service: 'Customer Service',
  cr_coordinator: 'CR Coordinator',
  head_cr: 'Head of CR',
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  ecovert_supervisor: 'Ecovert Supervisor',
  pmd_coordinator: 'PMD Coordinator',
  soft_facilities: 'Soft Facilities',
  hard_facilities: 'Hard Facilities',
  pm_service: 'PM Service',
  fmsp_approval: 'FMSP Approval',
  store_manager: 'Store Manager',
  finance: 'Finance',
  security: 'Security',
  admin: 'Administrator',
};

interface NavItem {
  icon: typeof Shield;
  label: string;
  path: string;
}

interface NavGroup {
  label: string;
  icon: typeof Shield;
  items: NavItem[];
}

interface AppSidebarProps {
  currentRole: UserRole;
}

const getNavGroups = (role: UserRole): NavGroup[] => {
  if (role === 'contractor') {
    return [
      {
        label: 'Main',
        icon: LayoutDashboard,
        items: [
          { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        ],
      },
      {
        label: 'Permits',
        icon: FileText,
        items: [
          { icon: FileText, label: 'New Permit', path: '/new-permit' },
          { icon: ClipboardCheck, label: 'My Permits', path: '/permits' },
        ],
      },
      {
        label: 'Gate Passes',
        icon: Package,
        items: [
          { icon: Package, label: 'Gate Passes', path: '/gate-passes' },
        ],
      },
      {
        label: 'Tools & Support',
        icon: Cog,
        items: [
          { icon: ScanLine, label: 'Scan & Verify', path: '/scan-verify' },
          { icon: BookOpen, label: 'User Manuals', path: '/user-manuals' },
          { icon: Settings, label: 'Settings', path: '/settings' },
        ],
      },
    ];
  }

  if (role === 'helpdesk') {
    return [
      {
        label: 'Main',
        icon: LayoutDashboard,
        items: [
          { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        ],
      },
      {
        label: 'Permits',
        icon: FileText,
        items: [
          { icon: FileText, label: 'New Permit', path: '/new-permit' },
          { icon: Inbox, label: 'Inbox', path: '/inbox' },
          { icon: Send, label: 'Outbox', path: '/outbox' },
          { icon: ClipboardCheck, label: 'All Permits', path: '/permits' },
          { icon: CheckCircle, label: 'Close Permits', path: '/close-permits' },
        ],
      },
      {
        label: 'Gate Passes',
        icon: Package,
        items: [
          { icon: Package, label: 'Gate Passes', path: '/gate-passes' },
        ],
      },
      {
        label: 'Tools & Support',
        icon: Cog,
        items: [
          { icon: ScanLine, label: 'Scan & Verify', path: '/scan-verify' },
          { icon: BookOpen, label: 'User Manuals', path: '/user-manuals' },
          { icon: Settings, label: 'Settings', path: '/settings' },
        ],
      },
    ];
  }

  if (role === 'admin') {
    return [
      {
        label: 'Main',
        icon: LayoutDashboard,
        items: [
          { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        ],
      },
      {
        label: 'Permits',
        icon: FileText,
        items: [
          { icon: FileText, label: 'New Permit', path: '/new-permit' },
          { icon: Inbox, label: 'Inbox', path: '/inbox' },
          { icon: Send, label: 'Outbox', path: '/outbox' },
          { icon: ClipboardCheck, label: 'All Permits', path: '/permits' },
        ],
      },
      {
        label: 'Gate Passes',
        icon: Package,
        items: [
          { icon: Package, label: 'Gate Passes', path: '/gate-passes' },
          { icon: ScanLine, label: 'Scan & Verify', path: '/scan-verify' },
        ],
      },
      {
        label: 'Analytics & Reports',
        icon: PieChart,
        items: [
          { icon: Timer, label: 'SLA Dashboard', path: '/sla-dashboard' },
          { icon: BarChart3, label: 'Approver Performance', path: '/approver-performance' },
          { icon: BarChart3, label: 'Reports', path: '/reports' },
          { icon: Activity, label: 'Activity Logs', path: '/activity-logs' },
        ],
      },
      {
        label: 'Administration',
        icon: ShieldCheck,
        items: [
          { icon: Users, label: 'User Management', path: '/approvers' },
          { icon: Shield, label: 'Roles', path: '/roles' },
          { icon: Key, label: 'Permissions', path: '/permissions' },
        ],
      },
      {
        label: 'Configuration',
        icon: FolderCog,
        items: [
          { icon: GitBranch, label: 'Workflow Builder', path: '/workflow-builder' },
          { icon: Cog, label: 'Work Types', path: '/work-types' },
          { icon: MapPin, label: 'Work Locations', path: '/work-locations' },
          { icon: Package, label: 'Gate Pass Workflows', path: '/gate-pass-workflows' },
          { icon: QrCode, label: 'QR Code Poster', path: '/qr-poster' },
        ],
      },
      {
        label: 'Support',
        icon: BookOpen,
        items: [
          { icon: BookOpen, label: 'User Manuals', path: '/user-manuals' },
          { icon: Settings, label: 'Settings', path: '/settings' },
        ],
      },
    ];
  }

  // Default approver
  return [
    {
      label: 'Main',
      icon: LayoutDashboard,
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
      ],
    },
    {
      label: 'Permits',
      icon: FileText,
      items: [
        { icon: FileText, label: 'New Permit', path: '/new-permit' },
        { icon: Inbox, label: 'Inbox', path: '/inbox' },
        { icon: Send, label: 'Outbox', path: '/outbox' },
        { icon: ClipboardCheck, label: 'History', path: '/permits' },
      ],
    },
    {
      label: 'Gate Passes',
      icon: Package,
      items: [
        { icon: Package, label: 'Gate Passes', path: '/gate-passes' },
      ],
    },
    {
      label: 'Analytics',
      icon: PieChart,
      items: [
        { icon: BarChart3, label: 'My Performance', path: '/my-performance' },
      ],
    },
    {
      label: 'Tools & Support',
      icon: Cog,
      items: [
        { icon: ScanLine, label: 'Scan & Verify', path: '/scan-verify' },
        { icon: BookOpen, label: 'User Manuals', path: '/user-manuals' },
        { icon: Settings, label: 'Settings', path: '/settings' },
      ],
    },
  ];
};

const getRoleIcon = (role: UserRole) => {
  const icons: Record<string, typeof Shield> = {
    contractor: HardHat,
    customer_service: Users,
    cr_coordinator: Users,
    head_cr: Shield,
    helpdesk: Users,
    pm: Building,
    pd: Wrench,
    bdcr: Shield,
    mpr: Zap,
    it: Cog,
    fitout: Wrench,
    ecovert_supervisor: Leaf,
    pmd_coordinator: UserCheck,
    soft_facilities: Leaf,
    hard_facilities: Leaf,
    pm_service: Settings,
    fmsp_approval: CheckCircle,
    store_manager: Package,
    finance: BarChart3,
    security: Shield,
    admin: Settings,
  };
  return icons[role] || Shield;
};

function SidebarNavGroup({ group }: { group: NavGroup }) {
  const location = useLocation();
  const isGroupActive = group.items.some(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );

  // Single-item groups render inline, no collapsible
  if (group.items.length === 1) {
    const item = group.items[0];
    return (
      <NavLink
        to={item.path}
        end={item.path === '/'}
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
    );
  }

  return (
    <Collapsible defaultOpen={isGroupActive}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors">
        <div className="flex items-center gap-2">
          <group.icon className="w-3.5 h-3.5" />
          {group.label}
        </div>
        <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5 ml-1">
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AppSidebar({ currentRole }: AppSidebarProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const navGroups = getNavGroups(currentRole);
  const RoleIcon = getRoleIcon(currentRole);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <img src={alHamraLogo} alt="Al Hamra" className="h-12 w-auto object-contain" />
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
            <p className="text-sm font-medium">
              {roleLabels[currentRole] || currentRole.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navGroups.map((group) => (
          <SidebarNavGroup key={group.label} group={group} />
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
