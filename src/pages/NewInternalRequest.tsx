import { PermitFormWizard } from '@/components/forms/PermitFormWizard';
import { motion } from 'framer-motion';
import { HardHat } from 'lucide-react';

/**
 * The Al Hamra team's own entry point. Identical road map to the tenant one —
 * purpose first, then the form adapts — but the work types on offer are the
 * internal ones, which carry the internal approval workflows.
 */
export default function NewInternalRequest() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2">
          <HardHat className="h-6 w-6 text-primary" />
          New Internal Request
        </h1>
        <p className="text-muted-foreground mt-1">
          For Al Hamra teams — work permits, material in/out and photo shoots routed
          through the internal approval workflows.
        </p>
      </div>

      <PermitFormWizard scope="internal" />
    </motion.div>
  );
}
