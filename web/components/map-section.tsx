'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

// Koh Samui — full island extent. The map is framed to this on load (fitBounds)
// so the WHOLE island always shows; the old box hugged it too tightly and the
// hard max-bounds clipped the south coast + east cape off the view.
const KS_SW: [number, number] = [9.40,  99.92];
const KS_NE: [number, number] = [9.61, 100.095];

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
  { id:'resort',     lat:9.568083, lng:100.076056, primary:true,  img:'/images/streets/entrance.webp',  name:'Longevity Resort',                desc:'Your private gated estate. 60+ villas across four themed lanes, five minutes from the shore.' },
  { id:'bigbuddha',  lat:9.570853, lng:100.059840, primary:false, img:'/images/poi/temple.webp',    name:'Wat Phra Yai · Big Buddha',       desc:"Koh Samui's iconic 12-metre golden Buddha, watching over the north coast." },
  { id:'legacyspa',  lat:9.565938, lng:100.083438, primary:false, img:'/images/poi/spa.webp',       name:'Legacy Spa Bophut',               desc:'Award winning spa & wellness sanctuary near the northeast cape.' },
  { id:'khunsi',     lat:9.522938, lng:100.013188, primary:false, img:'/images/poi/waterfall.webp', name:'Khun Si Waterfall',               desc:'A hidden jungle waterfall and natural pools in the island’s green interior.' },
  { id:'elephant',   lat:9.548065, lng:100.038457, primary:false, img:'/images/poi/elephant.webp',  name:'Samui Elephant Sanctuary',        desc:'Ethical sanctuary in the Bophut hills, home to retired elephants, with no riding.' },
  { id:'tarnim',     lat:9.482938, lng: 99.994438, primary:false, img:'/images/poi/temple.webp',    name:'Tarnim Magic Garden',             desc:'Mystical stone statues hidden high on Pom Mountain.' },
  { id:'theroof',    lat:9.517000, lng:100.050500, primary:false, img:'/images/poi/rooftop.webp',   name:'The Roof Samui',                  desc:"Panoramic hilltop rooftop bar above Chaweng, with the island's best sunset." },
  { id:'bophut',     lat:9.561102, lng:100.028013, primary:false, img:'/images/poi/beach.webp',     name:'Bo Phut Beach',                   desc:'A calm, palm lined beach on the north shore beside Fisherman’s Village.' },
  { id:'airport',    lat:9.547790, lng:100.061997, primary:false, img:'/images/poi/airport.webp',   name:'Samui Airport',                   desc:'A tropical garden airport, just 12 minutes from the estate.' },
  { id:'choengmon',  lat:9.573770, lng:100.080686, primary:false, img:'/images/poi/beach.webp',     name:'Choeng Mon Beach',                desc:'A sheltered white sand bay on the peaceful northeast cape.' },
  { id:'chaweng',    lat:9.529000, lng:100.062000, primary:false, img:'/images/poi/beach.webp',     name:'Chaweng Beach',                   desc:"The island's most famous beach, with 6 km of sand, dining and nightlife." },
  { id:'fishermans', lat:9.558438, lng:100.031438, primary:false, img:'/images/poi/market.webp',    name:"Fisherman's Village Night Market",desc:'Bophut’s historic walking street, with boutiques, seafood and the Friday market.' },
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
  const [interacted, setInteracted] = useState(false);   // hides the "tap a point" hint

  const HIT = 44;   // generous touch target so markers are easy to tap
  // The resort gets a pushpin (head on a needle whose tip marks the spot);
  // every other place stays a simple dot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeIcon(L: any, poi: Poi, isActive: boolean) {
    if (poi.primary) {
      const W = 40, H = 50, cx = 20, headY = 13, tipY = 46, head = 10;
      return L.divIcon({
        html: `<div style="width:${W}px;height:${H}px;cursor:pointer;filter:drop-shadow(0 0 6px rgba(201,169,110,0.7)) drop-shadow(0 3px 3px rgba(0,0,0,0.55));">
                 <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
                   <line x1="${cx}" y1="${headY + head}" x2="${cx}" y2="${tipY}" stroke="#C9A96E" stroke-width="2" stroke-linecap="round"/>
                   <circle cx="${cx}" cy="${tipY}" r="1.8" fill="#C9A96E"/>
                   <circle cx="${cx}" cy="${headY}" r="${head + 4}" fill="none" stroke="rgba(201,169,110,0.3)" stroke-width="1.5"/>
                   <circle cx="${cx}" cy="${headY}" r="${head}" fill="#C9A96E" stroke="#E8C98A" stroke-width="1.3"/>
                 </svg>
               </div>`,
        className: '', iconSize: [W, H], iconAnchor: [cx, tipY],
      });
    }
    const dot  = isActive ? 16 : 12;
    const bg   = isActive ? '#C9A96E' : 'rgba(228,217,195,0.7)';
    const ring = isActive ? '0 0 0 6px rgba(201,169,110,0.22)' : '0 0 0 3px rgba(201,169,110,0.16)';
    const glow = isActive ? '0 0 18px 2px rgba(201,169,110,0.45),' : '';
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
    let ro: ResizeObserver | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];

    import('leaflet').then(({ default: L }) => {
      if (!mounted || !mapEl.current || mapRef.current) return;

      const islandBounds = L.latLngBounds(KS_SW, KS_NE);

      // On touch devices, dragging the map would trap the page scroll
      // (a downward swipe pans the map instead of scrolling). Disable drag
      // there — markers stay tappable and the zoom buttons still work.
      const isTouch = window.matchMedia('(pointer: coarse)').matches;

      LRef.current = L;
      const map = L.map(mapEl.current, {
        minZoom:             10,
        maxZoom:             15,
        maxBounds:           islandBounds.pad(0.4),  // roomy → the island edges never clip
        maxBoundsViscosity:  1.0,
        zoomControl:         false,
        attributionControl:  false,
        scrollWheelZoom:     false,
        dragging:            !isTouch,
      });
      mapRef.current = map;
      // Frame the whole island (handles any container shape — tall mobile or wide desktop)
      map.fitBounds(islandBounds, { padding: [18, 18], animate: false });

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { subdomains: 'abcd', maxZoom: 19, detectRetina: true },
      ).addTo(map);

      POIS.forEach(poi => {
        const marker = L.marker([poi.lat, poi.lng], { icon: makeIcon(L, poi, poi.id === 'resort'), riseOnHover: true })
          .on('click', () => { if (mounted) { setActive(poi.id); setInteracted(true); } })
          .addTo(map);
        markersRef.current[poi.id] = marker;
      });

      // Load tiles reliably even if the container is sized after init (e.g. the
      // stacked mobile layout): invalidate next frame, after short delays, and
      // whenever the container's box actually changes — re-framing the island
      // each time so it stays whole and centred at any container size.
      const fit = () => { if (mounted) map.fitBounds(islandBounds, { padding: [18, 18], animate: false }); };
      const refresh = () => { if (mounted) { map.invalidateSize(); fit(); } };
      requestAnimationFrame(refresh);
      timers.push(setTimeout(refresh, 300), setTimeout(refresh, 900));
      if (typeof ResizeObserver !== 'undefined' && mapEl.current) {
        ro = new ResizeObserver(refresh);
        ro.observe(mapEl.current);
      }
    });

    return () => {
      mounted = false;
      ro?.disconnect();
      timers.forEach(clearTimeout);
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

      <section id="location" className="lr-location" style={{
        background: 'transparent',
        borderTop: '1px solid rgba(201,169,110,0.06)',
        display: 'grid',
        gridTemplateColumns: '0.92fr 1.08fr',
        gridTemplateRows: 'auto 1fr',
        gridTemplateAreas: '"head map" "card map"',
        minHeight: '100vh',
      }}>

        {/* HEADING — level with the map top */}
        <div style={{
          gridArea: 'head',
          padding: 'clamp(20px,2.4vw,44px) clamp(24px,5vw,72px) 0',
          borderRight: '1px solid rgba(201,169,110,0.06)',
        }}>
          <h2 style={{
            fontFamily: ff, fontWeight: 400, fontSize: 'clamp(38px,4.6vw,68px)',
            lineHeight: 1.04, letterSpacing: '-0.01em', margin: '0 0 clamp(14px,1.8vw,22px)',
          }}>
            <span className="gold-text" style={{ filter: 'drop-shadow(0 0 24px var(--gold-glow))' }}>Location</span>
          </h2>
          <p style={{
            fontFamily: ff, fontWeight: 400, fontStyle: 'italic',
            fontSize: 'clamp(14px,1.4vw,18px)', lineHeight: 1.8,
            color: 'var(--cr70)', margin: 0,
          }}>
            On the peaceful northeast cape of Koh Samui, minutes from the shore,
            the airport, and the island&rsquo;s most beautiful corners.
          </p>
          {/* Nudge to interact with the map */}
          <span className="lr-map-cue" style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            marginTop: 'clamp(16px,2vw,24px)',
            fontFamily: ffs, fontSize: 'clamp(9px,0.95vw,11px)', fontWeight: 400,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)',
          }}>
            <span style={{ display: 'inline-flex', width: 9, height: 9, borderRadius: '50%', background: 'var(--gold)', animation: 'scPulse 2s ease-in-out infinite' }} />
            Tap the points to explore the island
          </span>
        </div>

        {/* SELECTED PLACE — large photo + text, updates when a marker is tapped */}
        <div style={{
          gridArea: 'card',
          padding: 'clamp(22px,2.6vw,40px) clamp(24px,5vw,72px) clamp(48px,6vw,80px)',
          borderRight: '1px solid rgba(201,169,110,0.06)',
        }}>
          {poi && (
            <div key={poi.id} style={{ animation: 'fadeIn 0.4s ease both' }}>
              <div className="elev-img" style={{ position: 'relative', borderRadius: 'clamp(12px,1.4vw,18px)', overflow: 'hidden', border: '1px solid rgba(201,169,110,0.18)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="lr-loc-photo" src={poi.img} alt={poi.name} decoding="async"
                  style={{ width: '100%', height: 'clamp(300px,46vh,560px)', objectFit: 'cover', display: 'block', filter: 'brightness(0.92)' }} />
                {poi.primary && (
                  <span style={{
                    position: 'absolute', top: 14, left: 14,
                    fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase',
                    color: 'var(--bg)', background: 'var(--gold)', padding: '5px 12px', borderRadius: 100,
                  }}>The Estate</span>
                )}
              </div>
              <h3 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(22px,2.3vw,32px)', color: 'var(--cream)', lineHeight: 1.2, margin: 'clamp(16px,2.2vw,26px) 0 10px' }}>
                {poi.name}
              </h3>
              <p style={{ fontFamily: ffs, fontSize: 'clamp(13px,1.2vw,16px)', fontWeight: 300, lineHeight: 1.75, color: 'var(--cr70)', margin: 0 }}>
                {poi.desc}
              </p>
            </div>
          )}
        </div>

        {/* MAP */}
        <div ref={wrapRef} className="lr-loc-map" style={{ gridArea: 'map', position: 'relative', minHeight: 'clamp(440px,60vh,720px)' }}>
          <div ref={mapEl} className="lr-map" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

          {/* Tap hint — fades out after the first marker tap */}
          <div aria-hidden="true" style={{
            position: 'absolute', zIndex: 500, left: '50%', top: 'clamp(14px,2.5vw,24px)',
            transform: 'translateX(-50%)',
            display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '10px 18px', borderRadius: 100, whiteSpace: 'nowrap',
            background: 'rgba(6,14,8,0.82)', border: '1px solid rgba(201,169,110,0.45)',
            backdropFilter: 'blur(8px)',
            fontFamily: ffs, fontSize: 'clamp(9px,0.95vw,11px)', fontWeight: 400,
            letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold)',
            opacity: interacted ? 0 : 1,
            pointerEvents: 'none',
            transition: 'opacity 0.5s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11.5V5.5a1.5 1.5 0 0 1 3 0v5M12 10.5V4.5a1.5 1.5 0 0 1 3 0v6M15 10.5V6a1.5 1.5 0 0 1 3 0v6.5a6 6 0 0 1-6 6h-1.2a4 4 0 0 1-3-1.4l-2.4-2.8a1.6 1.6 0 0 1 2.3-2.2L9 13.5" />
            </svg>
            Tap a point
          </div>

          {/* Zoom controls */}
          <div className="lr-map-zoom" style={{
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
