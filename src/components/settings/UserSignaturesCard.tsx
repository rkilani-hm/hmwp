import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { useSavedSignature } from '@/hooks/useSavedSignature';
import { PenLine, Loader2, Trash2, Save, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * UserSignaturesCard
 *
 * Lets a user persist a single signature + initials image on their
 * profile. Both are optional; saving an empty pad clears the stored
 * value. Once saved, every approval dialog pre-loads the signature so
 * the approver doesn't have to redraw it.
 */
export function UserSignaturesCard() {
  const { data, isLoading, isSaving, save } = useSavedSignature();
  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);
  const [initialsDraft, setInitialsDraft] = useState<string | null>(null);
  const [signatureEditing, setSignatureEditing] = useState(false);
  const [initialsEditing, setInitialsEditing] = useState(false);

  const handleSaveSignature = async () => {
    try {
      await save({ signature: signatureDraft });
      toast.success(signatureDraft ? 'Signature saved' : 'Signature cleared');
      setSignatureEditing(false);
      setSignatureDraft(null);
    } catch (e) {
      toast.error('Failed to save signature');
    }
  };

  const handleSaveInitials = async () => {
    try {
      await save({ initials: initialsDraft });
      toast.success(initialsDraft ? 'Initials saved' : 'Initials cleared');
      setInitialsEditing(false);
      setInitialsDraft(null);
    } catch (e) {
      toast.error('Failed to save initials');
    }
  };

  const handleClearSignature = async () => {
    try {
      await save({ signature: null });
      toast.success('Signature cleared');
    } catch {
      toast.error('Failed to clear signature');
    }
  };

  const handleClearInitials = async () => {
    try {
      await save({ initials: null });
      toast.success('Initials cleared');
    } catch {
      toast.error('Failed to clear initials');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4" />
          Signature & Initials
        </CardTitle>
        <CardDescription>
          Save your signature and initials once — they'll be pre-loaded
          into every approval. You can always tap the eraser to sign fresh.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Signature */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Signature</h3>
                {data?.signature && !signatureEditing && (
                  <span className="text-xs text-success inline-flex items-center gap-1">
                    <Check className="h-3 w-3" /> Saved
                  </span>
                )}
              </div>

              {!signatureEditing && data?.signature ? (
                <div className="space-y-2">
                  <div className="border rounded-lg bg-card p-3 flex items-center justify-center">
                    <img
                      src={data.signature}
                      alt="Saved signature"
                      className="max-h-32 object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSignatureEditing(true)}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSignature}
                      disabled={isSaving}
                    >
                      <Trash2 className="h-4 w-4 me-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <SignaturePad onSave={setSignatureDraft} height={180} />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveSignature}
                      disabled={isSaving || !signatureDraft}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 me-2" />
                      )}
                      Save signature
                    </Button>
                    {signatureEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSignatureEditing(false);
                          setSignatureDraft(null);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Initials */}
            <section className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Initials</h3>
                {data?.initials && !initialsEditing && (
                  <span className="text-xs text-success inline-flex items-center gap-1">
                    <Check className="h-3 w-3" /> Saved
                  </span>
                )}
              </div>

              {!initialsEditing && data?.initials ? (
                <div className="space-y-2">
                  <div className="border rounded-lg bg-card p-3 flex items-center justify-center">
                    <img
                      src={data.initials}
                      alt="Saved initials"
                      className="max-h-24 object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInitialsEditing(true)}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearInitials}
                      disabled={isSaving}
                    >
                      <Trash2 className="h-4 w-4 me-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <SignaturePad onSave={setInitialsDraft} height={140} />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveInitials}
                      disabled={isSaving || !initialsDraft}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 me-2" />
                      )}
                      Save initials
                    </Button>
                    {initialsEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setInitialsEditing(false);
                          setInitialsDraft(null);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
