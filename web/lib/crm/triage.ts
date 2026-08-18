import Anthropic from '@anthropic-ai/sdk';
import type { Lead, Score } from './types';
import { houseSchedule } from './schedule';
import { VILLAS, fmtTHB } from './villas';

/* ── Reading what a customer actually said ──

   When a reply lands in the inbox, the CRM stops the automated sequence on its
   own — that part needs no intelligence. This module does the second half:
   it reads the message and tells the operator what it means and what to do
   next, so a full inbox becomes a ranked worklist instead of a pile.

   Dark without ANTHROPIC_API_KEY: the reply is still filed on the lead and the
   sequence still stops; only the reading is skipped. */

const MODEL = 'claude-opus-5';

export type Intent =
  | 'ready_to_reserve'   // wants to move — the money conversation is open
  | 'wants_a_call'       // asked to talk, or to meet
  | 'question'           // needs an answer before deciding
  | 'objection'          // price, location, timing, trust — something is in the way
  | 'not_now'            // interested, wrong moment
  | 'not_interested'     // done, let them go
  | 'auto_reply'         // out-of-office, bounce, no human wrote this
  | 'unclear';           // don't guess — put it in front of a person

export interface ReplyReading {
  intent: Intent;
  score: Score;               // hot / warm / cold, re-read from this message
  urgency: 'today' | 'this_week' | 'no_rush';
  summary: string;            // one line an operator can scan
  key_points: string[];       // what the customer actually asked or said
  next_step: string;          // what the human should do, concretely
  draft_reply: string;        // a reply to edit and send, in the customer's language
}

export function triageEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['ready_to_reserve', 'wants_a_call', 'question', 'objection',
             'not_now', 'not_interested', 'auto_reply', 'unclear'],
      description: 'What the customer is doing with this message.',
    },
    score: {
      type: 'string',
      enum: ['hot', 'warm', 'cold'],
      description: 'How close this person now is to buying, judged from this message only.',
    },
    urgency: {
      type: 'string',
      enum: ['today', 'this_week', 'no_rush'],
      description: 'How soon a human should respond for the deal not to cool.',
    },
    summary: {
      type: 'string',
      description: 'One sentence, under 120 characters, that a salesperson can scan in a list.',
    },
    key_points: {
      type: 'array',
      items: { type: 'string' },
      description: 'Each question asked or fact stated, as its own short line. Empty if there are none.',
    },
    next_step: {
      type: 'string',
      description: 'The single concrete action the salesperson should take next.',
    },
    draft_reply: {
      type: 'string',
      description:
        'A complete reply the salesperson can edit and send, in the same language the customer wrote in. No subject line, no signature.',
    },
  },
  required: ['intent', 'score', 'urgency', 'summary', 'key_points', 'next_step', 'draft_reply'],
  additionalProperties: false,
} as const;

const SYSTEM = `You read replies from people enquiring about Longevity Resort, a managed
residence community at Plai Laem on Koh Samui, Thailand, and you brief the salesperson.

Facts you may rely on:
${VILLAS.map((v) => `  · ${v.name}: ${v.built} built on a ${v.plot} plot, ${fmtTHB(v.price)}`).join('\n')}
  · Reservation is a ${houseSchedule().length}-step payment schedule: ${houseSchedule().map((p) => `${p.pct}% ${p.gate.toLowerCase()}`).join(', ')}.
  · Owners may let the resort manage and rent the residence for them.

How to judge:
  · Score on what THIS message shows. Asking for figures, contracts, or a visit is hot.
    A general question is warm. Polite deferral is cold.
  · An out-of-office, a bounce, or a mailing-list footer with no human sentence is
    intent "auto_reply" — say so rather than inventing interest.
  · If the message is ambiguous, use "unclear". A wrong confident reading costs more
    than an honest one.

The draft reply is written for the salesperson to send as their own: warm, direct,
specific to what was asked, and short. Answer from the facts above; where you don't
know something, write a sentence that promises to find out rather than inventing it.
Never state a price or a term that is not in the facts above.`;

/** Read one inbound message in the context of its lead. Never throws. */
export async function readReply(lead: Lead, message: string): Promise<ReplyReading | null> {
  if (!triageEnabled() || !message.trim()) return null;

  const history = (lead.outbox || []).map((e) => `sent "${e.subject}" on ${e.at.slice(0, 10)}`);
  const context = [
    `Name: ${lead.name || 'unknown'}`,
    `Enquired about: ${lead.villa || 'no specific residence'}`,
    `How they came in: ${lead.form_type || 'enquiry'}${lead.form_origin ? ` (${lead.form_origin})` : ''}`,
    `First contact: ${(lead.created_at || '').slice(0, 10)}`,
    `Pipeline stage: ${lead.stage}, currently scored ${lead.score}`,
    history.length ? `We have ${history.join('; ')}.` : 'We have not written to them yet.',
    (lead.notes || []).length ? `Latest note from the team: ${lead.notes[0].body.slice(0, 400)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [{
        role: 'user',
        content: `THE LEAD\n${context}\n\nTHEIR MESSAGE\n${message.slice(0, 6000)}`,
      }],
    });

    if (response.stop_reason === 'refusal') return null;
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return null;
    return JSON.parse(text.text) as ReplyReading;
  } catch {
    /* A reading is a bonus. Never let it break the intake of a real customer reply. */
    return null;
  }
}

/** The operator-facing note the reading turns into. */
export function readingAsNote(r: ReplyReading): string {
  const lines = [
    `📩 ${r.summary}`,
    '',
    `Reading: ${r.intent.replace(/_/g, ' ')} · ${r.score} · reply ${r.urgency.replace(/_/g, ' ')}`,
  ];
  if (r.key_points.length) {
    lines.push('', 'They asked / said:', ...r.key_points.map((p) => `  • ${p}`));
  }
  lines.push('', `Next step: ${r.next_step}`, '', 'Draft reply:', r.draft_reply);
  return lines.join('\n');
}
