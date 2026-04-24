import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * LanguageToggle — rendered in Settings.
 *
 * Two-button toggle rather than a dropdown, because we only ship EN + AR
 * right now and a horizontal toggle is one tap instead of two on mobile.
 * If more languages are added later, swap to a select.
 */
export function LanguageToggle() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Languages className="h-4 w-4" />
          {t('settings.language.title')}
        </CardTitle>
        <CardDescription>{t('settings.language.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={language === 'en' ? 'default' : 'outline'}
            onClick={() => setLanguage('en')}
            aria-pressed={language === 'en'}
            className="justify-center"
          >
            {t('settings.language.english')}
          </Button>
          <Button
            type="button"
            variant={language === 'ar' ? 'default' : 'outline'}
            onClick={() => setLanguage('ar')}
            aria-pressed={language === 'ar'}
            className="justify-center font-arabic"
          >
            {t('settings.language.arabic')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
