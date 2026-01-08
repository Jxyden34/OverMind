/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useRef, useState } from 'react';
import { BuildingType, CityStats, AIGoal, NewsItem, WeatherType, DisasterType, ActiveDisaster } from '../types';
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
  neonMode: boolean;
  onToggleNeon: () => void;
  weather: WeatherType;
  activeDisaster: ActiveDisaster | null;
  onTriggerDisaster: () => void;
}

const tools = [
  BuildingType.None,
  BuildingType.Road,
  BuildingType.Residential,
  BuildingType.Apartment,
  BuildingType.Mansion,
  BuildingType.Commercial,
  BuildingType.Industrial,
  BuildingType.Park,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.Police,
  BuildingType.FireStation,
  BuildingType.GoldMine,
  BuildingType.Casino,
  BuildingType.Bridge
];

const ToolButton = ({ type, isSelected, onClick, money }: { type: BuildingType, isSelected: boolean, onClick: () => void, money: number }) => {
  const config = BUILDINGS[type];
  const canAfford = money >= config.cost;
  return (
    <button
      onClick={onClick}
      disabled={!canAfford && type !== BuildingType.None}
      className={`
        relative group flex-shrink-0 flex flex-col items-center justify-center w-24 h-24 rounded-2xl border-2 transition-all
        ${isSelected ? 'border-cyan-400 bg-cyan-900/80 shadow-[0_0_20px_rgba(34,211,238,0.6)] scale-105 z-10' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700'}
        ${!canAfford && type !== BuildingType.None ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}
      `}
    >
      <div className={`text-4xl mb-2 ${isSelected ? 'animate-bounce' : ''}`}>
        {type === BuildingType.None ? '🚜' :
          type === BuildingType.Road ? '🛣️' :
            type === BuildingType.Residential ? '🏠' :
              type === BuildingType.Commercial ? '🏪' :
                type === BuildingType.Industrial ? '🏭' :
                  type === BuildingType.Park ? '🌳' :
                    type === BuildingType.Police ? '🚓' :
                      type === BuildingType.FireStation ? '🚒' :
                        type === BuildingType.School ? '🏫' :
                          type === BuildingType.Hospital ? '🏥' :
                            type === BuildingType.GoldMine ? '💰' :
                              type === BuildingType.Apartment ? '🏢' :
                                type === BuildingType.Mansion ? '🏰' :
                                  type === BuildingType.Casino ? '🎰' :
                                    type === BuildingType.Bridge ? '🌉' : '❓'}
      </div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-center leading-none text-white shadow-black drop-shadow-md">
        {config.name}
      </div>
      {config.cost > 0 && (
        <div className={`text-[10px] font-mono mt-1 ${canAfford ? 'text-green-300' : 'text-red-400'}`}>
          ${config.cost}
        </div>
      )}
    </button>
  );
};

const StatusRow = ({ label, value, color }: { label: string, value: string, color: string }) => (
  <div className="flex justify-between items-center text-xl my-1.5">
    <span className="text-gray-400 font-medium">{label}</span>
    <span className={`font-mono font-bold ${color} text-2xl`}>{value}</span>
  </div>
);

