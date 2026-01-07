import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Key, Copy, Check } from 'lucide-react';

export default function GenerateVapidKeys() {
  const { hasRole } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [copied, setCopied] = useState<'public' | 'private' | null>(null);

  if (!hasRole('admin')) {
    return (
      <div className="p-6">
        <p className="text-destructive">Admin access required</p>
      </div>
    );
  }

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('generate-vapid-keys', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;

      setKeys({ publicKey: data.publicKey, privateKey: data.privateKey });
      toast.success('VAPID keys generated successfully!');
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to generate VAPID keys');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'public' | 'private') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success(`${type === 'public' ? 'Public' : 'Private'} key copied!`);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Generate VAPID Keys
          </CardTitle>
          <CardDescription>
            Generate VAPID keys for push notifications. After generating, add them as secrets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate VAPID Keys'}
          </Button>

          {keys && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">VAPID_PUBLIC_KEY</label>
                <div className="flex gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                    {keys.publicKey}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(keys.publicKey, 'public')}
                  >
                    {copied === 'public' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">VAPID_PRIVATE_KEY</label>
                <div className="flex gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                    {keys.privateKey}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(keys.privateKey, 'private')}
                  >
                    {copied === 'private' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Copy these keys and add them as secrets in your backend configuration.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
