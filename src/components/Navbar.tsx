import React from 'react';
import { RotateCcw, Play } from 'lucide-react';

export type TabKey = 'app' | 'backend' | 'customer' | 'visualizer' | 'decision' | 'racks' | 'score' | 'roi' | 'architecture' | 'document';

interface NavbarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  onRunDemo: () => void;
  onReset: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onRunDemo,
  onReset,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand title, single element */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onSelectTab('app')}
            className="text-left group cursor-pointer focus:outline-none"
          >
            <div className="text-lg font-bold tracking-tight text-white group-hover:text-amber-400 transition-colors flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              Smart Cancel
            </div>
          </button>
          <span className="hidden sm:inline text-xs text-slate-400 font-normal">
            Made by Team for AWS Hackathon
          </span>
        </div>

        {/* Zone 2: 4-6 nav links */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          <button
            onClick={() => onSelectTab('app')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'app'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Operations
          </button>
          <button onClick={() => onSelectTab('backend')} className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${activeTab === 'backend' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'}`}>Live API</button>
          <button onClick={() => onSelectTab('customer')} className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${activeTab === 'customer' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'}`}>Customer App</button>
          <button
            onClick={() => onSelectTab('visualizer')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'visualizer'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Logistics 3D
          </button>
          <button
            onClick={() => onSelectTab('decision')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'decision'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Decision Engine
          </button>
          <button
            onClick={() => onSelectTab('racks')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'racks'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Hub Slots
          </button>
          <button
            onClick={() => onSelectTab('score')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'score'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Irreversibility Score
          </button>
          <button
            onClick={() => onSelectTab('roi')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'roi'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Impact & ROI
          </button>
          <button
            onClick={() => onSelectTab('document')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'document'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Pitch Document
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRunDemo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors shadow-sm whitespace-nowrap cursor-pointer"
            title="Run simulated cancellation through the entire Smart Cancel flow"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Interactive Demo</span>
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            title="Reset simulation parameters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Mobile nav drawer / horizontal scroll bar */}
      <div className="lg:hidden flex items-center gap-2 px-4 py-2 bg-slate-950/80 border-t border-slate-800 overflow-x-auto text-xs">
        <button
          onClick={() => onSelectTab('app')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${
            activeTab === 'app' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'
          }`}
        >
          Operations
        </button>
        <button onClick={() => onSelectTab('backend')} className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'backend' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'}`}>Live API</button>
        <button onClick={() => onSelectTab('customer')} className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'customer' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'}`}>Customer App</button>
        <button
          onClick={() => onSelectTab('visualizer')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${
            activeTab === 'visualizer' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'
          }`}
        >
          Logistics 3D
        </button>
        <button
          onClick={() => onSelectTab('decision')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${
            activeTab === 'decision' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'
          }`}
        >
          Decision Engine
        </button>
        <button
          onClick={() => onSelectTab('racks')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${
            activeTab === 'racks' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'
          }`}
        >
          Hub Slots
        </button>
        <button
          onClick={() => onSelectTab('score')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${
            activeTab === 'score' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'
          }`}
        >
          Score (0-100)
        </button>
        <button
          onClick={() => onSelectTab('roi')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${
            activeTab === 'roi' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'
          }`}
        >
          Impact & ROI
        </button>
        <button
          onClick={() => onSelectTab('document')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${
            activeTab === 'document' ? 'bg-amber-400 text-slate-900 font-semibold' : 'text-slate-300'
          }`}
        >
          Document
        </button>
      </div>
    </header>
  );
};
