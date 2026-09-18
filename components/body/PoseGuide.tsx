import React from 'react';
import Svg, { Circle, Path, Line, G } from 'react-native-svg';
import { BodyPose } from '../../utils/bodyEvolution';

// Neutral alignment guides, not a target body shape. Same view box across capture and cards.
export function PoseGuide({ pose, color = '#FFFFFF', opacity = 0.65 }: { pose: BodyPose; color?: string; opacity?: number }) {
  return <Svg width="100%" height="100%" viewBox="0 0 240 400" accessibilityLabel="Guía de posición de la pose">
    <G stroke={color} strokeWidth={3} fill="none" opacity={opacity} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={120} y1={15} x2={120} y2={385} strokeDasharray="5 8" strokeWidth={1} />
      {pose === 'front-legs' ? <>
        <Path d="M65 40 Q120 55 175 40 L182 115 Q175 160 160 200 L151 290 L162 360 L133 360 L121 260 L120 170 L119 260 L107 360 L78 360 L89 290 L80 200 Q65 160 58 115 Z" />
        <Line x1={55} y1={40} x2={185} y2={40} strokeDasharray="5 6" />
      </> : pose === 'side-glutes' ? <>
        <Circle cx={119} cy={48} r={22} />
        <Path d="M108 71 Q83 105 103 143 Q110 163 96 187 Q76 209 99 234 L101 293 L95 366 L129 366 L125 285 L145 232 Q165 210 142 178 Q124 151 137 121 L136 84 Z" />
        <Path d="M123 89 L145 138 L142 186 M139 234 L141 301 L139 366 L163 366" />
      </> : <>
        <Circle cx={120} cy={48} r={22} />
        <Path d="M102 72 L82 90 L92 144 L100 185 L91 236 L83 365 L108 365 L120 252 L132 365 L157 365 L149 236 L140 185 L148 144 L158 90 L138 72" />
        {pose === 'front-biceps' ? <Path d="M82 90 L53 106 L29 72 L31 39 L45 39 L48 65 L65 76 L96 79 M158 90 L187 106 L211 72 L209 39 L195 39 L192 65 L175 76 L144 79" /> : <>
          <Path d="M82 90 L64 130 L52 192 L68 198 L84 150 M158 90 L176 130 L188 192 L172 198 L156 150 M120 83 L120 177 M100 102 L120 125 L140 102" />
        </>}
      </>}
      <Line x1={70} y1={372} x2={110} y2={372} />
      <Line x1={130} y1={372} x2={170} y2={372} />
    </G>
  </Svg>;
}
