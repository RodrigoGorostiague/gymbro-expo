import React from 'react';

const createHost = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);

const Svg = createHost('Svg');

export default Svg;
export const Circle = createHost('Circle');
export const Line = createHost('Line');
export const Path = createHost('Path');
export const Polygon = createHost('Polygon');
