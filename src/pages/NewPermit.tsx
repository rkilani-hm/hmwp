import { useSearchParams } from 'react-router-dom';
import { PermitFormWizard, type RequestCategory } from '@/components/forms/PermitFormWizard';
import { motion } from 'framer-motion';

// The New Request wizard routes here with ?category=. Every purpose uses this
// same form; the title (and the auto-selected workflow) change per purpose.
const CATEGORY_META: Partial<Record<RequestCategory, { title: string; subtitle: string }>> = {
  gate_pass: {
    title: 'New Material Gate Pass',
    subtitle: 'To move material in or out — complete the fields below to submit.',
  },
  maintenance: {
    title: 'New Maintenance & Repairs Request',
    subtitle: 'For fixing or servicing something in your unit.',
  },
  unit_modification: {
    title: 'New Unit Modification Request',
    subtitle: 'For changing or altering your existing unit.',
  },
  tenant_fitout: {
    title: 'New Tenant Fit-out Request',
    subtitle: 'For fitting out a new unit before opening.',
  },
  photoshoot: {
    title: 'New Photoshoot / Filming Request',
    subtitle: 'For photography, filming or event access at Al Hamra.',
  },
  work_permit: {
    title: 'New Work Permit Request',
    subtitle: 'For work in your unit — complete all required fields to submit.',
  },
  other: {
    title: 'New Request',
    subtitle: "Tell us the details and we'll route it.",
  },
};

export default function NewPermit() {
  const [params] = useSearchParams();
  const raw = params.get('category') as RequestCategory | null;
  // Deep-link support: /new-permit?category=… skips the purpose step. Without a
  // known param, the form asks the purpose first (single road map).
  const meta = raw && CATEGORY_META[raw];
  const category = meta ? raw : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold">
          {meta ? meta.title : 'New Request'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {meta ? meta.subtitle : "Tell us the purpose — we'll set up the right form for you."}
        </p>
      </div>

      <PermitFormWizard initialCategory={category} />
    </motion.div>
  );
}
