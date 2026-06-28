import { ReactNode, useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type UserRole = string;

interface AppLayoutProps {
  children: ReactNode;
  currentRole: UserRole;
}

export function AppLayout({ children, currentRole }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile sidebar backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transform transition-all duration-200 lg:relative',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          desktopOpen
            ? 'lg:translate-x-0 lg:w-64'
            : 'lg:-translate-x-full lg:w-0 lg:overflow-hidden'
        )}
      >
        <AppSidebar currentRole={currentRole} />
      </div>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={() => setDesktopOpen((v) => !v)}
                aria-label={desktopOpen ? 'Collapse menu' : 'Expand menu'}
              >
                {desktopOpen ? (
                  <PanelLeftClose className="h-5 w-5" />
                ) : (
                  <PanelLeftOpen className="h-5 w-5" />
                )}
              </Button>
            </div>
            <span className="font-display font-semibold lg:hidden">WorkPermit</span>
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
