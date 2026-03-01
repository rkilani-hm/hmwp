import { forwardRef } from 'react';
import type { GatePass } from '@/types/gatePass';
import { gatePassCategoryLabels, gatePassTypeLabels, gatePassStatusLabels, shiftingMethodLabels, deliveryTypeLabels } from '@/types/gatePass';
import { format } from 'date-fns';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

interface Props {
  gatePass: GatePass;
}

const GatePassPrintView = forwardRef<HTMLDivElement, Props>(({ gatePass: gp }, ref) => {
  return (
    <div ref={ref} className="p-8 bg-white text-black max-w-[210mm] mx-auto text-sm print:p-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
        <img src={alHamraLogo} alt="Al Hamra" className="h-16 w-auto object-contain" />
        <div className="text-right">
          <h1 className="text-xl font-bold uppercase">{gatePassCategoryLabels[gp.pass_category]}</h1>
          <p className="text-lg font-semibold">{gp.pass_no}</p>
          <p className="text-xs text-gray-600">Date: {format(new Date(gp.date_of_request), 'dd MMM yyyy')}</p>
        </div>
      </div>

      {/* Pass Info */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p><strong>Type:</strong> {gatePassTypeLabels[gp.pass_type]}</p>
          <p><strong>Status:</strong> {gatePassStatusLabels[gp.status]}</p>
          <p><strong>Requestor:</strong> {gp.requester_name}</p>
          {gp.client_contractor_name && <p><strong>Client/Contractor:</strong> {gp.client_contractor_name}</p>}
          {gp.client_rep_name && <p><strong>Client Rep:</strong> {gp.client_rep_name}</p>}
        </div>
        <div>
          {gp.unit_floor && <p><strong>Unit/Floor:</strong> {gp.unit_floor}</p>}
          {gp.delivery_area && <p><strong>Delivery Area:</strong> {gp.delivery_area}</p>}
          {gp.valid_from && <p><strong>Valid:</strong> {gp.valid_from} to {gp.valid_to}</p>}
          {gp.vehicle_make_model && <p><strong>Vehicle:</strong> {gp.vehicle_make_model} ({gp.vehicle_license_plate})</p>}
          {gp.shifting_method && <p><strong>Shifting:</strong> {shiftingMethodLabels[gp.shifting_method]}</p>}
          {gp.delivery_type && <p><strong>Delivery Type:</strong> {deliveryTypeLabels[gp.delivery_type]}</p>}
        </div>
      </div>

      {gp.purpose && (
        <div className="mb-6">
          <p className="font-bold mb-1">Purpose:</p>
          <p>{gp.purpose}</p>
        </div>
      )}

      {/* Items Table */}
      {gp.items && gp.items.length > 0 && (
        <div className="mb-6">
          <p className="font-bold mb-2">Item Details:</p>
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-1.5">SR</th>
                <th className="border border-black p-1.5">Item Details</th>
                <th className="border border-black p-1.5">Qty</th>
                <th className="border border-black p-1.5">Remarks</th>
                <th className="border border-black p-1.5">High Value</th>
              </tr>
            </thead>
            <tbody>
              {gp.items.map(item => (
                <tr key={item.id}>
                  <td className="border border-black p-1.5 text-center">{item.serial_number}</td>
                  <td className="border border-black p-1.5">{item.item_details}</td>
                  <td className="border border-black p-1.5 text-center">{item.quantity}</td>
                  <td className="border border-black p-1.5">{item.remarks || '-'}</td>
                  <td className="border border-black p-1.5 text-center">{item.is_high_value ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Signature Blocks */}
      <div className="grid grid-cols-3 gap-6 mt-12 pt-6 border-t border-black">
        <div className="text-center">
          <div className="border-b border-black mb-2 h-16 flex items-end justify-center pb-1">
            {gp.store_manager_name && <span className="text-xs">{gp.store_manager_name}</span>}
          </div>
          <p className="font-bold text-xs">Approved By</p>
          <p className="text-xs text-gray-600">Store Manager</p>
          {gp.store_manager_date && <p className="text-xs text-gray-500 mt-1">{format(new Date(gp.store_manager_date), 'dd/MM/yyyy')}</p>}
        </div>
        <div className="text-center">
          <div className="border-b border-black mb-2 h-16 flex items-end justify-center pb-1">
            {gp.finance_name && <span className="text-xs">{gp.finance_name}</span>}
          </div>
          <p className="font-bold text-xs">Department Verification</p>
          <p className="text-xs text-gray-600">Finance</p>
          {gp.finance_date && <p className="text-xs text-gray-500 mt-1">{format(new Date(gp.finance_date), 'dd/MM/yyyy')}</p>}
        </div>
        <div className="text-center">
          <div className="border-b border-black mb-2 h-16 flex items-end justify-center pb-1">
            {gp.security_name && <span className="text-xs">{gp.security_name}</span>}
          </div>
          <p className="font-bold text-xs">Security Sign-off</p>
          <p className="text-xs text-gray-600">Security</p>
          {gp.security_date && <p className="text-xs text-gray-500 mt-1">{format(new Date(gp.security_date), 'dd/MM/yyyy')}</p>}
        </div>
      </div>

      {gp.security_cctv_confirmed && (
        <p className="text-xs text-center mt-4 text-gray-600">✓ CCTV Monitoring Confirmed</p>
      )}
    </div>
  );
});

GatePassPrintView.displayName = 'GatePassPrintView';
export default GatePassPrintView;
