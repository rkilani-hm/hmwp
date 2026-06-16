/**
 * UserManuals — role-gated bilingual help center.
 *
 * Tabs visible per role:
 *   - tenant-only : [client]
 *   - approver    : [client, internal, approver]
 *   - admin       : [client, internal, approver, admin]
 *
 * Content lives in src/components/manuals/manualContent.ts as data
 * objects with {en, ar} fields — the renderer flips on the global
 * LanguageContext, so the active tab automatically switches language
 * when the user toggles via the header LanguageToggle (or Settings).
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Printer, HardHat, Users, Shield, Building } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsTenantOnly } from '@/hooks/useIsTenantOnly';
import { useLanguage } from '@/contexts/LanguageContext';
import ManualRenderer from '@/components/manuals/ManualRenderer';
import {
  MANUALS,
  MANUAL_TAB_LABELS,
  type ManualKey,
} from '@/components/manuals/manualContent';

const TAB_ICONS: Record<ManualKey, React.ComponentType<{ className?: string }>> = {
  client: HardHat,
  internal: Building,
  approver: Users,
  admin: Shield,
};

const UserManuals = () => {
  const { roles } = useAuth();
  const isTenantOnly = useIsTenantOnly();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const isAdmin = useMemo(
    () => (roles ?? []).map((r) => String(r).toLowerCase()).includes('admin'),
    [roles],
  );
  const isApproverUser = useMemo(() => {
    const norm = (roles ?? []).map((r) => String(r).toLowerCase());
    return !isTenantOnly && norm.some((r) => r && r !== 'tenant');
  }, [roles, isTenantOnly]);

  // Determine which tabs this user can see
  const visibleTabs: ManualKey[] = useMemo(() => {
    if (isAdmin) return ['client', 'internal', 'approver', 'admin'];
    if (isApproverUser) return ['client', 'internal', 'approver'];
    if (isTenantOnly) return ['client'];
    return ['client'];
  }, [isAdmin, isApproverUser, isTenantOnly]);

  // Default tab based on primary role
  const defaultTab: ManualKey = isAdmin
    ? 'admin'
    : isApproverUser
      ? 'approver'
      : 'client';

  const [activeTab, setActiveTab] = useState<ManualKey>(defaultTab);

  // Keep activeTab valid if visibility changes (roles loading)
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'client');
    }
  }, [visibleTabs, activeTab]);

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open('', '_blank');
    if (!win) return;

    const manual = MANUALS[activeTab];
    const manualTitle = manual.title[language];
    const dir = isAr ? 'rtl' : 'ltr';

    win.document.write(`
      <!DOCTYPE html>
      <html dir="${dir}" lang="${language}">
        <head>
          <title>${manualTitle}</title>
          <style>
            body { font-family: ${isAr ? "'Tahoma', 'Arial'" : "'Segoe UI', Tahoma, sans-serif"}; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; direction: ${dir}; }
            h1 { color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 10px; }
            h2 { color: #2c5282; margin-top: 30px; border-bottom: 1px solid #bee3f8; padding-bottom: 5px; }
            ol, ul { ${isAr ? 'padding-right: 25px; padding-left: 0;' : 'padding-left: 25px;'} }
            li { margin: 5px 0; }
            .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <div class="footer">
            <p>${manualTitle}</p>
            <p>${new Date().toLocaleDateString(isAr ? 'ar' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  const gridColsClass =
    visibleTabs.length === 1
      ? 'grid-cols-1'
      : visibleTabs.length === 2
        ? 'grid-cols-2'
        : visibleTabs.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-4';

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">
              {isAr ? 'أدلة المستخدم' : 'User Manuals'}
            </h1>
            <p className="text-muted-foreground">
              {isAr
                ? 'إرشادات حسب الدور لاستخدام النظام'
                : 'Role-specific guides for using the system'}
            </p>
          </div>
        </div>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          {isAr ? 'طباعة / حفظ PDF' : 'Print / Save as PDF'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ManualKey)}>
        <TabsList className={`grid w-full ${gridColsClass}`}>
          {visibleTabs.map((key) => {
            const Icon = TAB_ICONS[key];
            return (
              <TabsTrigger key={key} value={key} className="gap-2">
                <Icon className="h-4 w-4" />
                {MANUAL_TAB_LABELS[key][language]}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <Card className="mt-4">
          <CardContent className="p-6">
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div ref={printRef}>
                {visibleTabs.map((key) => (
                  <TabsContent key={key} value={key} className="mt-0">
                    <ManualRenderer manual={MANUALS[key]} lang={language} />
                  </TabsContent>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

export default UserManuals;
