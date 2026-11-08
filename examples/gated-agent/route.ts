// The same agent, fixed: looking things up runs freely, but emailing a
// customer or refunding money waits for a human to approve it.
// (Proportional gates: heuristic #8 in agent-design-primer.)
import { streamText, tool } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model,
    messages,
    tools: {
      lookupOrder: tool({
        description: 'Look up an order by its id',
        inputSchema: z.object({ orderId: z.string() }),
        execute: async ({ orderId }) => db.orders.find(orderId),
      }),
      sendEmail: tool({
        description: 'Email the customer',
        inputSchema: z.object({ to: z.string(), body: z.string() }),
        needsApproval: true,
        execute: async ({ to, body }) => mailer.send({ to, body }),
      }),
      refundOrder: tool({
        description: 'Refund an order in full',
        inputSchema: z.object({ orderId: z.string(), amount: z.number() }),
        needsApproval: true,
        execute: async ({ orderId, amount }) => payments.refund(orderId, amount),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
