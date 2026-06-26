'use client';

import { Nav }               from '@/components/nav';
import { HeroSection }       from '@/components/hero-section';
import { StorySection }      from '@/components/story-section';
import { SolutionSection }   from '@/components/solution-section';
import { EstateSection }     from '@/components/estate-section';
import { ParkSection }       from '@/components/park-section';
import { ParkLifeSection }   from '@/components/park-life-section';
import { AmenitiesSection }  from '@/components/amenities-section';
import { LongevityCalculator } from '@/components/longevity-calculator';
import { VillasSection }     from '@/components/villas-section';
import { InteriorSection }   from '@/components/interior-section';
import { MapSection }        from '@/components/map-section';
import { CtaSection }        from '@/components/cta-section';
import { FooterSection }     from '@/components/footer-section';
import { ReserveFab }        from '@/components/reserve-fab';

export default function Home() {
  return (
    <main style={{ background: 'transparent', position: 'relative' }}>
      <div className="bg-atmosphere" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />
      <Nav />
      <HeroSection />
      <StorySection />
      <SolutionSection />
      <EstateSection />
      <ParkSection />
      <ParkLifeSection />
      <AmenitiesSection />
      <LongevityCalculator />
      <VillasSection />
      <InteriorSection />
      <MapSection />
      <CtaSection />
      <FooterSection />
      <ReserveFab />
    </main>
  );
}
