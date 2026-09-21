import { useEffect, useState } from 'react';
import {
  useSharePointSettings, useSaveSharePointSettings, useTestSharePoint, useSharePointUploads,
} from '@/hooks/useSharePointArchive';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, CloudUpload, CheckCircle2, XCircle, PlugZap, ExternalLink, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function SharePointArchiveConfig() {
  const { data: settings, isLoading } = useSharePointSettings();
  const { data: uploads } = useSharePointUploads(15);
  const save = useSaveSharePointSettings();
  const test = useTestSharePoint();

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('');
  const [sitePath, setSitePath] = useState('');
  const [library, setLibrary] = useState('');
  const [folder, setFolder] = useState('Work Permits/{yyyy}/{MM}');
  const [filename, setFilename] = useState('{permit_no}.pdf');

  useEffect(() => {
    if (!settings) return;
    setEnabled(!!settings.enabled);
    setHost(settings.site_hostname ?? '');
    setSitePath(settings.site_path ?? '');
    setLibrary(settings.library_name ?? '');
    setFolder(settings.folder_path ?? 'Work Permits/{yyyy}/{MM}');
    setFilename(settings.filename_template ?? '{permit_no}.pdf');
  }, [settings]);

  const onSave = () => save.mutate({
    enabled, site_hostname: host.trim() || null, site_path: sitePath.trim() || null,
    library_name: library.trim() || null, folder_path: folder.trim() || null,
    filename_template: filename.trim() || '{permit_no}.pdf',
  });

  const badge = (status: string) => {
    if (status === 'uploaded') return <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="w-3.5 h-3.5" />Uploaded</span>;
    if (status === 'failed') return <span className="inline-flex items-center gap-1 text-xs text-destructive"><XCircle className="w-3.5 h-3.5" />Failed</span>;
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Skipped</span>;
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <CloudUpload className="w-6 h-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold">SharePoint Archive</h1>
          <p className="text-sm text-muted-foreground">
            Automatically save a copy of every <strong>fully approved</strong> work-permit PDF to a SharePoint document library.
          </p>
        </div>
      </div>

      {/* Prerequisite notice */}
      <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">One-time IT prerequisite</p>
          <p className="text-muted-foreground">
            The Microsoft 365 app registration used for email must also be granted the Graph application permission{' '}
            <strong>Sites.ReadWrite.All</strong> (admin-consented). Until then, uploads and the test will fail with an access error.
          </p>
        </div>
      </div>

      {/* Destination */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Destination</CardTitle>
          <CardDescription>Where approved permit PDFs are stored. Set this, then run “Test connection”.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">Enable SharePoint archiving</p>
                  <p className="text-xs text-muted-foreground">When on, each fully-approved permit PDF is uploaded automatically.</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="host">Site hostname</Label>
                  <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="alhamra.sharepoint.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sitepath">Site path <span className="text-muted-foreground text-xs">(blank = root site)</span></Label>
                  <Input id="sitepath" value={sitePath} onChange={(e) => setSitePath(e.target.value)} placeholder="/sites/FMU" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lib">Document library <span className="text-muted-foreground text-xs">(blank = default)</span></Label>
                  <Input id="lib" value={library} onChange={(e) => setLibrary(e.target.value)} placeholder="Documents" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="folder">Folder path</Label>
                  <Input id="folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Work Permits/{yyyy}/{MM}" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fn">File name</Label>
                  <Input id="fn" value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="{permit_no}.pdf" />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Placeholders: <code>{'{permit_no}'}</code>, <code>{'{work_type}'}</code>, <code>{'{yyyy}'}</code>, <code>{'{MM}'}</code>, <code>{'{dd}'}</code>, <code>{'{date}'}</code>.
                Missing folders are created automatically on upload.
              </p>

              {settings?.last_test_at && (
                <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${settings.last_test_ok ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'}`}>
                  {settings.last_test_ok ? <CheckCircle2 className="w-4 h-4 text-success mt-0.5" /> : <XCircle className="w-4 h-4 text-destructive mt-0.5" />}
                  <div>
                    <p className="font-medium">Last test — {format(parseISO(settings.last_test_at), 'dd MMM yyyy, HH:mm')}</p>
                    <p className="text-muted-foreground break-words">{settings.last_test_message}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => test.mutate({
                  site_hostname: host.trim() || null, site_path: sitePath.trim() || null,
                  library_name: library.trim() || null, folder_path: folder.trim() || null,
                })} disabled={test.isPending || !host.trim()}>
                  {test.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlugZap className="w-4 h-4 mr-2" />}
                  Test connection
                </Button>
                <Button onClick={onSave} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save settings
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent uploads */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent uploads</CardTitle>
          <CardDescription>Every archive attempt is logged here.</CardDescription>
        </CardHeader>
        <CardContent>
          {(uploads ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet — they appear here once permits are approved with archiving on.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {(uploads ?? []).map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.permit_no || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {format(parseISO(u.created_at), 'dd MMM, HH:mm')}
                      {u.folder_path ? ` · ${u.folder_path}` : ''}
                      {u.error_message ? ` · ${u.error_message}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {badge(u.status)}
                    {u.web_url && (
                      <a href={u.web_url} target="_blank" rel="noreferrer" className="text-primary" title="Open in SharePoint">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
