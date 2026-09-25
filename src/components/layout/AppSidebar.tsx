import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import alHamraLogo from '@/assets/al-hamra-logo.png';
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
  Share2,
  ChevronDown,
  BarChart3,
  Timer,
  CloudUpload,
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
  Stethoscope,
  Mail,
  PencilLine,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Wraps the matching part of `text` in a highlighted mark while searching. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-sidebar-primary/30 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

type UserRole = string;

const roleLabels: Record<string, string> = {
  tenant: 'Tenant',
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
  /** Called after any menu item is opened — used to close the mobile drawer. */
  onNavigate?: () => void;
}

const getNavGroups = (role: UserRole): NavGroup[] => {
  if (role === 'tenant') {
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
          { icon: FileText, label: 'New Request', path: '/new-request' },
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
          // Delegation hands off APPROVAL authority — an approver-only concept.
          // Tenants have none, so it's omitted from the tenant menu.
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
          { icon: HardHat, label: 'New Internal Request', path: '/new-internal-request' },
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
          { icon: Share2, label: 'My Delegations', path: '/delegations' },
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
          { icon: HardHat, label: 'New Internal Request', path: '/new-internal-request' },
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
          { icon: Share2, label: 'My Delegations', path: '/delegations' },
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
          { icon: UserCheck, label: 'Pending Approvals', path: '/pending-tenants' },
          { icon: Users, label: 'User Management', path: '/approvers' },
          { icon: HardHat, label: 'Contractors', path: '/contractors' },
          { icon: Building, label: 'Departments', path: '/departments' },
          { icon: Shield, label: 'Roles', path: '/roles' },
          { icon: Key, label: 'Permissions', path: '/permissions' },
          { icon: Stethoscope, label: 'Approver Audit', path: '/approver-audit' },
          { icon: PencilLine, label: 'Permit Amendments', path: '/amendments' },
          { icon: Activity, label: 'Deletion Audit Log', path: '/deletion-audit-log' },
          { icon: Mail, label: 'Email Delivery Log', path: '/email-log' },
        ],
      },
      {
        label: 'Configuration',
        icon: FolderCog,
        items: [
          { icon: GitBranch, label: 'Workflow Builder', path: '/workflow-builder' },
          { icon: Timer, label: 'SLA Configuration', path: '/sla-config' },
          { icon: CloudUpload, label: 'SharePoint Archive', path: '/sharepoint-archive' },
          { icon: Cog, label: 'Work Types', path: '/work-types' },
          { icon: MapPin, label: 'Work Locations', path: '/work-locations' },
          { icon: Package, label: 'Gate Pass Workflows', path: '/gate-pass-workflows' },
          { icon: QrCode, label: 'QR Code Poster', path: '/qr-poster' },
          { icon: Mail, label: 'Approved Permit Recipients', path: '/approved-permit-recipients' },
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
        { icon: HardHat, label: 'New Internal Request', path: '/new-internal-request' },
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
        { icon: Share2, label: 'My Delegations', path: '/delegations' },
        { icon: BookOpen, label: 'User Manuals', path: '/user-manuals' },
        { icon: Settings, label: 'Settings', path: '/settings' },
      ],
    },
  ];
};

const getRoleIcon = (role: UserRole) => {
  const icons: Record<string, typeof Shield> = {
    tenant: HardHat,
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

function SidebarNavGroup({
  group,
  searchQuery = '',
  activePath,
  onNavigate,
}: {
  group: NavGroup;
  searchQuery?: string;
  /** Path of the keyboard-selected item (arrow keys in search). */
  activePath?: string | null;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const isGroupActive = group.items.some(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );

  const q = searchQuery.trim().toLowerCase();
  const visibleItems = q
    ? group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q),
      )
    : group.items;

  // While searching, always force-open the group so matches show without an extra click.
  const forceOpen = q.length > 0;

  if (visibleItems.length === 0) return null;

  // Single-item groups render inline, no collapsible
  if (group.items.length === 1 || (forceOpen && visibleItems.length === 1 && !q)) {
    const item = visibleItems[0];
    return (
      <NavLink
        to={item.path}
        end={item.path === '/'}
        onClick={onNavigate}
        data-nav-path={item.path}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            isActive
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            activePath === item.path && 'bg-sidebar-accent text-sidebar-foreground ring-1 ring-sidebar-primary'
          )
        }
      >
        <item.icon className="w-5 h-5" />
        <Highlight text={item.label} query={searchQuery} />
      </NavLink>
    );
  }

  // While searching with a multi-item group, render the header + flat list (no toggle).
  if (forceOpen) {
    return (
      <div>
        <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          <group.icon className="w-3.5 h-3.5" />
          {group.label}
        </div>
        <div className="mt-0.5 space-y-0.5 ml-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              data-nav-path={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  activePath === item.path && 'bg-sidebar-accent text-sidebar-foreground ring-1 ring-sidebar-primary'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              <Highlight text={item.label} query={searchQuery} />
            </NavLink>
          ))}
        </div>
      </div>
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
              onClick={onNavigate}
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

export function AppSidebar({ currentRole, onNavigate }: AppSidebarProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const navGroups = getNavGroups(currentRole);
  const RoleIcon = getRoleIcon(currentRole);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return navGroups;
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [navGroups, search]);

  const hasResults = filteredGroups.length > 0;

  // Flat list of visible items for arrow-key navigation while searching.
  const flatItems = useMemo(
    () => (search.trim() ? filteredGroups.flatMap((g) => g.items) : []),
    [filteredGroups, search],
  );
  const activePath = activeIndex >= 0 ? (flatItems[activeIndex]?.path ?? null) : null;

  // Reset the keyboard selection whenever the query changes.
  useEffect(() => setActiveIndex(-1), [search]);

  // Keep the keyboard-selected item in view.
  useEffect(() => {
    if (!activePath) return;
    document
      .querySelector(`[data-nav-path="${CSS.escape(activePath)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activePath]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!flatItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flatItems.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      navigate(flatItems[activeIndex].path);
      onNavigate?.();
      setSearch('');
      setActiveIndex(-1);
    } else if (e.key === 'Escape') {
      setSearch('');
      setActiveIndex(-1);
    }
  };

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

      {/* Search */}
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 pointer-events-none" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search menu..."
            className="pl-9 pr-8 h-9 bg-sidebar-accent border-sidebar-border text-sm placeholder:text-sidebar-foreground/40 focus-visible:ring-sidebar-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground/80"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation — scrolls independently of the header/user footer */}
      <nav className="flex-1 min-h-0 p-4 pt-2 space-y-2 overflow-y-auto overscroll-contain">
        {hasResults ? (
          filteredGroups.map((group) => (
            <SidebarNavGroup
              key={group.label}
              group={group}
              searchQuery={search}
              activePath={activePath}
              onNavigate={onNavigate}
            />
          ))
        ) : (
          <p className="px-3 py-6 text-center text-sm text-sidebar-foreground/50">
            No matching menu items
          </p>
        )}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-sidebar-border shrink-0">
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
