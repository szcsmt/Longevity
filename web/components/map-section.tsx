'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

// Koh Samui bounding box — map cannot be panned outside this
const KS_SW: [number, number] = [9.38,  99.77];
const KS_NE: [number, number] = [9.63, 100.12];

interface Poi {
  id:      string;
  lat:     number;
  lng:     number;
  name:    string;
  desc:    string;
  primary: boolean;
  img:     string;
}

const POIS: Poi[] = [
  { id:'resort',     lat:9.568083, lng:100.076056, primary:true,  img:'/images/streets/entrance.webp',  name:'Longevity Resort',                desc:'Your private gated estate — 60+ villas across four themed lanes, five minutes from the shore.' },
  { id:'bigbuddha',  lat:9.570853, lng:100.059840, primary:false, img:'/images/poi/temple.webp',    name:'Wat Phra Yai · Big Buddha',       desc:"Koh Samui's iconic 12-metre golden Buddha, watching over the north coast." },
  { id:'legacyspa',  lat:9.565938, lng:100.083438, primary:false, img:'/images/poi/spa.webp',       name:'Legacy Spa Bophut',               desc:'Award-winning spa & wellness sanctuary near the north-east cape.' },
  { id:'khunsi',     lat:9.522938, lng:100.013188, primary:false, img:'/images/poi/waterfall.webp', name:'Khun Si Waterfall',               desc:'A hidden jungle waterfall and natural pools in the island’s green interior.' },
  { id:'elephant',   lat:9.548065, lng:100.038457, primary:false, img:'/images/poi/elephant.webp',  name:'Samui Elephant Sanctuary',        desc:'Ethical sanctuary in the Bophut hills — retired elephants, no riding.' },
  { id:'tarnim',     lat:9.482938, lng: 99.994438, primary:false, img:'/images/poi/temple.webp',    name:'Tarnim Magic Garden',             desc:'Mystical stone statues hidden high on Pom Mountain.' },
  { id:'theroof',    lat:9.517000, lng:100.050500, primary:false, img:'/images/poi/rooftop.webp',   name:'The Roof Samui',                  desc:"Panoramic hilltop rooftop bar above Chaweng — the island's best sunset." },
  { id:'bophut',     lat:9.561102, lng:100.028013, primary:false, img:'/images/poi/beach.webp',     name:'Bo Phut Beach',                   desc:'A calm, palm-lined north-shore beach beside Fisherman’s Village.' },
  { id:'airport',    lat:9.547790, lng:100.061997, primary:false, img:'/images/poi/airport.webp',   name:'Samui Airport',                   desc:'A tropical garden airport — just 12 minutes from the estate.' },
  { id:'choengmon',  lat:9.573770, lng:100.080686, primary:false, img:'/images/poi/beach.webp',     name:'Choeng Mon Beach',                desc:'A sheltered white-sand bay on the peaceful north-east cape.' },
  { id:'chaweng',    lat:9.529000, lng:100.062000, primary:false, img:'/images/poi/beach.webp',     name:'Chaweng Beach',                   desc:"The island's most famous beach — 6 km of sand, dining and nightlife." },
  { id:'fishermans', lat:9.558438, lng:100.031438, primary:false, img:'/images/poi/market.webp',    name:"Fisherman's Village Night Market",desc:'Bophut’s historic walking street — boutiques, seafood and the Friday market.' },
];

