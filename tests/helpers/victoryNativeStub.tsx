import React from 'react';

export function CartesianChart({ children, ...props }: any) {
  const points = { value: [] };
  return React.createElement('CartesianChart', props, typeof children === 'function' ? children({ points }) : children);
}

export function Line(props: any) {
  return React.createElement('VictoryLine', props);
}

export function BarGroup({ children, ...props }: any) {
  return React.createElement('VictoryBarGroup', props, children);
}
BarGroup.Bar = (props: any) => React.createElement('VictoryBar', props);

export function StackedBar(props: any) {
  return React.createElement('VictoryStackedBar', props);
}
