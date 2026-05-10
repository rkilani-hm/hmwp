import type {
  GatePassItem,
  GatePassCategory,
  GatePassType,
  ShiftingMethod,
  DeliveryType,
} from '@/types/gatePass';

/**
 * All form state for the gate-pass wizard, in one place. Mirrors the
 * permit-steps/types.ts pattern (PR #6) so the two wizards share a
 * shape: `data` flows down, `updateField` flows back up.
 */
export interface GatePassFormData {
  category: GatePassCategory | '';
  passType: GatePassType | '';

  // Entity / location
  clientContractorName: string;
  clientRepName: string;
  clientRepEmail: string;
  clientRepContact: string;
  unitFloor: string;
  deliveryArea: string;

  // Schedule / logistics
  validFrom: string;
  validTo: string;
  timeFrom: string;
  timeTo: string;
  vehicleMakeModel: string;
  vehicleLicensePlate: string;
  shiftingMethod: ShiftingMethod | '';

  // Purpose
  purpose: string;

  // Generic-delivery-only
  deliveryType: DeliveryType | '';

  // Items
  items: GatePassItem[];
}

export type UpdateField = <K extends keyof GatePassFormData>(
  key: K,
  value: GatePassFormData[K],
) => void;

export const initialGatePassFormData: GatePassFormData = {
  category: '',
  passType: '',
  clientContractorName: '',
  clientRepName: '',
  clientRepEmail: '',
  clientRepContact: '',
  unitFloor: '',
  deliveryArea: '',
  validFrom: '',
  validTo: '',
  timeFrom: '',
  timeTo: '',
  vehicleMakeModel: '',
  vehicleLicensePlate: '',
  shiftingMethod: '',
  purpose: '',
  deliveryType: '',
  items: [
    { serial_number: 1, item_details: '', quantity: '1', remarks: '', is_high_value: false },
  ],
};
