import { ReactNode, useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type UserRole = 'contractor' | 'helpdesk' | 'pm' | 'pd' | 'bdcr' | 'mpr' | 'it' | 'fitout' | 'soft_facilities' | 'hard_facilities' | 'pm_service' | 'admin';

interface AppLayoutProps {
  children: ReactNode;
  currentRole: UserRole;
}

export function AppLayout({ children, currentRole }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:relative lg:transform-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <AppSidebar currentRole={currentRole} />
      </div>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b lg:hidden">
          <div className="flex items-center justify-between px-4 h-14">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-display font-semibold">WorkPermit</span>
            <div className="w-10" />
          </div>
        </header>

        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
