import React from 'react';
import { LxOperatorView } from './variants/LxOperatorView.js';
import { SxOperatorView } from './variants/SxOperatorView.js';
import { VideoOperatorView } from './variants/VideoOperatorView.js';
import { AutoOperatorView } from './variants/AutoOperatorView.js';
import { PyroOperatorView } from './variants/PyroOperatorView.js';
import { FsOperatorView } from './variants/FsOperatorView.js';
import { GenericOperatorView } from './variants/GenericOperatorView.js';

export interface OperatorViewProps {
  cuelistId: string;
  owned: string[];
  watched: string[];
}

export function OperatorView({ cuelistId, owned, watched }: OperatorViewProps) {
  if (owned.length === 1) {
    switch (owned[0]) {
      case 'LX':
        return <LxOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'SX':
        return <SxOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'VIDEO':
        return <VideoOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'AUTO':
        return <AutoOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'PYRO':
        return <PyroOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'FS':
        return <FsOperatorView cuelistId={cuelistId} watched={watched} />;
    }
  }
  return <GenericOperatorView cuelistId={cuelistId} owned={owned} watched={watched} />;
}
