import React, { useEffect, useState } from 'react';

interface JumpscareProps {
  onComplete: () => void;
}

const Jumpscare: React.FC<JumpscareProps> = ({ onComplete }) => {
  useEffect(() => {
    // End the scare after 2 seconds
    const timer = setTimeout(() => {
      onComplete();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 z-[1000] bg-black flex items-center justify-center overflow-hidden">
        {/* Flashing Background */}
        <div className="absolute inset-0 bg-red-900 animate-pulse opacity-50"></div>
        
        {/* Shake Container */}
        <div className="relative animate-[shake_0.1s_infinite] w-full h-full flex items-center justify-center">
             {/* Scary Abstract Face (CSS/SVG) */}
             <svg viewBox="0 0 100 100" className="w-[80vw] h-[80vh] drop-shadow-[0_0_50px_rgba(255,0,0,1)]">
                 <defs>
                     <filter id="displacement" x="0%" y="0%" height="100%" width="100%">
                         <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="turbulence" />
                         <feDisplacementMap in2="turbulence" in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G" />
                     </filter>
                 </defs>
                 
                 <g filter="url(#displacement)" fill="black" stroke="red" strokeWidth="1">
                    {/* Hollow Eyes */}
                    <circle cx="35" cy="40" r="10" fill="white" />
                    <circle cx="65" cy="40" r="10" fill="white" />
                    <circle cx="35" cy="40" r="2" fill="black" />
                    <circle cx="65" cy="40" r="2" fill="black" />
                    
                    {/* Screaming Mouth */}
                    <ellipse cx="50" cy="70" rx="20" ry="25" fill="#1a0000" stroke="white" strokeWidth="2" />
                 </g>
             </svg>
        </div>
        
        {/* Screen Noise Overlay */}
        <div className="absolute inset-0 bg-[url('https://upload.wikimedia.org/wikipedia/commons/7/76/Noise_tv.png')] opacity-20 mix-blend-overlay"></div>
    </div>
  );
};

export default Jumpscare;