const CityStatusPanel = ({ stats }: { stats: CityStats }) => (
  <div className="bg-slate-900/95 p-6 rounded-2xl border-2 border-slate-600 shadow-2xl backdrop-blur-xl w-96 md:w-[28rem]">
    <div className="text-base font-black uppercase tracking-widest text-gray-300 mb-5 border-b-2 border-slate-600 pb-2">City Status</div>
    <div className="space-y-1.5">
      <StatusRow label="Population" value={stats.population.toLocaleString()} color="text-cyan-300" />
      <StatusRow label="Happiness" value={`${Math.round(stats.happiness)}%`} color={stats.happiness > 80 ? 'text-green-400' : stats.happiness > 40 ? 'text-yellow-400' : 'text-red-500'} />
      <StatusRow label="Education" value={`${Math.round(stats.education)}%`} color="text-blue-300" />
      <StatusRow label="Safety" value={`${Math.round(stats.safety)}%`} color="text-indigo-300" />

      <StatusRow label="Crime Risk" value={stats.crimeRate > 0 ? `${stats.crimeRate}` : 'Low'} color={stats.crimeRate > 20 ? 'text-red-500' : 'text-gray-400'} />
      <StatusRow label="Pollution" value={stats.pollutionLevel > 0 ? `${stats.pollutionLevel}` : 'Clean'} color={stats.pollutionLevel > 20 ? 'text-lime-400' : 'text-emerald-400'} />

      <div className="h-px bg-slate-700 my-1.5" />

      <StatusRow label="Unemployment" value={`${Math.round(stats.jobs.unemployment * 100)}%`} color={stats.jobs.unemployment < 0.1 ? 'text-green-400' : 'text-red-400'} />
      <StatusRow label="Jobs" value={stats.jobs.total.toLocaleString()} color="text-orange-300" />
      <StatusRow label="Tax Rate" value={`${Math.round(stats.taxRate * 100)}%`} color="text-yellow-200" />

      <div className="h-px bg-slate-700 my-1.5" />

      <StatusRow label="Income" value={`+$${stats.budget.income}`} color="text-green-400" />
      <StatusRow label="Expenses" value={`-$${stats.budget.expenses}`} color="text-red-400" />
    </div>
  </div>
);

const AiControlPanel = ({ status, onReset }: { status: string, onReset: () => void }) => (
  <div className="bg-indigo-950/90 p-4 rounded-xl border border-indigo-500/30 shadow-xl backdrop-blur-md w-64 md:w-72">
    <div className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3 border-b border-indigo-800 pb-2">AI Status</div>
    <div className="text-sm text-indigo-200 mb-4 leading-tight min-h-[1.5em]">{status}</div>
    <button onClick={onReset} className="w-full py-1.5 bg-red-900/50 hover:bg-red-800/80 border border-red-700 text-red-200 text-[10px] font-bold uppercase rounded transition-colors">
      Reset City
    </button>
  </div>
);

