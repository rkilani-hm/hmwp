import { useEffect, useMemo, useState } from 'react';
import { useAdminWorkTypes } from '@/hooks/useAdmin';
import {
  useSLASettings, useSaveSLASettings,
  useSLAPolicies, useSaveSLAPolicy,
  useSLAHolidays, useAddSLAHoliday, useRemoveSLAHoliday,
  type ClockBasis,
} from '@/hooks/useSLAConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Clock, CalendarDays, Loader2, Plus, Trash2, Timer } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // index = Postgres DOW (0=Sun)

// A time value from Postgres comes back as 'HH:MM:SS'; <input type="time"> wants 'HH:MM'.
const toTimeInput = (v: string | undefined) => (v ? v.slice(0, 5) : '');

export default function SLAConfiguration() {
  const { data: settings, isLoading: settingsLoading } = useSLASettings();
  const { data: workTypes, isLoading: typesLoading } = useAdminWorkTypes();
  const { data: policies } = useSLAPolicies();
  const { data: holidays } = useSLAHolidays();

  const saveSettings = useSaveSLASettings();
  const savePolicy = useSaveSLAPolicy();
  const addHoliday = useAddSLAHoliday();
  const removeHoliday = useRemoveSLAHoliday();

  // ---- Global settings form (local mirror, synced when the query resolves) ----
  const [clockBasis, setClockBasis] = useState<ClockBasis>('calendar');
  const [defaultHours, setDefaultHours] = useState('24');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [tz, setTz] = useState('Asia/Kuwait');

  useEffect(() => {
    if (!settings) return;
    setClockBasis(settings.clock_basis);
    setDefaultHours(String(settings.default_sla_hours));
    setStart(toTimeInput(settings.business_start));
    setEnd(toTimeInput(settings.business_end));
    setDays(settings.working_days ?? []);
    setTz(settings.timezone ?? 'Asia/Kuwait');
  }, [settings]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));

  const handleSaveSettings = () => {
    const hrs = Number(defaultHours);
    if (!Number.isFinite(hrs) || hrs <= 0) return;
    saveSettings.mutate({
      clock_basis: clockBasis,
      default_sla_hours: hrs,
      business_start: start,
      business_end: end,
      working_days: days,
      timezone: tz.trim() || 'Asia/Kuwait',
    });
  };

  // ---- Matrix: local input state keyed `${work_type_id}:${urgency}` ----
  const policyMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of policies ?? []) m[`${p.work_type_id}:${p.urgency}`] = p.hours;
    return m;
  }, [policies]);

  const [cells, setCells] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(policyMap)) next[k] = String(v);
    setCells(next);
  }, [policyMap]);

  const commitCell = (workTypeId: string, urgency: 'normal' | 'urgent') => {
    const key = `${workTypeId}:${urgency}`;
    const raw = (cells[key] ?? '').trim();
    const existing = policyMap[key];
    if (raw === '') {
      if (existing != null) savePolicy.mutate({ work_type_id: workTypeId, urgency, hours: null });
      return;
    }
    const hrs = Number(raw);
    if (!Number.isFinite(hrs) || hrs <= 0) return; // ignore invalid; leave as typed
    if (hrs === existing) return;                  // no-op
    savePolicy.mutate({ work_type_id: workTypeId, urgency, hours: hrs });
  };

  // ---- Holidays ----
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const handleAddHoliday = () => {
    if (!newHolidayDate) return;
    addHoliday.mutate(
      { holiday_date: newHolidayDate, name: newHolidayName.trim() || null },
      { onSuccess: () => { setNewHolidayDate(''); setNewHolidayName(''); } },
    );
  };

  const isBusiness = clockBasis === 'business';
  const defaultHint = Number(defaultHours) > 0 ? defaultHours : '24';

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Timer className="w-6 h-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold">SLA Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Set how the SLA deadline is calculated for each request. Changes apply to permits created (or reclassified) after saving.
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Clock basis + defaults                                            */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How the clock runs</CardTitle>
          <CardDescription>
            Choose whether the SLA counts every hour (calendar) or only working hours (business), and set the fallback SLA used when a request type has no specific value below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {settingsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <>
              <RadioGroup value={clockBasis} onValueChange={(v) => setClockBasis(v as ClockBasis)} className="grid sm:grid-cols-2 gap-3">
                <label htmlFor="basis-calendar" className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${!isBusiness ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <RadioGroupItem value="calendar" id="basis-calendar" className="mt-1" />
                  <div>
                    <div className="flex items-center gap-2 font-medium"><CalendarDays className="w-4 h-4" /> Calendar hours</div>
                    <p className="text-sm text-muted-foreground">Counts around the clock, including nights and weekends. e.g. 24h submitted Thursday 16:00 is due Friday 16:00.</p>
                  </div>
                </label>
                <label htmlFor="basis-business" className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${isBusiness ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <RadioGroupItem value="business" id="basis-business" className="mt-1" />
                  <div>
                    <div className="flex items-center gap-2 font-medium"><Clock className="w-4 h-4" /> Business hours</div>
                    <p className="text-sm text-muted-foreground">Counts only within the working window below, skipping non-working days and holidays.</p>
                  </div>
                </label>
              </RadioGroup>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default-hours">Default SLA (hours)</Label>
                  <Input id="default-hours" type="number" min="1" step="1" value={defaultHours}
                    onChange={(e) => setDefaultHours(e.target.value)} className="max-w-[160px]" />
                  <p className="text-xs text-muted-foreground">Used for any request type without its own value in the matrix below.</p>
                </div>
              </div>

              {isBusiness && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <p className="text-sm font-medium">Working window</p>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="biz-start">Day starts</Label>
                        <Input id="biz-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="max-w-[160px]" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="biz-end">Day ends</Label>
                        <Input id="biz-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="max-w-[160px]" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="biz-tz">Timezone</Label>
                        <Input id="biz-tz" value={tz} onChange={(e) => setTz(e.target.value)} className="max-w-[200px]" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Working days</Label>
                      <div className="flex flex-wrap gap-3">
                        {DAYS.map((label, idx) => (
                          <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={days.includes(idx)} onCheckedChange={() => toggleDay(idx)} />
                            {label}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Kuwait work week is Sun–Thu by default.</p>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={saveSettings.isPending}>
                  {saveSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save settings
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Per work-type × urgency matrix                                    */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">SLA by request type</CardTitle>
          <CardDescription>
            Hours allowed for each request type, split by urgency. Leave a cell blank to use the default ({defaultHint}h). Values save automatically when you click away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {typesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading request types…</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request type</TableHead>
                    <TableHead className="w-[160px]">Normal (h)</TableHead>
                    <TableHead className="w-[160px]">Urgent (h)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(workTypes ?? []).map((wt: any) => (
                    <TableRow key={wt.id}>
                      <TableCell className="font-medium">{wt.name}</TableCell>
                      {(['normal', 'urgent'] as const).map((urg) => {
                        const key = `${wt.id}:${urg}`;
                        return (
                          <TableCell key={urg}>
                            <Input
                              type="number" min="1" step="1"
                              placeholder={defaultHint}
                              value={cells[key] ?? ''}
                              onChange={(e) => setCells((p) => ({ ...p, [key]: e.target.value }))}
                              onBlur={() => commitCell(wt.id, urg)}
                              className="max-w-[130px]"
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {(workTypes ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                        No request types configured yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Holidays (business mode)                                          */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Holidays</CardTitle>
          <CardDescription>
            Dates the business-hours clock skips (public holidays, closures). These only affect the SLA when the clock basis is set to <strong>Business hours</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="holiday-date">Date</Label>
              <Input id="holiday-date" type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} className="max-w-[180px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Name (optional)</Label>
              <Input id="holiday-name" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} placeholder="e.g. National Day" className="max-w-[240px]" />
            </div>
            <Button variant="outline" onClick={handleAddHoliday} disabled={!newHolidayDate || addHoliday.isPending}>
              {addHoliday.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add
            </Button>
          </div>

          {(holidays ?? []).length > 0 ? (
            <div className="divide-y rounded-lg border">
              {(holidays ?? []).map((h) => (
                <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="text-sm">
                    <span className="font-medium">{h.holiday_date}</span>
                    {h.name && <span className="text-muted-foreground"> — {h.name}</span>}
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                    onClick={() => removeHoliday.mutate(h.id)} disabled={removeHoliday.isPending}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No holidays added.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
