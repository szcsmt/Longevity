'use client';

import { useScroll, useTransform, motion } from 'framer-motion';
import { useRef } from 'react';

interface Image { src: string; alt?: string; }
interface ZoomParallaxProps { images: Image[]; }

export function ZoomParallax({ images }: ZoomParallaxProps) {
  const container = useRef(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start start', 'end end'],
  });

  const scale4 = useTransform(scrollYProgress, [0, 1], [1, 4]);
  const scale5 = useTransform(scrollYProgress, [0, 1], [1, 5]);
  const scale6 = useTransform(scrollYProgress, [0, 1], [1, 6]);
  const scale8 = useTransform(scrollYProgress, [0, 1], [1, 8]);
  const scale9 = useTransform(scrollYProgress, [0, 1], [1, 9]);

  const scales = [scale4, scale5, scale6, scale5, scale6, scale8, scale9];

  const positions = [
    {},
    { top: '-30vh', left: '5vw',    height: '30vh', width: '35vw' },
    { top: '-10vh', left: '-25vw',  height: '45vh', width: '20vw' },
    { top: '0',     left: '27.5vw', height: '25vh', width: '25vw' },
    { top: '27.5vh',left: '5vw',    height: '25vh', width: '20vw' },
    { top: '27.5vh',left: '-22.5vw',height: '25vh', width: '30vw' },
    { top: '22.5vh',left: '25vw',   height: '15vh', width: '15vw' },
  ];

  return (
    <div ref={container} style={{ position: 'relative', height: '300vh' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
        {images.map(({ src, alt }, index) => {
          const scale = scales[index % scales.length];
          const pos = positions[index] ?? {};

          return (
            <motion.div
              key={index}
              style={{
                scale,
                willChange: 'transform',
                position: 'absolute',
                top: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{
                position: 'relative',
                height: (pos as any).height ?? '25vh',
                width:  (pos as any).width  ?? '25vw',
                top:    (pos as any).top,
                left:   (pos as any).left,
                willChange: 'transform',
              }}>
                <img
                  src={src}
                  alt={alt ?? `Villa ${index + 1}`}
                  loading="eager"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
