import { serve } from 'inngest/next';
import { inngest } from '../../inngest/client';
import { processReceiptFunction } from '../../inngest/functions';

export default serve({
  client: inngest,
  functions: [processReceiptFunction],
});

export const config = {
  api: {
    bodyParser: false,
  },
};
