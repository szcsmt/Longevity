import { can, canEdit, currentUser, isAuthed } from '@/lib/crm/auth';
import { agents } from '@/lib/crm/agents';
import { COUNTRIES } from '@/lib/crm/language';
import { findContact, getAgency, protectionDays } from '@/lib/crm/partners';
import {
  ClaimConflict, CrmConflict, addNote, addTask, archiveLead, blockContactOf, endNurture, getLead,
  isOutreachChannel, logOutreach, logTouch, mergeLeads, purgeLead, registerAgency, releaseClaim,
  setAwaitingReply, setNurture, setQualification, toggleTask, unarchiveLead, updateLead,
} from '@/lib/crm/store';
import { LOST_REASONS, SCORES, STAGES } from '@/lib/crm/types';
import type { LeadPatch } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

/* Only these keys may be patched — anything else in the payload is dropped so
   a crafted request can't overwrite attribution, history or timestamps. */
const PATCHABLE = ['name', 'email', 'phone', 'whatsapp', 'villa', 'country', 'stage', 'score', 'value', 'lost_reason', 'owner'] as const;

function sanitizePatch(raw: unknown): LeadPatch {
  const src = (raw || {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const k of PATCHABLE) {
    if (!(k in src)) continue;
    const v = src[k];
    if (k === 'value') {
      if (v === null || v === undefined || v === '') patch[k] = undefined;
      else if (typeof v === 'number' && isFinite(v) && v >= 0) patch[k] = Math.round(v);
    } else if (k === 'stage') {
      if (STAGES.some((s) => s.id === v)) patch[k] = v;
    } else if (k === 'score') {
      if ((SCORES as string[]).includes(v as string)) patch[k] = v;
    } else if (k === 'lost_reason') {
      if (v === null || v === '') patch[k] = undefined;
      else if (LOST_REASONS.some((r) => r.id === v)) patch[k] = v;
    } else if (k === 'owner') {
      // Only a name on the configured roster may own a lead — an empty value
      // unassigns. Anything else is dropped rather than stored as free text.
      if (v === null || v === '') patch[k] = undefined;
      else if (typeof v === 'string' && agents().some((a) => a.name === v)) patch[k] = v;
    } else if (k === 'country') {
      /* Only a country the CRM can name — anything else would produce a
         report row nobody can read. Empty clears it, which puts the lead back
         on the dialling-code reading. */
      const code = String(v || '').trim().toUpperCase();
      if (!code) patch[k] = undefined;
      else if (COUNTRIES.some((c) => c.code === code)) patch[k] = code;
    } else if (typeof v === 'string') {
      patch[k] = v.slice(0, 300);
    }
  }
  return patch as LeadPatch;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  if (!(await canEdit())) return Response.json({ ok: false, error: 'read-only account' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  // Stamped onto every change, so the timeline says who as well as what.
  const actor = (await currentUser()) || undefined;

  let lead = null;
  switch (body.op) {
    case 'update':
      try {
        const patch = sanitizePatch(body.patch);
        /* ── Taking a lead off a colleague ──

           An agent may pick up a lead nobody owns — that is somebody stepping
           in, and refusing it would leave the lead sitting there. Moving one
           that already belongs to another salesperson is a different act, and
           it is the head of sales' to make. */
        if ('owner' in patch) {
          const current = await getLead(id);
          const taken = Boolean(current?.owner && current.owner !== patch.owner);
          if (taken && !(await can('leads.reassign'))) {
            return Response.json(
              { ok: false, error: `This lead belongs to ${current!.owner}. Only the head of sales can move it.` },
              { status: 403 },
            );
          }
        }
        lead = await updateLead(id, patch, actor);
      } catch (err) {
        /* A stage that asserts a unit, on a lead that names none. 409 with the
           sentence rather than a blank failure: the operator can act on it. */
        if (err instanceof CrmConflict) {
          return Response.json({ ok: false, error: err.message }, { status: 409 });
        }
        throw err;
      }
      break;
    case 'addNote':
      if (!String(body.body || '').trim()) return Response.json({ ok: false, error: 'empty note' }, { status: 400 });
      lead = await addNote(id, String(body.body), actor);
      break;
    case 'addTask':
      if (!String(body.title || '').trim()) return Response.json({ ok: false, error: 'empty task' }, { status: 400 });
      lead = await addTask(id, String(body.title), body.due ? String(body.due) : undefined, actor);
      break;
    case 'toggleTask':
      lead = await toggleTask(id, String(body.taskId || ''));
      break;
    case 'qualify':
      /* Values are validated in the store against their option lists, so a
         crafted payload cannot make a lead look qualified on answers nobody
         gave — which matters because a stage rule reads them. */
      lead = await setQualification(id, (body.patch || {}) as never, actor);
      break;
    case 'logTouch':
      /* A call, a meeting, a site visit. Agents log these all day, so it sits
         with canEdit like notes and tasks rather than with the owner. An
         unknown key returns null and answers 404 — the UI only ever sends one
         of the six it renders. */
      lead = await logTouch(id, String(body.touch || ''), body.note ? String(body.note) : undefined, actor);
      break;
    case 'outreach': {
      /* Fired by the lead page when somebody presses Email, WhatsApp or Call.
         It records that the channel was OPENED, never that a message was sent.
         An unknown channel is dropped rather than 400'd: this call rides along
         with a navigation the operator has already started, and failing it
         would surface as an error on a button that did its actual job. */
      const channel = String(body.channel || '');
      if (!isOutreachChannel(channel)) return Response.json({ ok: true, ignored: true });
      lead = await logOutreach(id, channel, actor);
      break;
    }
    case 'nurture': {
      /* Park the lead until a date, or bring it back. Sits with canEdit like
         stages and tasks: deciding a buyer is a next-quarter conversation is
         ordinary sales judgement, and the record of it is on the timeline. */
      if (body.until) {
        lead = await setNurture(
          id,
          String(body.until),
          body.reason ? String(body.reason) : undefined,
          body.note ? String(body.note) : undefined,
          actor,
        );
        if (!lead) {
          return Response.json(
            { ok: false, error: 'Pick a date in the future to come back to them.' },
            { status: 400 },
          );
        }
      } else {
        lead = await endNurture(id, actor);
      }
      break;
    }
    case 'register': {
      /* An agency introduced this buyer. Recording it is ordinary sales work,
         so it sits with canEdit — but registering OVER another agency's live
         claim is a commercial decision about who gets paid, and that stays
         with the owner. */
      const agency = await getAgency(String(body.agencyId || ''));
      if (!agency || agency.archived_at) {
        return Response.json({ ok: false, error: 'Pick an agency we work with.' }, { status: 400 });
      }
      const override = body.override === true;
      if (override && !(await can('partners.write'))) {
        return Response.json(
          { ok: false, error: 'Recording over another agency’s claim is the owner’s decision.' },
          { status: 403 },
        );
      }
      const broker = findContact(agency, String(body.brokerId || '') || undefined);
      try {
        lead = await registerAgency(
          id,
          agency,
          protectionDays(agency),
          {
            brokerId: broker?.id,
            brokerName: broker?.name,
            note: body.note ? String(body.note) : undefined,
            override,
          },
          actor,
        );
      } catch (err) {
        if (err instanceof ClaimConflict) {
          /* 409 with the sentence, not a blank failure: the operator can act
             on "X registered them on the 3rd and holds it until June" — either
             by leaving it alone or by deciding to override. */
          return Response.json({ ok: false, error: err.message, conflict: err.claim }, { status: 409 });
        }
        throw err;
      }
      break;
    }
    case 'releaseClaim': {
      // Withdrawing a registration decides who does not get paid.
      if (!(await can('partners.write'))) return Response.json({ ok: false, error: 'the owner\u2019s decision' }, { status: 403 });
      lead = await releaseClaim(id, String(body.claimId || ''), String(body.reason || ''), actor);
      if (!lead) {
        return Response.json(
          { ok: false, error: 'Say why the registration is being withdrawn — it stays on the record.' },
          { status: 400 },
        );
      }
      break;
    }
    case 'merge':
      // Merging folds one record into another and archives the husk.
      if (!(await can('leads.merge'))) return Response.json({ ok: false, error: 'not permitted' }, { status: 403 });
      lead = await mergeLeads(id, String(body.otherId || ''), actor);
      break;
    case 'awaiting':
      lead = await setAwaitingReply(id, body.on === true);
      break;
    case 'unarchive':
      /* Restoring is the reversal of an owner-level decision, so it stays with
         the owner. Everything about the lead is intact; this only puts it back
         into the working views. */
      if (!(await can('leads.archive'))) return Response.json({ ok: false, error: 'not permitted' }, { status: 403 });
      lead = await unarchiveLead(id, actor);
      break;
    default:
      return Response.json({ ok: false, error: 'unknown op' }, { status: 400 });
  }

  if (!lead) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  return Response.json({ ok: true, lead });
}

/* ── DELETE archives; ?purge=1 destroys ──

   The default is reversible, because the request that looks like "get rid of
   this" is almost always "get this out of my way". A real erasure needs
   ?purge=1 AND a lead that is already archived, so destroying a customer's
   history can never be a single click.

   Both stay with the owner of the business even though agents may edit
   everything else about a lead. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  /* Two different decisions behind one verb. Setting a lead aside is
     reversible and belongs to whoever runs the team; destroying its history is
     not, and stays with the owner of the business. */
  const needed = q.get('purge') === '1' ? 'leads.purge' : 'leads.archive';
  if (!(await can(needed))) return Response.json({ ok: false, error: 'not permitted' }, { status: 403 });

  // ?block=1: also blocklist the contact so their next WhatsApp message never
  // recreates the lead (for private/non-lead contacts).
  if (q.get('block') === '1') {
    const lead = await getLead(id);
    if (lead) await blockContactOf(lead);
  }

  if (q.get('purge') === '1') {
    const result = await purgeLead(id);
    if (result === 'not-found') return Response.json({ ok: false, error: 'not found' }, { status: 404 });
    if (result === 'not-archived') {
      return Response.json(
        { ok: false, error: 'Archive the lead first. A permanent delete is deliberately a second step.' },
        { status: 409 },
      );
    }
    if (result === 'holds-unit') {
      return Response.json(
        { ok: false, error: 'This lead is the buyer of a unit. Unlink them on the masterplan first.' },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, purged: true });
  }

  /* Archiving refuses a lead that holds a reserved or sold unit, and says which
     one. 409 with the sentence rather than a blank failure: the operator can
     act on it, and the alternative is a unit pointing at a buyer nobody can
     see. */
  try {
    const lead = await archiveLead(id, q.get('reason') || undefined, (await currentUser()) || undefined);
    const ok = Boolean(lead);
    return Response.json({ ok, archived: ok }, { status: ok ? 200 : 404 });
  } catch (err) {
    if (err instanceof CrmConflict) {
      return Response.json({ ok: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
