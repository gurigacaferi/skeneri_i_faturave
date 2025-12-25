import { Inngest } from 'inngest';

export const inngest = new Inngest({ 
  id: 'receipt-processor',
  name: 'Receipt Processor',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
