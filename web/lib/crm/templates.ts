import type { Lead } from './types';

/* One-click reply templates, personalised from the lead. The component builds
   mailto:/wa.me links from these; nothing is sent automatically. Copy lives
   here so wording is easy to tune in one place. */

export interface MessageTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export function messageTemplates(lead: Lead): MessageTemplate[] {
  const first = (lead.name || '').trim().split(/\s+/)[0] || 'there';
  const villa = lead.villa || 'our residences';

  return [
    {
      id: 'first-response',
      label: 'First response',
      subject: 'Your Longevity Samui enquiry',
      body: `Dear ${first},\n\nThank you for your interest in Longevity Wellness Resort Samui. I would be delighted to tell you more about ${villa} and answer any questions you may have.\n\nWould a short call this week suit you?\n\nWarm regards`,
    },
    {
      id: 'brochure-follow-up',
      label: 'Brochure follow-up',
      subject: 'Any questions about Longevity Samui?',
      body: `Dear ${first},\n\nI hope the brochure gave you a good feel for the resort. If anything caught your eye — the residences, the wellness centre, or the investment terms — I am happy to walk you through the details.\n\nWarm regards`,
    },
    {
      id: 'viewing-invite',
      label: 'Viewing invite',
      subject: 'Visit Longevity Samui — private viewing',
      body: `Dear ${first},\n\nWould you like to see ${villa} in person? We arrange private viewings on Koh Samui, and a video tour if you cannot travel just yet. Tell me what dates could work and I will take care of the rest.\n\nWarm regards`,
    },
    {
      id: 'reservation-steps',
      label: 'Reservation steps',
      subject: 'Reserving your residence — next steps',
      body: `Dear ${first},\n\nWonderful news that you are considering reserving ${villa}. The next steps are simple: a reservation agreement and a fully refundable deposit secure your residence while the paperwork is prepared.\n\nI will send everything over — shall we schedule a call to go through it together?\n\nWarm regards`,
    },
  ];
}
