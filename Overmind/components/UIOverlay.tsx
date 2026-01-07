/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useRef, useState } from 'react';
import { BuildingType, CityStats, AIGoal, NewsItem } from '../types';
import { BUILDINGS } from '../constants';

interface UIOverlayProps {
  stats: CityStats;
  selectedTool: BuildingType;
  onSelectTool: (type: BuildingType) => void;
  currentGoal: AIGoal | null;
  newsFeed: NewsItem[];

  onCycleTax?: () => void;
  onTakeLoan?: () => void;
  onRepayLoan?: () => void;
  onBuyShares?: () => void;
  onSellShares?: () => void;
  onResetCity: () => void;
}


const tools = [
  BuildingType.None, // Bulldoze
  BuildingType.Road,
  BuildingType.Bridge,
  BuildingType.Apartment,
  BuildingType.Residential,
  BuildingType.Mansion,
  BuildingType.Commercial,
  BuildingType.Industrial,
  BuildingType.Park,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.Police,
  BuildingType.FireStation,
  BuildingType.GoldMine,
];

// --- Sub-Components ---

const ProgressBar = ({ label, value, max, color, subLabel, bottomText }: { label: string, value: number, max: number, color: string, subLabel?: string, bottomText?: React.ReactNode }) => {
  const percent = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-300 font-bold mb-1">
        <span>{label}</span>
        <span className={percent >= 100 ? 'text-green-400' : ''}>{subLabel || `${percent.toFixed(0)}%`}</span>
      </div>
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-500 ${color}`} style={{ width: `${percent}%` }}></div>
      </div>
      {bottomText ? (
        <div className="text-[10px] text-gray-500 mt-0.5 font-mono">{bottomText}</div>
      ) : (
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5 font-mono">
          <span>{value}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
};

const CityStatusPanel = ({ stats }: { stats: CityStats }) => {
  const net = (stats.budget?.income || 0) - (stats.budget?.expenses || 0);
  const housingCapacity = stats.housingCapacity || 0;
  const housingColor = (stats.population || 0) >= housingCapacity ? 'bg-red-500' : 'bg-blue-500';
  const workforce = stats.demographics.adults || 0;
  const totalJobs = stats.jobs.total || 0;
  const employmentColor = totalJobs < workforce ? 'bg-orange-500' : 'bg-green-500';

  const educatedCount = Math.floor(workforce * ((stats.education || 0) / 100));

  return (
    <div className="w-64 bg-slate-900/95 border border-slate-700 text-white p-3 rounded-lg shadow-xl backdrop-blur-md pointer-events-auto font-sans">
      <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-3 border-b border-gray-700 pb-1">City Status</h3>

      {/* Housing */}
      <ProgressBar
        label="Housing"
        value={stats.population || 0}
        max={housingCapacity}
        color={housingColor}
        subLabel={(stats.population || 0) >= housingCapacity ? 'Full' : undefined}
        bottomText={<div className="flex justify-between"><span>Pop: {stats.population || 0}</span><span>Cap: {housingCapacity}</span></div>}
      />

      {/* Employment */}
      <ProgressBar
        label="Employment"
        value={totalJobs}
        max={workforce}
        color={employmentColor}
        subLabel={totalJobs >= workforce ? 'Full Emp.' : undefined}
        bottomText={<div className="flex justify-between"><span>Jobs: {totalJobs}</span><span>Wrk: {workforce}</span></div>}
      />

      {/* Demographics */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-300 font-bold mb-1">Demographics</div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden flex">
          <div className="h-full bg-cyan-400" style={{ width: `${(stats.demographics.children / (stats.population || 1)) * 100}%` }}></div>
          <div className="h-full bg-blue-500" style={{ width: `${(stats.demographics.adults / (stats.population || 1)) * 100}%` }}></div>
          <div className="h-full bg-purple-400" style={{ width: `${(stats.demographics.seniors / (stats.population || 1)) * 100}%` }}></div>
        </div>
        <div className="flex justify-between text-[9px] text-gray-400 mt-0.5 font-mono">
          <span className="text-cyan-400">Child: {stats.demographics.children}</span>
          <span className="text-blue-500">Adl: {stats.demographics.adults}</span>
          <span className="text-purple-400">Snr: {stats.demographics.seniors}</span>
        </div>
      </div>

      <div className="h-px bg-gray-700 my-2"></div>

      {/* Social Stats */}
      <ProgressBar
        label="Education"
        value={stats.education || 0}
        max={100}
        color="bg-cyan-600"
        bottomText={<span>{educatedCount} Educated Citizens</span>}
      />

      <ProgressBar
        label="Safety"
        value={stats.safety || 0}
        max={100}
        color="bg-emerald-600"
        bottomText={<div className="flex justify-between"><span>Risk: {100 - (stats.safety || 100)}%</span><span>Safe: {stats.safety || 100}%</span></div>}
      />

      <ProgressBar
        label="Happiness"
        value={stats.happiness}
        max={100}
        color="bg-yellow-400"
        subLabel={`${stats.happiness}%`}
        bottomText={<span>Approval Rating</span>}
      />

      <div className="h-px bg-gray-700 my-2"></div>

      {/* Budget */}
      {/* Budget */}
      <div className="text-xs">
        <div className="text-gray-400 font-bold mb-1">Daily Budget</div>
        <div className="flex justify-between text-green-400">
          <span>Income</span>
          <span>+${(stats.budget?.income || 0).toLocaleString()}</span>
        </div>
        <div className="pl-2 text-[10px] text-gray-500">
          <div className="flex justify-between"><span>Tax</span><span>{stats.budget?.details?.tax || 0}</span></div>
          <div className="flex justify-between"><span>Business</span><span>{stats.budget?.details?.business || 0}</span></div>
        </div>

        <div className="flex justify-between text-red-400 mt-1">
          <span>Expenses</span>
          <span>-${(stats.budget?.expenses || 0).toLocaleString()}</span>
        </div>
        <div className="pl-2 text-[10px] text-gray-500">
          <div className="flex justify-between"><span>Services</span><span>{stats.budget?.details?.services || 0}</span></div>
          <div className="flex justify-between"><span>Welfare</span><span>{stats.budget?.details?.welfare || 0}</span></div>
        </div>

        <div className="h-px bg-gray-700 my-1"></div>
        <div className={`flex justify-between font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          <span>Net Daily</span>
          <span>{net >= 0 ? '+' : ''}${net.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

const AiControlPanel = ({ status, onReset }: { status: string, onReset: () => void }) => {
  return (
    <div className="w-64 bg-slate-900/95 border border-slate-700 text-white p-3 rounded-lg shadow-xl backdrop-blur-md pointer-events-auto font-sans">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
          <span className="font-bold font-mono tracking-wider">AI MAYOR</span>
        </div>
        <div className="text-[10px] text-green-400 font-bold border border-green-500/50 px-2 py-0.5 rounded bg-green-900/20">
          ONLINE
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <button
          onClick={onReset}
          className="flex-1 bg-red-900/40 hover:bg-red-800 border border-red-700/50 rounded py-1 text-xs font-bold text-red-200 transition-colors"
        >
          RESET CITY
        </button>
        <button className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded py-1 text-xs font-bold text-gray-300">SHOW LOG</button>
      </div>

      <div className="text-[10px] font-mono text-cyan-400 truncate">
        {status}
      </div>
    </div>
  );
}


const ToolButton: React.FC<{
  type: BuildingType;
  isSelected: boolean;
  onClick: () => void;
  money: number;
}> = ({ type, isSelected, onClick, money }) => {
  const config = BUILDINGS[type];
  const canAfford = money >= config.cost;
  const isBulldoze = type === BuildingType.None;
  const bgColor = config.color;

  return (
    <button
      onClick={onClick}
      disabled={!isBulldoze && !canAfford}
      className={`
        relative flex flex-col items-center justify-center rounded-lg border-2 transition-all shadow-lg backdrop-blur-sm flex-shrink-0
        w-14 h-14
        ${isSelected ? 'border-white bg-white/20 scale-110 z-10' : 'border-gray-600 bg-gray-900/80 hover:bg-gray-800'}
        ${!isBulldoze && !canAfford ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={config.description}
    >
      <div className="w-8 h-8 rounded mb-1 border border-black/30 shadow-inner flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: isBulldoze ? 'transparent' : bgColor }}>
        {isBulldoze && <div className="text-red-600 font-bold text-lg">✕</div>}
        {type === BuildingType.Road && <div className="w-full h-2 bg-gray-800 -rotate-45"></div>}
      </div>
      <span className="text-[9px] font-bold text-white uppercase tracking-wider leading-none">{config.name}</span>
      {config.cost > 0 && (
        <span className={`text-[9px] font-mono leading-none ${canAfford ? 'text-green-300' : 'text-red-400'}`}>${config.cost}</span>
      )}
    </button>
  );
};

const UIOverlay: React.FC<UIOverlayProps> = ({
  stats, selectedTool, onSelectTool, currentGoal, newsFeed, onClaimReward, isGeneratingGoal,
  onCycleTax, onTakeLoan, onRepayLoan, onBuyShares, onSellShares, onResetCity
}) => {
  const newsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (newsRef.current) newsRef.current.scrollTop = newsRef.current.scrollHeight;
  }, [newsFeed]);

  const aiStatus = isGeneratingGoal ? "AI is analyzing city state..." : (currentGoal ? `Focus: ${currentGoal.description.substring(0, 30)}...` : "Idle");

  return (
    <div className="absolute inset-0 pointer-events-none p-4 font-sans z-10 flex flex-col justify-between">

      {/* Top Left: Panels */}
      <div className="flex flex-col gap-4 items-start">
        <CityStatusPanel stats={stats} />
        <AiControlPanel status={aiStatus} onReset={onResetCity} />
      </div>

      {/* Top Right: Treasury Display (Simplified) */}
      <div className="absolute top-4 right-4 bg-slate-900/90 text-white px-4 py-2 rounded-xl border border-slate-600 shadow-xl pointer-events-auto">
        <div className="text-xs text-gray-400 uppercase font-bold tracking-widest text-right">Treasury</div>
        <div className={`text-3xl font-black font-mono ${stats.money >= 0 ? 'text-green-400' : 'text-red-500'}`}>
          ${stats.money.toLocaleString()}
        </div>
        <div className="text-right text-xs text-gray-300 mt-1 font-mono">
          Day {stats.day}
        </div>
      </div>

      {/* Bottom: Tools & News */}
      <div className="flex items-end gap-4 w-full pointer-events-auto">
        {/* Toolbar */}
        <div className="flex-1 bg-slate-900/90 p-2 rounded-2xl border border-slate-700 shadow-2xl overflow-x-auto no-scrollbar">
          <div className="flex gap-2">
            {tools.map(type => (
              <ToolButton key={type} type={type} isSelected={selectedTool === type} onClick={() => onSelectTool(type)} money={stats.money} />
            ))}
          </div>
        </div>

        {/* News Feed Compact */}
        <div className="w-80 h-40 bg-slate-950/90 rounded-xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
          <div className="bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-slate-800 flex justify-between items-center">
            <span>City Feed</span>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
          </div>

          {/* Scanline effect */}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,rgba(255,255,255,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] opacity-30 z-20"></div>

          <div ref={newsRef} className="flex-1 overflow-y-auto p-2 md:p-3 space-y-2 text-[10px] md:text-xs font-mono scroll-smooth mask-image-b z-10">
            {newsFeed.length === 0 && <div className="text-gray-500 italic text-center mt-10">No active news stream.</div>}
            {newsFeed.map((news) => (
              <div key={news.id} className={`
                border-l-2 pl-2 py-1 transition-all animate-fade-in leading-tight relative
                ${news.type === 'positive' ? 'border-green-500 text-green-200 bg-green-900/20' : ''}
                ${news.type === 'negative' ? 'border-red-500 text-red-200 bg-red-900/20' : ''}
                ${news.type === 'neutral' ? 'border-blue-400 text-blue-100 bg-blue-900/20' : ''}
              `}>
                <span className="opacity-70 text-[8px] absolute top-0.5 right-1">{new Date(Number(news.id.split('.')[0])).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {news.text}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* AI Goal Panel Floating */}
      <div className={`absolute bottom-24 right-4 w-80 bg-indigo-900/90 text-white rounded-xl border-2 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.4)] backdrop-blur-md overflow-hidden transition-all pointer-events-auto`}>
        <div className="bg-indigo-800/80 px-3 md:px-4 py-1.5 md:py-2 flex justify-between items-center border-b border-indigo-600">
          <span className="font-bold uppercase text-[10px] md:text-xs tracking-widest flex items-center gap-2 shadow-sm">
            <>
              <span className={`w-2 h-2 rounded-full ${isGeneratingGoal ? 'bg-yellow-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`}></span>
              AI Advisor
            </>
          </span>
          {isGeneratingGoal && <span className="text-[10px] animate-pulse text-yellow-300 font-mono">Thinking...</span>}
        </div>

        <div className="p-3 md:p-4">
          {currentGoal ? (
            <>
              <p className="text-xs md:text-sm font-medium text-indigo-100 mb-2 md:mb-3 leading-tight drop-shadow">"{currentGoal.description}"</p>

              <div className="flex justify-between items-center mt-1 md:mt-2 bg-indigo-950/60 p-1.5 md:p-2 rounded-lg border border-indigo-700/50">
                <div className="text-[10px] md:text-xs text-gray-300">
                  Goal: <span className="font-mono font-bold text-white">
                    {currentGoal.targetType === 'building_count' ? BUILDINGS[currentGoal.buildingType!].name :
                      currentGoal.targetType === 'money' ? '$' : 'Pop.'} {currentGoal.targetValue}
                  </span>
                </div>
                <div className="text-[10px] md:text-xs text-yellow-300 font-bold font-mono bg-yellow-900/50 px-2 py-0.5 rounded border border-yellow-600/50">
                  +${currentGoal.reward}
                </div>
              </div>

              {currentGoal.completed && (
                <button
                  onClick={onClaimReward}
                  className="mt-2 md:mt-3 w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-1.5 md:py-2 px-4 rounded shadow-[0_0_15px_rgba(34,197,94,0.6)] transition-all animate-bounce text-xs md:text-sm uppercase tracking-wide border border-green-400/50"
                >
                  Collect Reward
                </button>
              )}
            </>
          ) : (
            <div className="text-xs md:text-sm text-gray-400 py-2 italic flex items-center gap-2">
              <svg className="animate-spin h-3 w-3 md:h-4 md:w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analyzing city data...
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default UIOverlay;