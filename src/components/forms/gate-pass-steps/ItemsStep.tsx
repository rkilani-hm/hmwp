import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import type { GatePassItem } from '@/types/gatePass';
import type { GatePassFormData, UpdateField } from './types';

interface Props {
  data: GatePassFormData;
  updateField: UpdateField;
}

/**
 * Item details. Add/remove/update operate on a fresh array and call
 * updateField('items', ...) to write the result back to the wizard.
 */
export function ItemsStep({ data, updateField }: Props) {
  const items = data.items;

  const addItem = () => {
    updateField('items', [
      ...items,
      {
        serial_number: items.length + 1,
        item_details: '',
        quantity: '1',
        remarks: '',
        is_high_value: false,
      },
    ]);
  };

  const removeItem = (idx: number) => {
    const next = items
      .filter((_, i) => i !== idx)
      .map((item, i) => ({ ...item, serial_number: i + 1 }));
    updateField('items', next);
  };

  const updateItem = <K extends keyof GatePassItem>(
    idx: number,
    field: K,
    value: GatePassItem[K],
  ) => {
    updateField(
      'items',
      items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  };

  return (
    <div className="space-y-4">
      {items.map((item, idx) => (
        <Card key={idx}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Item #{item.serial_number}</span>
              {items.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(idx)}
                  aria-label={`Remove item ${item.serial_number}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Item Details *</Label>
                <Input
                  value={item.item_details}
                  onChange={(e) => updateItem(idx, 'item_details', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Remarks</Label>
                <Input
                  value={item.remarks}
                  onChange={(e) => updateItem(idx, 'remarks', e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Switch
                checked={item.is_high_value}
                onCheckedChange={(v) => updateItem(idx, 'is_high_value', v)}
              />
              <Label className="text-sm">High-Value Asset</Label>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={addItem}>
        <Plus className="mr-2 h-4 w-4" /> Add Item
      </Button>
    </div>
  );
}
