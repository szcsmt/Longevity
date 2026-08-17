'use client';

import { Nav }               from '@/components/nav';
import { HeroSection }       from '@/components/hero-section';
import { KeyFactsBand }      from '@/components/key-facts';
import { IntroSection }      from '@/components/intro-section';
import { StorySection }      from '@/components/story-section';
import { SolutionSection }   from '@/components/solution-section';
import { CentreSection }     from '@/components/centre-section';
import { EstateSection }     from '@/components/estate-section';
import { ParkSection }       from '@/components/park-section';
import { ParkLifeSection }   from '@/components/park-life-section';
import { AmenitiesSection }  from '@/components/amenities-section';
import { TourSection }       from '@/components/tour-section';
import { VillasSection }     from '@/components/villas-section';
import { InteriorSection }   from '@/components/interior-section';
import { MapSection }        from '@/components/map-section';
import { CtaSection }        from '@/components/cta-section';
import { FooterSection }     from '@/components/footer-section';
import { ReserveFab }        from '@/components/reserve-fab';
import { InteractionTracker } from '@/components/interaction-tracker';

export default function Home() {
  return (
    <main style={{ background: 'transparent', position: 'relative' }}>
      <div className="bg-atmosphere" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />
      <InteractionTracker />
      <Nav />
      <HeroSection />
      {/* Preview only (localhost/dev) until the owner approves it — kept out of production. */}
      {process.env.NODE_ENV === 'development' && <KeyFactsBand />}
      <IntroSection />
      <StorySection />
      {/* Preview only (localhost/dev) until the owner approves it — kept out of production. */}
      {process.env.NODE_ENV === 'development' && <CentreSection />}
      <EstateSection />
      <ParkSection />
      <ParkLifeSection />
      <AmenitiesSection />
      {/* The estate seen whole, in 3D — the visitor has just been shown the grounds
          from the outside, so this is where walking them makes sense, and it sets
          up the residences that follow. */}
      <TourSection />
      <VillasSection />
      <InteriorSection />
      {/* "Where it belongs — Koh Samui": the island sits between the residence and the
          map, so the story zooms out from the interior to the island, then to the pin. */}
      <SolutionSection />
      <MapSection />
      <CtaSection />
      <FooterSection />
      <ReserveFab />
    </main>
  );
}
