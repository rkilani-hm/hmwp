import { forwardRef } from 'react';
import type { GatePass } from '@/types/gatePass';
import { format } from 'date-fns';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

interface Props {
  gatePass: GatePass;
}

const cellClass = "border border-black px-2 py-1 text-xs";
const labelClass = "font-bold text-xs";
const valueClass = "text-xs";
const checkBox = (checked: boolean) => (
  <span className="inline-block w-4 h-4 border border-black text-center text-xs leading-4 align-middle">{checked ? '✓' : ''}</span>
);

const GatePassPrintView = forwardRef<HTMLDivElement, Props>(({ gatePass: gp }, ref) => {
  const isMaterialIn = gp.pass_type === 'material_in';
  const isMaterialOut = gp.pass_type === 'material_out';
  const isInternalShifting = gp.pass_type === 'internal_shifting';

  const items = gp.items || [];
  // Pad to at least 5 rows
  const paddedItems = [...items];
  while (paddedItems.length < 5) {
    paddedItems.push({ id: `empty-${paddedItems.length}`, serial_number: paddedItems.length + 1, item_details: '', quantity: '', remarks: '', is_high_value: false, gate_pass_id: gp.id });
  }

  const formatDate = (d: string | null | undefined) => d ? format(new Date(d), 'dd/MM/yyyy') : '';

  return (
    <div ref={ref} className="p-6 bg-white text-black max-w-[210mm] mx-auto" style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px' }}>
      {/* ===== HEADER ===== */}
      <div className="flex items-start justify-between mb-1">
        <img src={alHamraLogo} alt="Al Hamra" className="h-14 w-auto object-contain" />
        <h1 className="text-xl font-bold uppercase tracking-wide text-center flex-1">MATERIAL GATE PASS</h1>
        <div className="text-right">
          <div className="border border-black px-3 py-1 text-xs font-semibold whitespace-nowrap">
            Gate Pass No: {gp.pass_no}
          </div>
        </div>
      </div>

      {/* ===== TYPE CHECKBOXES ===== */}
      <div className="border border-black mb-1">
        <div className="flex">
          <div className="flex-1 flex items-center justify-center gap-2 border-r border-black py-1.5 px-2">
            <span className={labelClass}>Material Entry</span> {checkBox(isMaterialIn)}
          </div>
          <div className="flex-1 flex items-center justify-center gap-2 border-r border-black py-1.5 px-2">
            <span className={labelClass}>Material Exit</span> {checkBox(isMaterialOut)}
          </div>
          <div className="flex-1 py-1.5 px-2 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className={labelClass}>Internal Shifting</span> {checkBox(isInternalShifting)}
            </div>
            <div className="text-[9px]">(With in Al Hamra Premises)</div>
          </div>
        </div>
      </div>

      {/* ===== REQUESTOR INFO GRID ===== */}
      <table className="w-full border-collapse border border-black mb-1">
        <tbody>
          <tr>
            <td className={cellClass} style={{ width: '50%' }}><span className={labelClass}>Requestor:</span> <span className={valueClass}>{gp.requester_name}</span></td>
            <td className={cellClass}><span className={labelClass}>Date:</span> <span className={valueClass}>{formatDate(gp.date_of_request)}</span></td>
          </tr>
          <tr>
            <td className={cellClass}><span className={labelClass}>Client/Contractor:</span> <span className={valueClass}>{gp.client_contractor_name || ''}</span></td>
            <td className={cellClass}><span className={labelClass}>Unit/Floor:</span> <span className={valueClass}>{gp.unit_floor || ''}</span></td>
          </tr>
          <tr>
            <td className={cellClass}><span className={labelClass}>Client Rep:</span> <span className={valueClass}>{gp.client_rep_name || ''}</span></td>
            <td className={cellClass}><span className={labelClass}>Email:</span> <span className={valueClass}>{gp.requester_email || ''}</span></td>
          </tr>
          <tr>
            <td className={cellClass}><span className={labelClass}>Contact Number:</span> <span className={valueClass}>{gp.client_rep_contact || ''}</span></td>
            <td className={cellClass}><span className={labelClass}>Contracting Co / Person:</span> <span className={valueClass}>{gp.client_contractor_name || ''}</span></td>
          </tr>
        </tbody>
      </table>

      {/* ===== TRANSFER SCHEDULE ===== */}
      <div className="border border-black mb-1">
        <div className="bg-gray-100 text-center font-bold text-xs py-1 border-b border-black">Transfer Schedule</div>
        <div className="flex border-b border-black">
          <div className={`${cellClass} flex-1 border-r border-black`}><span className={labelClass}>From Date:</span> <span className={valueClass}>{formatDate(gp.valid_from)}</span></div>
          <div className={`${cellClass} flex-1`}><span className={labelClass}>To Date:</span> <span className={valueClass}>{formatDate(gp.valid_to)}</span></div>
        </div>
        <div className="flex">
          <div className={`${cellClass} border-r border-black`} style={{ width: '15%' }}>
            <span className={labelClass}>Time</span>
          </div>
          <div className={`${cellClass} flex-1 border-r border-black`}>
            <span className={labelClass}>From:</span> <span className={valueClass}>{gp.time_from || ''}</span>
          </div>
          <div className={`${cellClass} flex-1`}>
            <span className={labelClass}>To:</span> <span className={valueClass}>{gp.time_to || ''}</span>
          </div>
        </div>
      </div>

      {/* ===== ITEMS TABLE ===== */}
      <table className="w-full border-collapse border border-black mb-1">
        <thead>
          <tr className="bg-gray-100">
            <th className={`${cellClass} text-center`} style={{ width: '8%' }}>SR.</th>
            <th className={cellClass} style={{ width: '42%' }}>Details of item</th>
            <th className={`${cellClass} text-center`} style={{ width: '15%' }}>Quantity</th>
            <th className={cellClass} style={{ width: '35%' }}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {paddedItems.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className={`${cellClass} text-center`}>{item.serial_number}</td>
              <td className={cellClass}>{item.item_details || ''}</td>
              <td className={`${cellClass} text-center`}>{item.quantity || ''}</td>
              <td className={cellClass}>{item.remarks || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ===== LOCATION & SHIFTING METHOD ===== */}
      <table className="w-full border-collapse border border-black mb-1">
        <tbody>
          <tr>
            <td className={cellClass} rowSpan={2} style={{ width: '30%', verticalAlign: 'top' }}>
              <span className={labelClass}>Location:</span><br />
              <span className="text-[10px]">(For Internal Shifting)</span><br />
              <span className={valueClass}>{gp.delivery_area || ''}</span>
            </td>
            <td className={cellClass} style={{ width: '35%' }}>
              <span className={labelClass}>Shifting Method</span>
            </td>
            <td className={cellClass} style={{ width: '35%' }}>&nbsp;</td>
          </tr>
          <tr>
            <td className={cellClass}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">{labelClass ? 'Manually' : ''} Manually {checkBox(gp.shifting_method === 'manually')}</span>
                <span className="flex items-center gap-1">Material Trolley {checkBox(gp.shifting_method === 'material_trolley')}</span>
              </div>
            </td>
            <td className={cellClass}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">Pallet Trolley {checkBox(gp.shifting_method === 'pallet_trolley')}</span>
                <span className="flex items-center gap-1">Forklift {checkBox(gp.shifting_method === 'forklift')}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ===== FORKLIFT NOTE ===== */}
      <div className="border border-black px-2 py-1 mb-1">
        <p className="text-[10px] text-red-700 font-bold">Note: Materials shifting using forklift in Al Hamara premises shall obtain a valid Work Permit.</p>
      </div>

      {/* ===== PURPOSE ===== */}
      <div className="border border-black px-2 py-1 mb-1">
        <span className={labelClass}>Purpose of Material Shifting:</span>
        <p className={valueClass}>{gp.purpose || ''}</p>
      </div>

      {/* ===== DEPARTMENT VERIFICATION ===== */}
      <div className="border border-black">
        <div className="bg-gray-100 text-center font-bold text-xs py-1 border-b border-black">Department Verification</div>
        <div className="flex">
          {/* Approved By: AlHamra */}
          <div className="flex-1 border-r border-black">
            <div className="text-center font-bold text-xs py-1 border-b border-black">Approved By: AlHamra</div>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="px-2 py-1 text-xs border-b border-black"><span className={labelClass}>Name:</span> {gp.store_manager_name || ''}</td>
                </tr>
                <tr>
                  <td className="px-2 py-1 text-xs border-b border-black"><span className={labelClass}>Department:</span></td>
                </tr>
                <tr>
                  <td className="px-2 py-1 text-xs">
                    <div className="flex justify-between">
                      <span><span className={labelClass}>Date:</span> {formatDate(gp.store_manager_date)}</span>
                      <span><span className={labelClass}>Sign:</span>
                        {gp.store_manager_signature && gp.store_manager_signature.startsWith('data:image') && (
                          <img src={gp.store_manager_signature} alt="Signature" className="inline-block h-8 ml-1" />
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* FMSP */}
          <div className="flex-1">
            <div className="text-center font-bold text-xs py-1 border-b border-black">FMSP:</div>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="px-2 py-1 text-xs border-b border-black"><span className={labelClass}>Name:</span> {gp.finance_name || ''}</td>
                </tr>
                <tr>
                  <td className="px-2 py-1 text-xs border-b border-black"><span className={labelClass}>Department:</span></td>
                </tr>
                <tr>
                  <td className="px-2 py-1 text-xs">
                    <div className="flex justify-between">
                      <span><span className={labelClass}>Date:</span> {formatDate(gp.finance_date)}</span>
                      <span><span className={labelClass}>Sign:</span>
                        {gp.finance_signature && gp.finance_signature.startsWith('data:image') && (
                          <img src={gp.finance_signature} alt="Signature" className="inline-block h-8 ml-1" />
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Security sign-off row */}
      {(gp.security_name || gp.security_date) && (
        <div className="border border-black border-t-0">
          <div className="flex">
            <div className="flex-1 border-r border-black">
              <div className="text-center font-bold text-xs py-1 border-b border-black">Security Sign-off</div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="px-2 py-1 text-xs border-b border-black"><span className={labelClass}>Name:</span> {gp.security_name || ''}</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 text-xs">
                      <div className="flex justify-between">
                        <span><span className={labelClass}>Date:</span> {formatDate(gp.security_date)}</span>
                        <span><span className={labelClass}>Sign:</span>
                          {gp.security_signature && gp.security_signature.startsWith('data:image') && (
                            <img src={gp.security_signature} alt="Signature" className="inline-block h-8 ml-1" />
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex-1 flex items-center justify-center text-xs px-2">
              {gp.security_cctv_confirmed && <span className="font-bold">✓ CCTV Monitoring Confirmed</span>}
            </div>
          </div>
        </div>
      )}

      {/* ===== SECURITY PMD VERIFICATION (Gate) ===== */}
      {(gp.security_pmd_name || gp.security_pmd_date) && (
        <div className="border border-black border-t-0 mt-0">
          <div className="bg-gray-100 text-center font-bold text-xs py-1 border-b border-black">Security Verification at Gate</div>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={cellClass} style={{ width: '50%' }}>
                  <span className={labelClass}>Security Officer:</span> <span className={valueClass}>{gp.security_pmd_name || ''}</span>
                </td>
                <td className={cellClass}>
                  <span className={labelClass}>Date & Time:</span> <span className={valueClass}>{gp.security_pmd_date ? format(new Date(gp.security_pmd_date), 'dd/MM/yyyy HH:mm') : ''}</span>
                </td>
              </tr>
              <tr>
                <td className={cellClass}>
                  <span className={labelClass}>Materials:</span>{' '}
                  <span className={`${valueClass} font-bold uppercase`}>
                    {gp.security_pmd_material_action === 'received' ? '✓ RECEIVED' : gp.security_pmd_material_action === 'released' ? '✓ RELEASED' : ''}
                  </span>
                  <span className="text-[9px] ml-2">
                    ({isMaterialIn ? 'Material Entry' : isMaterialOut ? 'Material Exit' : 'Internal Shifting'})
                  </span>
                </td>
                <td className={cellClass}>
                  <div className="flex items-center justify-between">
                    <span className={labelClass}>Sign:</span>
                    {gp.security_pmd_signature && gp.security_pmd_signature.startsWith('data:image') && (
                      <img src={gp.security_pmd_signature} alt="Security PMD Signature" className="inline-block h-8 ml-1" />
                    )}
                  </div>
                </td>
              </tr>
              {gp.security_pmd_comments && (
                <tr>
                  <td className={cellClass} colSpan={2}>
                    <span className={labelClass}>Remarks:</span> <span className={valueClass}>{gp.security_pmd_comments}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

GatePassPrintView.displayName = 'GatePassPrintView';
export default GatePassPrintView;
