// A customer-support agent built with the Vercel AI SDK, and the
// anti-pattern Glassbox looks for: the model can email customers and
// issue refunds the moment it decides to. Nobody approves anything.
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
        execute: async ({ to, body }) => mailer.send({ to, body }),
      }),
      refundOrder: tool({
        description: 'Refund an order in full',
        inputSchema: z.object({ orderId: z.string(), amount: z.number() }),
        execute: async ({ orderId, amount }) => payments.refund(orderId, amount),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