export function MapSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapEl   = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef    = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Record<string, any>>({});
  const [active, setActive] = useState('resort');
  const [ready, setReady] = useState(false);

  const HIT = 44;   // generous touch target so markers are easy to tap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeIcon(L: any, poi: Poi, isActive: boolean) {
    const hot  = poi.primary || isActive;
    const dot  = poi.primary ? 20 : (isActive ? 16 : 12);
    const bg   = hot ? '#C9A96E' : 'rgba(228,217,195,0.7)';
    const ring = hot ? '0 0 0 6px rgba(201,169,110,0.22)' : '0 0 0 3px rgba(201,169,110,0.16)';
    const glow = hot ? '0 0 18px 2px rgba(201,169,110,0.45),' : '';
    return L.divIcon({
      html: `<div style="width:${HIT}px;height:${HIT}px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
               <div style="width:${dot}px;height:${dot}px;border-radius:50%;background:${bg};box-shadow:${glow}${ring};transition:width .25s,height .25s,box-shadow .25s;"></div>
             </div>`,
      className: '', iconSize: [HIT, HIT], iconAnchor: [HIT / 2, HIT / 2],
    });
  }

  // Defer Leaflet (JS + map tiles) until the map nears the viewport.
  useEffect(() => {
    if (!wrapRef.current || ready) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setReady(true); obs.disconnect(); }
    }, { rootMargin: '500px' });
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapEl.current || mapRef.current) return;
    let mounted = true;

    import('leaflet').then(({ default: L }) => {
      if (!mounted || !mapEl.current || mapRef.current) return;

      const bounds = L.latLngBounds(KS_SW, KS_NE);

      LRef.current = L;
      const map = L.map(mapEl.current, {
        center:              [9.552, 100.052],
        zoom:                12,
        minZoom:             11,
        maxZoom:             15,
        maxBounds:           bounds,
        maxBoundsViscosity:  1.0,   // hard boundary — cannot pan outside
        zoomControl:         false,
        attributionControl:  false,
        scrollWheelZoom:     false,
      });
      mapRef.current = map;

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { subdomains: 'abcd', maxZoom: 19, detectRetina: true },
      ).addTo(map);

      POIS.forEach(poi => {
        const marker = L.marker([poi.lat, poi.lng], { icon: makeIcon(L, poi, poi.id === 'resort'), riseOnHover: true })
          .on('click', () => { if (mounted) setActive(poi.id); })
          .addTo(map);
        markersRef.current[poi.id] = marker;
      });

      requestAnimationFrame(() => { if (mounted) map.invalidateSize(); });
    });

    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-style markers when the active POI changes
  useEffect(() => {
    const L = LRef.current;
    if (!L) return;
    POIS.forEach(p => markersRef.current[p.id]?.setIcon(makeIcon(L, p, p.id === active)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const poi = POIS.find(p => p.id === active);

  return (
    <>
      <style>{`
        .lr-map, .lr-map * { box-sizing: content-box !important; }
        .lr-map { box-sizing: border-box !important; background: #060E08 !important; outline: none !important; }
        .lr-map img.leaflet-tile { border: 0 !important; outline: none !important; padding: 0 !important; box-shadow: none !important; }
        .lr-map .leaflet-tile-pane { filter: hue-rotate(108deg) saturate(0.28) brightness(0.68); }
        .lr-map .leaflet-control-attribution { display: none !important; }
      `}</style>

      <section id="location" style={{ background: 'transparent' }}>

        <div ref={wrapRef} style={{ position: 'relative', height: 'clamp(440px,65vh,780px)' }}>
          <div ref={mapEl} className="lr-map" style={{ width: '100%', height: '100%' }} />

          {/* Active POI card — bottom left: photo + name + description */}
          {poi && (
            <div key={poi.id} style={{
              position: 'absolute', zIndex: 500, pointerEvents: 'none',
              bottom: 'clamp(16px,2.5vw,28px)', left: 'clamp(20px,3vw,36px)',
              width: 'clamp(230px,80vw,300px)',
              background: 'rgba(6,14,8,0.94)',
              border: '1px solid rgba(201,169,110,0.28)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 30px 70px -24px rgba(0,0,0,0.85), 0 0 40px -12px var(--gold-glow)',
              borderRadius: 12, overflow: 'hidden',
              animation: 'fadeIn 0.35s ease both',
            }}>
              <div style={{ position: 'relative' }}>
                <img
                  src={poi.img}
                  alt={poi.name}
                  style={{ width: '100%', height: 132, objectFit: 'cover', display: 'block', filter: 'brightness(0.9)' }}
                />
                {poi.primary && (
                  <span style={{
                    position: 'absolute', top: 10, left: 10,
                    fontFamily: ffs, fontSize: 7, fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase',
                    color: 'var(--bg)', background: 'var(--gold)', padding: '4px 9px', borderRadius: 100,
                  }}>The Estate</span>
                )}
              </div>
              <div style={{ padding: 'clamp(13px,1.6vw,17px) clamp(15px,2vw,18px)' }}>
                <span style={{ display:'block', fontFamily:ff, fontSize:'clamp(14px,1.3vw,17px)', color:'var(--cream)', marginBottom:6, lineHeight:1.2 }}>
                  {poi.name}
                </span>
                <span style={{ display:'block', fontFamily:ffs, fontSize:'clamp(10px,0.9vw,11px)', fontWeight:300, lineHeight:1.65, color:'var(--cr70)' }}>
                  {poi.desc}
                </span>
              </div>
            </div>
          )}

          {/* Zoom controls — bottom right */}
          <div style={{
            position: 'absolute', zIndex: 500,
            bottom: 'clamp(16px,2.5vw,28px)', right: 'clamp(20px,3vw,36px)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {['+', '−'].map(sign => (
              <button
                key={sign}
                aria-label={sign === '+' ? 'Zoom in' : 'Zoom out'}
                onClick={() => sign === '+' ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut()}
                style={{
                  width:32, height:32, cursor:'pointer',
                  background:'rgba(6,14,8,0.90)',
                  border:'1px solid rgba(228,217,195,0.10)',
                  color:'rgba(228,217,195,0.55)',
                  fontFamily:ffs, fontSize:18, fontWeight:300,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  backdropFilter:'blur(8px)', lineHeight:1,
                }}
              >{sign}</button>
            ))}
          </div>
        </div>

      </section>
    </>
  );
}
