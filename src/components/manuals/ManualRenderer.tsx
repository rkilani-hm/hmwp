/**
 * ManualRenderer — renders a Manual data object in the chosen language.
 * Sets dir="rtl" on its root wrapper when language is Arabic so list
 * bullets and headings align right regardless of the document-level dir.
 */
import { HelpCircle } from 'lucide-react';
import type { Manual, Lang } from './manualContent';

interface Props {
  manual: Manual;
  lang: Lang;
}

export default function ManualRenderer({ manual, lang }: Props) {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const align = isAr ? 'text-right' : 'text-left';

  return (
    <div dir={dir} className={`space-y-6 ${align} ${isAr ? 'font-arabic' : ''}`}>
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2">{manual.title[lang]}</h1>
        <p className="text-lg text-muted-foreground">{manual.subtitle[lang]}</p>
      </div>

      {manual.sections.map((s, i) => (
        <section key={i} className="space-y-3">
          <h2 className="text-xl font-semibold border-b pb-1">{s.title[lang]}</h2>
          {s.intro && <p className="text-muted-foreground">{s.intro[lang]}</p>}
          {s.steps && s.steps.length > 0 && (
            <ol
              className={`space-y-2 ${isAr ? 'pr-6' : 'pl-6'} list-decimal`}
            >
              {s.steps.map((step, j) => (
                <li key={j}>{step[lang]}</li>
              ))}
            </ol>
          )}
          {s.note && (
            <div className="bg-muted/50 border-l-4 border-primary p-3 rounded">
              <strong>{isAr ? 'ملاحظات: ' : 'Notes: '}</strong>
              {s.note[lang]}
            </div>
          )}
        </section>
      ))}

      {manual.faqs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2 border-b pb-1">
            <HelpCircle className="h-5 w-5 text-primary" />
            {isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
          </h2>
          <div className="space-y-3">
            {manual.faqs.map((f, i) => (
              <div key={i} className="bg-muted/40 rounded p-3">
                <p className="font-semibold mb-1">{f.question[lang]}</p>
                <p className="text-muted-foreground">{f.answer[lang]}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
