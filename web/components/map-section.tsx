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
  label:   string;
  sub:     string;
  primary: boolean;
  img:     string | null;
}

const POIS: Poi[] = [
  { id:'resort',  lat:9.5330, lng:100.0460, label:'Longevity Resort',    sub:'Exclusive private estate', primary:true,  img:'/images/ks-villa-01.webp' },
  { id:'airport', lat:9.5478, lng:100.0622, label:'Koh Samui Airport',   sub:'12 min · 9 km',            primary:false, img:null },
  { id:'bophut',  lat:9.5428, lng: 99.9800, label:"Fisherman's Village", sub:'15 min · 11 km',           primary:false, img:null },
  { id:'chaweng', lat:9.5215, lng:100.0558, label:'Chaweng Beach',       sub:'18 min · 13 km',           primary:false, img:null },
  { id:'nathon',  lat:9.5330, lng: 99.8320, label:'Na Thon Ferry',       sub:'35 min · 28 km',           primary:false, img:null },
];

export function MapSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapEl   = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef  = useRef<any>(null);
  const [active, setActive] = useState('resort');

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let mounted = true;

    import('leaflet').then(({ default: L }) => {
      if (!mounted || !mapEl.current || mapRef.current) return;

      const bounds = L.latLngBounds(KS_SW, KS_NE);

      const map = L.map(mapEl.current, {
        center:              [9.515, 99.946],
        zoom:                12,
        minZoom:             11,
        maxZoom:             14,
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

      const HIT = 44;   // generous touch target so markers are easy to tap
      POIS.forEach(poi => {
        const dot = poi.primary ? 20 : 13;
        const bg  = poi.primary ? '#C9A96E' : 'rgba(228,217,195,0.72)';
        const ring = poi.primary
          ? '0 0 0 6px rgba(201,169,110,0.22)'
          : '0 0 0 3px rgba(201,169,110,0.16)';
        const pulse = poi.primary ? 'box-shadow:0 0 18px 2px rgba(201,169,110,0.45),' + ring + ';' : 'box-shadow:' + ring + ';';

        const icon = L.divIcon({
          html: `<div style="width:${HIT}px;height:${HIT}px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                   <div style="width:${dot}px;height:${dot}px;border-radius:50%;background:${bg};${pulse}"></div>
                 </div>`,
          className: '',
          iconSize:   [HIT, HIT],
          iconAnchor: [HIT / 2, HIT / 2],
        });

        L.marker([poi.lat, poi.lng], { icon, riseOnHover: true })
          .on('click', () => { if (mounted) setActive(poi.id); })
          .addTo(map);
      });

      requestAnimationFrame(() => { if (mounted) map.invalidateSize(); });
    });

    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

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

          {/* Active POI card — bottom left, includes photo for resort */}
          {poi && (
            <div key={poi.id} style={{
              position: 'absolute', zIndex: 500, pointerEvents: 'none',
              bottom: 'clamp(16px,2.5vw,28px)', left: 'clamp(20px,3vw,36px)',
              background: 'rgba(6,14,8,0.94)',
              border: '1px solid rgba(201,169,110,0.28)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 30px 70px -24px rgba(0,0,0,0.85), 0 0 40px -12px var(--gold-glow)',
              minWidth: 220, maxWidth: 280,
              overflow: 'hidden',
            }}>
              {poi.img && (
                <img
                  src={poi.img}
                  alt={poi.label}
                  style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block', filter: 'brightness(0.85)' }}
                />
              )}
              <div style={{ padding: 'clamp(10px,1.5vw,16px) clamp(14px,2vw,18px)' }}>
                <span style={{ display:'block', fontFamily:ff, fontSize:'clamp(13px,1.2vw,15px)', color:'var(--cream)', marginBottom:5 }}>
                  {poi.label}
                </span>
                <span style={{ display:'block', fontFamily:ffs, fontSize:8, fontWeight:300, letterSpacing:'0.16em', color:'var(--gold)', opacity:0.7 }}>
                  {poi.sub}
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
