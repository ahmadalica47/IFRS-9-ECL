// Stand-ins for the few @instinct/files components the app uses, so the same src/ code runs as a normal website.
import React from 'react';

type P = { children?: React.ReactNode };
export const FileRouter = ({ children }: P) => <>{children}</>;
export const FileCard = ({ children }: P) => <main className="web-card">{children}</main>;
export const Closing = ({ children }: P) => <p className="web-closing">{children}</p>;
export const Group = ({ label, heading, children }: P & { label: string; heading?: boolean }) => <section>{heading && <h3>{label}</h3>}{children}</section>;
export const Callout = ({ title, tone, children }: P & { title?: string; tone?: string }) =>
    <div className={'note ' + (tone === 'warning' ? 'note-warn' : 'note-info')}><span className="note-ic">{tone === 'warning' ? '!' : 'i'}</span><div>{title && <b>{title}</b>}<div className="note-body">{children}</div></div></div>;
