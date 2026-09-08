import { useReducedMotion } from 'motion/react';

const GLASS = { top: 1.97, bottom: 1.81, left: 4.08, right: 4.17 };

export function DevicePreview() {
  const reducedMotion = useReducedMotion();

  return (
    <div className='relative w-full'>
      <div
        className='absolute overflow-hidden bg-white'
        style={{
          top: `${GLASS.top}%`,
          bottom: `${GLASS.bottom}%`,
          left: `${GLASS.left}%`,
          right: `${GLASS.right}%`,
          borderRadius: '8%',
        }}
        aria-hidden='true'
      >
        <video
          className='h-full w-full object-cover'
          autoPlay={!reducedMotion}
          loop
          muted
          playsInline
          preload='metadata'
          poster='/buzz/app-poster.jpg'
        >
          <source src='/buzz/app.webm' type='video/webm' />
          <source src='/buzz/app.mp4' type='video/mp4' />
        </video>
      </div>
      <img src='/buzz/iphone.png' alt='' className='pointer-events-none relative z-10 w-full select-none' />
    </div>
  );
}
