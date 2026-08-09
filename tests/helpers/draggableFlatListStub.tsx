import React from 'react';

const renderList = ({ data = [], renderItem, ListFooterComponent, ListHeaderComponent, ...props }: any, name: string) => React.createElement(
  name,
  props,
  ListHeaderComponent,
  data.map((item: any, index: number) => React.createElement(React.Fragment, { key: item.id ?? index }, renderItem({ item, index, drag: () => undefined, isActive: false }))),
  ListFooterComponent,
);
export const ScaleDecorator = ({ children }: any) => React.createElement('ScaleDecorator', null, children);
export const NestableScrollContainer = ({ children, ...props }: any) => React.createElement('NestableScrollContainer', props, children);
export const NestableDraggableFlatList = (props: any) => renderList(props, 'NestableDraggableFlatList');
export default (props: any) => renderList(props, 'DraggableFlatList');