const UIOverlay: React.FC<UIOverlayProps> = ({
  stats, selectedTool, onSelectTool, currentGoal, newsFeed, onClaimReward, isGeneratingGoal,
  onCycleTax, onTakeLoan, onRepayLoan, onBuyShares, onSellShares, onResetCity,
  neonMode, onToggleNeon, weather, activeDisaster, onTriggerDisaster
}) => {
  const newsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (newsRef.current) newsRef.current.scrollTop = newsRef.current.scrollHeight;
  }, [newsFeed]);

  const aiStatus = isGeneratingGoal ? "AI is analyzing city state..." : (currentGoal ? `Focus: ${currentGoal.description.substring(0, 30)}...` : "Idle");

  return (
    <div className="absolute inset-0 pointer-events-none p-4 font-sans z-10 flex flex-col justify-between">

      {/* Top Left: Panels */}
      <div className="flex flex-col gap-4 items-start pointer-events-auto">
        <CityStatusPanel stats={stats} />

        {/* News Feed Moved Here */}
        <div className="w-96 md:w-[28rem] h-72 bg-slate-950/95 rounded-2xl border-2 border-slate-700 shadow-2xl overflow-hidden flex flex-col">
          <div className="bg-slate-900 px-5 py-3 text-base font-black uppercase tracking-widest text-gray-300 border-b-2 border-slate-700 flex justify-between items-center">
            <span>City Feed</span>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
          </div>

          {/* Scanline effect */}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,rgba(255,255,255,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] opacity-30 z-20"></div>

          <div ref={newsRef} className="flex-1 overflow-y-auto p-4 space-y-3 text-sm md:text-base font-mono scroll-smooth mask-image-b z-10">
            {newsFeed.length === 0 && <div className="text-gray-500 italic text-center mt-10 text-lg">No active news stream.</div>}
            {newsFeed.map((news) => (
              <div key={news.id} className={`
                border-l-4 pl-3 py-2 transition-all animate-fade-in leading-snug relative
                ${news.type === 'positive' ? 'border-green-500 text-green-200 bg-green-900/30' : ''}
                ${news.type === 'negative' ? 'border-red-500 text-red-200 bg-red-900/30' : ''}
                ${news.type === 'neutral' ? 'border-blue-400 text-blue-100 bg-blue-900/30' : ''}
              `}>
                <span className="opacity-70 text-[11px] uppercase font-bold absolute top-1 right-2">{new Date(Number(news.id.split('.')[0])).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="block mt-4">{news.text}</span>
              </div>
            ))}
          </div>
        </div>


      </div>

      {/* Emergency Banner */}
      {activeDisaster && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-8 py-3 rounded-xl border-4 border-red-400 shadow-[0_0_30px_rgba(220,38,38,0.8)] animate-pulse z-50 flex flex-col items-center">
          <div className="text-2xl font-black uppercase tracking-widest flex items-center gap-4">
            <span className="animate-bounce">⚠️</span>
            {activeDisaster.type === DisasterType.Meteor ? 'METEOR INBOUND' :
              activeDisaster.type === DisasterType.AlienInvasion ? 'ALIEN INVASION' :
                activeDisaster.type === DisasterType.SolarFlare ? 'SOLAR FLARE DETECTED' : 'EMERGENCY'}
            <span className="animate-bounce">⚠️</span>
          </div>
          <div className="text-xs font-mono mt-1 uppercase opacity-90">
            {activeDisaster.stage === 'WARNING' ? 'SEEK SHELTER IMMEDIATELY' : 'CRITICAL FAILURE IMMINENT'}
          </div>
        </div>
      )}

      {/* Top Right: Treasury & Settings */}
      <div className="absolute top-4 right-4 flex flex-col gap-3 items-end pointer-events-auto">
        <div className="bg-slate-900/95 p-6 rounded-2xl border-2 border-slate-600 shadow-2xl backdrop-blur-xl w-96 md:w-[28rem]">
          <div className="text-base font-black uppercase tracking-widest text-gray-300 mb-2 border-b-2 border-slate-600 pb-2 flex justify-between">
            <span>Treasury</span>
            <span className="text-sm">Day {stats.day}</span>
          </div>
          <div className={`text-5xl font-black font-mono text-right my-4 ${stats.money >= 0 ? 'text-green-400' : 'text-red-500'}`}>
            ${stats.money.toLocaleString()}
          </div>
          <div className="text-right text-sm mt-2 border-t-2 border-slate-700 pt-2 flex justify-between items-center">
            <span className="text-gray-400 uppercase text-xs font-bold tracking-wider">Weather Condition</span>
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none" title={weather}>
                {weather === WeatherType.Clear ? '☀️' :
                  weather === WeatherType.Rain ? '🌧️' :
                    weather === WeatherType.Snow ? '🌨️' :
                      weather === WeatherType.Fog ? '🌫️' :
                        weather === WeatherType.AcidRain ? '🧪' : '❓'}
              </span>
              <span className="text-sm font-mono font-bold text-white">{weather}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <button onClick={onCycleTax} className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] uppercase font-bold py-1 px-2 rounded border border-slate-600 backdrop-blur">
            Cycle Tax
          </button>
          <div className="flex gap-1">
            <button onClick={onTakeLoan} className="flex-1 bg-green-900/60 hover:bg-green-800 text-green-100 text-[10px] uppercase font-bold py-1 px-2 rounded border border-green-700 backdrop-blur">
              Loan (+5k)
            </button>
            <button onClick={onRepayLoan} className="flex-1 bg-red-900/60 hover:bg-red-800 text-red-100 text-[10px] uppercase font-bold py-1 px-2 rounded border border-red-700 backdrop-blur">
              Repay
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={onBuyShares} className="flex-1 bg-blue-900/60 hover:bg-blue-800 text-blue-100 text-[10px] uppercase font-bold py-1 px-2 rounded border border-blue-700 backdrop-blur">
              Buy Stock
            </button>
            <button onClick={onSellShares} className="flex-1 bg-yellow-900/60 hover:bg-yellow-800 text-yellow-100 text-[10px] uppercase font-bold py-1 px-2 rounded border border-yellow-700 backdrop-blur">
              Sell Stock
            </button>
          </div>
        </div>

        <button
          onClick={onToggleNeon}
          className={`
            mt-2 px-3 py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-widest transition-all shadow-lg backdrop-blur-md
            ${neonMode
              ? 'bg-fuchsia-900/80 border-fuchsia-500 text-fuchsia-200 shadow-[0_0_15px_rgba(232,121,249,0.5)]'
              : 'bg-slate-900/80 border-slate-600 text-slate-400 hover:bg-slate-800'
            }
          `}
        >
          {neonMode ? 'Neon Mode: ON' : 'Neon Mode: OFF'}
        </button>
      </div>

      {/* Bottom: Tools Only (Feed Moved) */}
      <div className="flex items-end gap-4 w-full pointer-events-auto justify-center">
        {/* Toolbar Centered or Full Width */}
        <div className="bg-slate-900/90 p-2 rounded-2xl border border-slate-700 shadow-2xl overflow-x-auto no-scrollbar max-w-[90vw]">
          <div className="flex gap-2">
            {tools.map(type => (
              <ToolButton key={type} type={type} isSelected={selectedTool === type} onClick={() => onSelectTool(type)} money={stats.money} />
            ))}
          </div>
        </div>
      </div>

      {/* AI Goal Panel Floating (Matched Size) */}
      <div className={`absolute bottom-32 right-8 w-96 md:w-[28rem] bg-indigo-900/95 text-white rounded-2xl border-2 border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.5)] backdrop-blur-md overflow-hidden transition-all pointer-events-auto transform scale-100 hover:scale-105 origin-bottom-right`}>
        <div className="bg-indigo-800/90 px-6 py-4 flex justify-between items-center border-b border-indigo-600">
          <span className="font-bold uppercase text-base tracking-widest flex items-center gap-3 shadow-sm">
            <>
              <span className={`w-4 h-4 rounded-full ${isGeneratingGoal ? 'bg-yellow-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`}></span>
              AI Advisor
            </>
          </span>
          {isGeneratingGoal && <span className="text-sm animate-pulse text-yellow-300 font-mono">Thinking...</span>}
        </div>

        <div className="p-6">
          {currentGoal ? (
            <>
              <p className="text-lg font-medium text-indigo-50 mb-5 leading-relaxed drop-shadow">"{currentGoal.description}"</p>

              <div className="flex justify-between items-center mt-2 bg-indigo-950/60 p-3 rounded-lg border border-indigo-700/50">
                <div className="text-xs text-gray-300 uppercase font-bold tracking-wider">
                  Target: <span className="font-mono font-bold text-white text-sm ml-2">
                    {currentGoal.targetType === 'building_count' && currentGoal.buildingType && BUILDINGS[currentGoal.buildingType]
                      ? BUILDINGS[currentGoal.buildingType].name
                      : currentGoal.targetType === 'money'
                        ? '$'
                        : 'Pop.'} {currentGoal.targetValue}
                  </span>
                </div>
                <div className="text-xs text-yellow-300 font-bold font-mono bg-yellow-900/50 px-3 py-1 rounded-full border border-yellow-600/50 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                  +${currentGoal.reward}
                </div>
              </div>

              {currentGoal.completed && (
                <button
                  onClick={onClaimReward}
                  className="mt-4 w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_20px_rgba(34,197,94,0.6)] transition-all animate-bounce text-sm uppercase tracking-wide border border-green-400/50"
                >
                  Collect Reward
                </button>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-400 py-4 italic flex items-center gap-3 justify-center">
              <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analyzing city metrics...
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default UIOverlay;